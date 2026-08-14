import type { SettingsSnapshot } from "./queries";
import { describeScope, parseScope } from "./scopes";
import {
  parseSavedViews,
  restoreDefaultViews,
  serializeSavedViews,
  viewSnapshotEquals,
  type DefaultViewSeed,
  type SavedViews,
  type SavedView,
} from "./views";

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
} as const;

const MODULE_ORDER = Object.keys(MODULE_LABELS) as (keyof typeof MODULE_LABELS)[];

export type PreferenceEntry = {
  scope: string;
  label: string;
  detail: string;
  viewEntry: boolean;
  defaultView: boolean;
  /** Only legacy/unknown rows show their storage id, so they never become unreachable. */
  showScopeId: boolean;
};

export type PreferenceGroup = {
  id: string;
  label: string;
  entries: PreferenceEntry[];
  /** Ordinary scopes reset by the group's confirmed batch action. */
  resetScopes: string[];
  /** Whether this module has at least one shipped default view definition. */
  hasDefaultViews: boolean;
};

type Catalogues = Map<string, Map<string, SavedView>>;
type DeletedDefaultModules = Set<string>;

function cataloguesFrom(snapshot: SettingsSnapshot): {
  catalogues: Catalogues;
  deletedDefaultModules: DeletedDefaultModules;
} {
  const catalogues: Catalogues = new Map();
  const deletedDefaultModules: DeletedDefaultModules = new Set();
  for (const [scope, value] of Object.entries(snapshot)) {
    const parsed = parseScope(scope);
    if (parsed?.kind !== "views" || parsed.key === null) continue;
    const parsedViews = parseSavedViews(value);
    catalogues.set(
      parsed.key,
      new Map(parsedViews.views.map((view) => [view.id, view])),
    );
    if (parsedViews.deletedDefaults.length > 0) {
      deletedDefaultModules.add(parsed.key);
    }
  }
  return { catalogues, deletedDefaultModules };
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
        viewEntry: saved !== null,
        defaultView: saved?.defaultSeed != null,
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
        viewEntry: saved !== null,
        defaultView: saved?.defaultSeed != null,
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
        viewEntry: saved !== null,
        defaultView: saved?.defaultSeed != null,
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
        viewEntry: false,
        defaultView: false,
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
        viewEntry: false,
        defaultView: false,
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
        viewEntry: false,
        defaultView: false,
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
        viewEntry: false,
        defaultView: false,
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
        viewEntry: false,
        defaultView: false,
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
  const { catalogues } = cataloguesFrom(snapshot);
  return Object.keys(snapshot)
    .filter((scope) => snapshot[scope] !== undefined)
    .filter((scope) => parseScope(scope)?.kind !== "views")
    .filter((scope) => !isSavedViewScope(scope, catalogues))
    .sort();
}

/** Human reset rows grouped by the module they affect, with legacy rows kept reachable. */
export function buildPreferenceGroups(snapshot: SettingsSnapshot): PreferenceGroup[] {
  const { catalogues, deletedDefaultModules } = cataloguesFrom(snapshot);
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
      viewEntry: false,
      defaultView: false,
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
        .filter((entry) => !entry.viewEntry)
        .map((entry) => entry.scope),
      hasDefaultViews:
        entries.some((entry) => entry.defaultView) ||
        deletedDefaultModules.has(moduleId),
    });
  }

  if (other.length > 0) {
    groups.push({
      id: "other",
      label: "Other",
      entries: other,
      resetScopes: other.map((entry) => entry.scope),
      hasDefaultViews: false,
    });
  }
  return groups;
}

export type ScopeWrite = { scope: string; value: unknown };

export function restoreDefaultViewScopeWrites(
  snapshot: SettingsSnapshot,
  moduleId?: string,
): ScopeWrite[] {
  const writes: ScopeWrite[] = [];
  for (const [scope, raw] of Object.entries(snapshot)) {
    const parsed = parseScope(scope);
    if (parsed?.kind !== "views" || parsed.key === null) continue;
    if (moduleId && parsed.key !== moduleId) continue;
    const current = parseSavedViews(raw);
    const restored = restoreDefaultViews(current);
    if (savedViewsEqual(restored, current)) continue;
    writes.push({ scope, value: serializeSavedViews(restored) });
  }
  return writes;
}

function savedViewsEqual(left: SavedViews, right: SavedViews): boolean {
  if (left.views.length !== right.views.length) return false;
  if (left.deletedDefaults.length !== right.deletedDefaults.length) return false;

  for (let i = 0; i < left.views.length; i += 1) {
    const a = left.views[i];
    const b = right.views[i];
    if (!b) return false;
    if (a.id !== b.id || a.name !== b.name || a.base !== b.base) return false;
    if (!viewSnapshotEquals(a, b)) return false;
    if (!defaultSeedEqual(a.defaultSeed, b.defaultSeed)) return false;
  }

  for (let i = 0; i < left.deletedDefaults.length; i += 1) {
    if (!defaultSeedEqual(left.deletedDefaults[i], right.deletedDefaults[i]))
      return false;
  }

  return true;
}

function defaultSeedEqual(
  left: DefaultViewSeed | null | undefined,
  right: DefaultViewSeed | null | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.base === right.base &&
    viewSnapshotEquals(left.settings, right.settings)
  );
}
