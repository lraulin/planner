import type { SettingsSnapshot } from "./queries";
import { describeScope, parseScope } from "./scopes";
import { parseSavedViews, type SavedView } from "./views";

const MODULE_LABELS = {
  outline: "Outline",
  projects: "Projects",
  tasks: "Tasks",
  goals: "Goals",
  wishes: "Wish List",
  "result-areas": "Result Areas",
  chooser: "Task Chooser",
  schedule: "Weekly Schedule",
  metrics: "Metrics",
  notes: "Notes",
  "time-charts": "Time Charts",
  resources: "Resources",
  contacts: "Contacts",
  finances: "Finances",
  amazon: "Amazon orders",
} as const;

const MODULE_ORDER = Object.keys(MODULE_LABELS) as (keyof typeof MODULE_LABELS)[];

export type PreferenceEntry = {
  scope: string;
  label: string;
  detail: string;
  savedView: boolean;
  /** Only legacy/unknown rows show their storage id, so they never become unreachable. */
  showScopeId: boolean;
};

export type PreferenceGroup = {
  id: string;
  label: string;
  entries: PreferenceEntry[];
  /** Ordinary scopes reset by the group's confirmed batch action. */
  resetScopes: string[];
};

type Catalogues = Map<string, Map<string, SavedView>>;

function cataloguesFrom(snapshot: SettingsSnapshot): Catalogues {
  const catalogues: Catalogues = new Map();
  for (const [scope, value] of Object.entries(snapshot)) {
    const parsed = parseScope(scope);
    if (parsed?.kind !== "views" || parsed.key === null) continue;
    catalogues.set(
      parsed.key,
      new Map(parseSavedViews(value).views.map((view) => [view.id, view])),
    );
  }
  return catalogues;
}

