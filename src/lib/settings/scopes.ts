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
 */
export const SETTINGS_VERSION = 2;

export const SCOPE_KINDS = [
  "grid",
  "views",
  "chooser",
  "outline",
  "notes",
  "drawer",
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

export const NOTES_FILTER_SCOPE = "notes:filter";
export const DRAWER_SCOPE = "drawer";

const KIND_LABELS: Record<ScopeKind, string> = {
  grid: "Grid",
  views: "Saved views",
  chooser: "Task Chooser",
  outline: "Outline",
  notes: "Notes",
  drawer: "Detail drawer",
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
