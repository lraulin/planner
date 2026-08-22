/**
 * Scope ids for `user_settings` rows, and the rules for what counts as one.
 *
 * A scope is `{kind}` or `{kind}:{key}`. Keeping the id parseable — rather than an opaque
 * string chosen at each call site — is what lets the reset page label rows it has never
 * heard of, and what lets a write reject junk before it reaches the table.
 */

/**
 * Bumped only when a payload shape changes in a way defaults cannot absorb.
 *
 * **2** — grid `filters` became nullable, so a stored `{}` could finally mean "the user
 * cleared everything" rather than "untouched". `parseGridSettings` reads this to tell the two
 * apart in blobs written before the change; nothing else reads it.
 *
 * **3** — sorts, density, search, widths and collapsedGroups became nullable so a saved view
 * can supply them as defaults. Absent still means "follow the view"; a concrete value
 * (including `[]` / `{}` / `""`) is a deliberate choice. Older blobs always carried concrete
 * values and keep behaving as before.
 */
export const SETTINGS_VERSION = 3;

export const SCOPE_KINDS = [
  "grid",
  "views",
  "chooser",
  "outline",
  "notes",
  "drawer",
  "shell",
  "schedule",
  "display",
  "insights",
  "payday",
  "budget",
  "timeline",
  "find",
] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

/** Kinds that take a key (`grid:tasks`); the rest are singletons (`drawer`). */
const KEYED: ReadonlySet<ScopeKind> = new Set<ScopeKind>([
  "grid",
  "views",
  "chooser",
  "outline",
  "notes",
]);

/**
 * Keys are ours, not the user's — tab ids and view ids from module constants. The pattern
 * is deliberately narrow so a scope can never carry whitespace, a second `:`, or anything
 * else that would make `parseScope` ambiguous.
 *
 * A `.` separates a tab from its view (`projects.active-status`), because column layout and
 * filters are per view: the Tasks tab's four views show different columns, and one stored
 * layout across all of them would fight whichever view you were not looking at.
 */
const KEY_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;

export type ParsedScope = { kind: ScopeKind; key: string | null };

function isKind(value: string): value is ScopeKind {
  return (SCOPE_KINDS as readonly string[]).includes(value);
}

/** `null` for anything that is not a scope this app writes. */
export function parseScope(scope: string): ParsedScope | null {
  const separator = scope.indexOf(":");
  const kind = separator === -1 ? scope : scope.slice(0, separator);
  const key = separator === -1 ? null : scope.slice(separator + 1);

  if (!isKind(kind)) return null;
  if (KEYED.has(kind)) {
    if (key === null || !KEY_PATTERN.test(key)) return null;
  } else if (key !== null) {
    return null;
  }

  return { kind, key };
}

export function isValidScope(scope: string): boolean {
  return parseScope(scope) !== null;
}

export function gridScope(tabId: string): string {
  return `grid:${tabId}`;
}

/**
 * A tab's saved views — the **catalogue** of what each one is. How you have since adjusted
 * one lives in its own `grid:{tab}.{viewId}` scope, exactly as a built-in view's does.
 */
export function viewsScope(tabId: string): string {
  return `views:${tabId}`;
}

export function chooserScope(viewId: string): string {
  return `chooser:${viewId}`;
}

/**
 * The Notes module's **default** view's own settings — mode, sort and the filter dialog.
 *
 * Kept under its original key rather than renamed to match the view: this is where every
 * existing mode and saved filter already lives, and Notes gaining a view picker must not reset
 * them. See `notesViewScope`.
 */
export const NOTES_FILTER_SCOPE = "notes:filter";

/** The Notes module's default view id — the one whose settings stay at `notes:filter`. */
export const NOTES_DEFAULT_VIEW_ID = "notes";

/**
 * The working-set extras key (`chooser:working`; Notes maps it onto `notes:filter`).
 *
 * Not a view the picker can select. Built-in and saved ids must not use it.
 */
export const WORKING_VIEW_ID = "working";

/**
 * Notes' own settings for one view.
 *
 * Notes has module settings that no column can carry — nested vs flat, the sort, the filter
 * dialog — and once views exist they belong to the view, exactly as the Task Chooser's weights
 * always have (`chooserScope`). A saved Notes view therefore gets its own scope, keyed by the
 * same id as its grid state.
 *
 * Takes the plain selected view id, so a module can hand the same function to
 * `useModuleViews`' `viewScopes` and have saving fork the right row.
 */
export function notesViewScope(viewId: string): string {
  // `working` shares the historic default row so existing Nested/Flat settings become
  // the working set instead of being orphaned under `notes:working`.
  return viewId === NOTES_DEFAULT_VIEW_ID || viewId === WORKING_VIEW_ID
    ? NOTES_FILTER_SCOPE
    : `notes:${viewId}`;
}

export const DRAWER_SCOPE = "drawer";
export const SHELL_SCOPE = "shell";

/** The week calendar's own drawing settings — slot height and Work Week Mode. */
export const SCHEDULE_SCOPE = "schedule";

/** The Finances insights dashboard's window and axis. */
export const INSIGHTS_SCOPE = "insights";

/**
 * A correction to the detected pay cadence, for the Finances dashboard's day count.
 *
 * Configuration rather than view state, and the odd one out in this file for that reason. It
 * lives here anyway because it is small, per-user, and already carried to the client by
 * `loadSettingsForSession()` — the alternative, a column on `users`, would be a migration and a
 * second delivery path to reach the one component that reads it.
 */
export const PAYDAY_SCOPE = "payday";

/**
 * Where the envelope budget begins, and what it started with.
 *
 * Configuration, like `payday` above, and here for the same reasons. Its whole job is to keep
 * the budget from having to reason about three years of history: the fold seeds
 * "funds from last month" at the start month with the recorded opening position and treats
 * every earlier month as absent
 * (`agent-os/specs/2026-08-22-1948-zero-based-budget/` D2).
 */
export const BUDGET_SCOPE = "budget";

/** Cross-module display policy, currently the standalone calendar-day format. */
export const DISPLAY_SCOPE = "display";

/** Which way the Library Timeline page is drawing itself, and the ribbon's zoom. */
export const TIMELINE_SCOPE = "timeline";

const KIND_LABELS: Record<ScopeKind, string> = {
  grid: "Grid",
  views: "Saved views",
  chooser: "Task Chooser",
  outline: "Outline",
  notes: "Notes",
  drawer: "Detail drawer",
  shell: "App shell",
  schedule: "Weekly Schedule",
  display: "Display",
  insights: "Finances insights",
  payday: "Pay cadence",
  budget: "Budget setup",
  timeline: "Timeline",
  find: "Advanced Find",
};

/** `projects.active-status` → `Projects / Active status`. */
function humanizeKey(key: string): string {
  return key
    .split(".")
    .map((part) => {
      const spaced = part.replace(/-/g, " ");
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    })
    .join(" / ");
}

/**
 * A label for the reset page. Falls back to the raw scope rather than hiding a row it
 * cannot name — an unresettable orphan row is worse than an ugly label.
 */
export function describeScope(scope: string): string {
  const parsed = parseScope(scope);
  if (!parsed) return scope;
  if (parsed.key === null) return KIND_LABELS[parsed.kind];
  return `${KIND_LABELS[parsed.kind]} — ${humanizeKey(parsed.key)}`;
}