function humanize(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function knownModule(value: string): value is keyof typeof MODULE_LABELS {
  return value in MODULE_LABELS;
}

function savedView(
  catalogues: Catalogues,
  moduleId: string,
  viewId: string,
): SavedView | null {
  return catalogues.get(moduleId)?.get(viewId) ?? null;
}

function moduleEntry(
  scope: string,
  catalogues: Catalogues,
): { moduleId: string; entry: PreferenceEntry } | null {
  const parsed = parseScope(scope);
  if (!parsed) return null;

  if (parsed.kind === "grid" && parsed.key) {
    const separator = parsed.key.indexOf(".");
    const moduleId = separator === -1 ? parsed.key : parsed.key.slice(0, separator);
    if (!knownModule(moduleId)) return null;
    const viewId = separator === -1 ? null : parsed.key.slice(separator + 1);
    const saved = viewId ? savedView(catalogues, moduleId, viewId) : null;
    return {
      moduleId,
      entry: {
        scope,
        label: saved?.name ?? (viewId ? `${humanize(viewId)} view` : "Default view"),
        detail: "Columns, filters, sorting, grouping, and density",
        savedView: saved !== null,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "chooser" && parsed.key) {
    const saved = savedView(catalogues, "chooser", parsed.key);
    return {
      moduleId: "chooser",
      entry: {
        scope,
        label: saved?.name ?? `${humanize(parsed.key)} view`,
        detail: "Scoring weights and chooser options",
        savedView: saved !== null,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "notes" && parsed.key) {
    const saved = savedView(catalogues, "notes", parsed.key);
    return {
      moduleId: "notes",
      entry: {
        scope,
        label:
          saved?.name ??
          (parsed.key === "filter" ? "Default view options" : humanize(parsed.key)),
        detail: "Mode, sort, and note filters",
        savedView: saved !== null,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "outline" && parsed.key) {
    return {
      moduleId: "outline",
      entry: {
        scope,
        label: humanize(parsed.key),
        detail: "Outline display options",
        savedView: false,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "schedule" && parsed.key === null) {
    return {
      moduleId: "schedule",
      entry: {
        scope,
        label: "Calendar layout",
        detail: "Slot height and work-week display",
        savedView: false,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "insights" && parsed.key === null) {
    return {
      moduleId: "finances",
      entry: {
        scope,
        label: "Insights dashboard",
        detail: "Reporting window and monthly vs pay-period axis",
        savedView: false,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "shell" && parsed.key === null) {
    return {
      moduleId: "planner",
      entry: {
        scope,
        label: "Navigation",
        detail: "Sidebar sections and commands panel",
        savedView: false,
        showScopeId: false,
      },
    };
  }

  if (parsed.kind === "drawer" && parsed.key === null) {
    return {
      moduleId: "planner",
      entry: {
        scope,
        label: "Detail drawer",
        detail: "Last-opened tabs and drawer layout",
        savedView: false,
        showScopeId: false,
      },
    };
  }

  // Display is edited and individually reset in General. View catalogues are identity,
  // not layout state, and are deliberately never offered as a reset row.
  if (parsed.kind === "display" || parsed.kind === "views") return null;

  return null;
}

function isSavedViewScope(scope: string, catalogues: Catalogues): boolean {
  const parsed = parseScope(scope);
  if (!parsed?.key) return false;

  if (parsed.kind === "grid") {
    const separator = parsed.key.indexOf(".");
    if (separator === -1) return false;
    return (
      savedView(
        catalogues,
        parsed.key.slice(0, separator),
        parsed.key.slice(separator + 1),
      ) !== null
    );
  }

  if (parsed.kind === "chooser") {
    return savedView(catalogues, "chooser", parsed.key) !== null;
  }
  if (parsed.kind === "notes") {
    return savedView(catalogues, "notes", parsed.key) !== null;
  }
  return false;
}

/** Scopes a global reset may remove without deleting or changing named saved views. */
export function bulkResetScopes(snapshot: SettingsSnapshot): string[] {
  const catalogues = cataloguesFrom(snapshot);
  return Object.keys(snapshot)
    .filter((scope) => snapshot[scope] !== undefined)
    .filter((scope) => parseScope(scope)?.kind !== "views")
    .filter((scope) => !isSavedViewScope(scope, catalogues))
    .sort();
}

/** Human reset rows grouped by the module they affect, with legacy rows kept reachable. */
export function buildPreferenceGroups(snapshot: SettingsSnapshot): PreferenceGroup[] {
  const catalogues = cataloguesFrom(snapshot);
  const entriesByModule = new Map<string, PreferenceEntry[]>();
  const other: PreferenceEntry[] = [];

  for (const scope of Object.keys(snapshot).sort()) {
    if (snapshot[scope] === undefined) continue;
    const resolved = moduleEntry(scope, catalogues);
    if (resolved) {
      const entries = entriesByModule.get(resolved.moduleId) ?? [];
      entries.push(resolved.entry);
      entriesByModule.set(resolved.moduleId, entries);
      continue;
    }

    const parsed = parseScope(scope);
    if (parsed?.kind === "views" || parsed?.kind === "display") continue;
    other.push({
      scope,
      label: describeScope(scope),
      detail: "Stored by an older or unrecognized Planner version",
      savedView: false,
      showScopeId: true,
    });
  }

  const order = ["planner", ...MODULE_ORDER];
  const groups: PreferenceGroup[] = [];
  for (const moduleId of order) {
    const entries = entriesByModule.get(moduleId);
    if (!entries || entries.length === 0) continue;
    entries.sort((left, right) => left.label.localeCompare(right.label));
    groups.push({
      id: moduleId,
      label:
        moduleId === "planner"
          ? "Planner"
          : MODULE_LABELS[moduleId as keyof typeof MODULE_LABELS],
      entries,
      resetScopes: entries
        .filter((entry) => !entry.savedView)
        .map((entry) => entry.scope),
    });
  }

  if (other.length > 0) {
    groups.push({
      id: "other",
      label: "Other",
      entries: other,
      resetScopes: other.map((entry) => entry.scope),
    });
  }
  return groups;
}
