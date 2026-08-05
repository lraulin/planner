import { parseColumnFilter, type ColumnFilter } from "@/lib/grid/customFilter";
import { asMap, asRecord, asString, asStringArray } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * Views the user saved, for one tab. Stored under `views:{tabId}`.
 *
 * This became worth building the moment a view stopped being a mode. `data-grid.md` used to
 * list user-saved views under "what we deliberately do not do", with the condition *revisit
 * when the presets demonstrably do not cover it* — and the honest reading now is that a saved
 * view is not a new feature at all. A view is already nothing but a column order, a set of
 * filters and a grouping; saving one is copying three values the grid is holding anyway.
 *
 * **What a saved view captures, and what it deliberately does not.** Order, filters, grouping
 * and switches. The first three already distinguish "the user has not chosen" from "the user
 * chose this" — see the nullable fields in `grid.ts`. Switches join them without needing that
 * distinction at all, because each switch is its own key: `resolveSwitches` falls back per id,
 * so there is no whole-map "cleared" state to represent and no migration to pay for.
 *
 * Sort and density stay out. Every stored blob carries a concrete `sorts` array, so a view
 * default could never win against one, and `sorts: []` legitimately means "unsorted" rather
 * than "unset". Capturing them *would* need the nullable treatment and a migration.
 *
 * `includeDeferred` stays out for a different reason: `data-grid.md` keeps it on the tab scope
 * on purpose, so it is not a per-view setting to capture.
 */

/**
 * The settings half of a view — everything except which view it is.
 *
 * Separate from the identity fields so `updateSavedView` cannot overwrite a name, an id, or a
 * `base` while writing the grid back: "update the settings, keep the view" is a fact about the
 * type rather than a rule the call site has to remember.
 */
export type SavedViewSettings = {
  /** Visible column ids in order. Null follows the tab's preset, as everywhere else. */
  order: string[] | null;
  filters: Record<string, ColumnFilter>;
  groupBy: string[];
  /**
   * Toolbar switch positions, by the id the tab declares. Merged *under* the grid's own
   * stored switches — see `resolveSwitches` in `grid.ts`.
   */
  switches: Record<string, boolean>;
};

export type SavedView = SavedViewSettings & {
  /** Scope-safe and stable: it becomes the key of `grid:{tab}.{id}`. */
  id: string;
  name: string;
  /**
   * The **built-in** view this one was saved from, or null for "the module's default".
   *
   * Needed because some modules resolve *behaviour* from the view id rather than only
   * defaults: the Task Chooser's `chooserView`, `parseChooserSettings` and `buildChooserItems`
   * all take a `ChooserViewId`, and `saved-a1b2c3d4` is not one of the five. `base` is what
   * they get fed instead.
   *
   * Always a built-in, never another saved view — `baseViewId` follows a chain if a hand-edited
   * blob contains one, but `save` resolves through at write time so none is created. A
   * two-level chain would make deleting the middle view silently re-base the last.
   */
  base: string | null;
};

export type SavedViews = { views: SavedView[] };

export const NO_SAVED_VIEWS: SavedViews = { views: [] };

/**
 * How many a tab may hold. Not a storage limit — a picker you have to scroll is a picker that
 * has stopped being faster than setting the filters by hand.
 */
export const MAX_SAVED_VIEWS = 20;

/**
 * Ids must survive `parseScope`'s key pattern and must not contain the `.` that separates a
 * tab from its view. Generated at the call site so this module stays pure and its tests stay
 * deterministic.
 */
export function isValidViewId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,31}$/.test(id);
}

export function parseSavedViews(value: unknown): SavedViews {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.views)) return NO_SAVED_VIEWS;

  const views: SavedView[] = [];
  const seen = new Set<string>();

  for (const entry of record.views) {
    const view = parseSavedView(entry);
    // A duplicate id would make two picker entries share one grid scope, so the first wins
    // rather than the pair silently editing each other.
    if (!view || seen.has(view.id)) continue;
    seen.add(view.id);
    views.push(view);
  }

  return { views: views.slice(0, MAX_SAVED_VIEWS) };
}

function parseSavedView(value: unknown): SavedView | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = asString(record.id, "");
  const name = asString(record.name, "").trim();
  if (!isValidViewId(id) || name === "") return null;

  return {
    id,
    name,
    // A base that no longer names a built-in is not rejected here — `baseViewId` degrades it to
    // the module's default. Views outlive the presets they were saved from.
    base: isValidViewId(asString(record.base, "")) ? asString(record.base, "") : null,
    order: Array.isArray(record.order) ? asStringArray(record.order, []) : null,
    filters: asMap(record.filters, (entry) => parseColumnFilter(entry)),
    groupBy: asStringArray(record.groupBy, []),
    switches: asMap(record.switches, (entry) =>
      typeof entry === "boolean" ? entry : null,
    ),
  };
}

export function serializeSavedViews(saved: SavedViews): unknown {
  return { v: SETTINGS_VERSION, ...saved };
}

/**
 * A name no other view on this tab is using, so the picker never shows the same word twice
 * pointing at two different things.
 */
export function uniqueViewName(saved: SavedViews, wanted: string): string {
  const base = wanted.trim() || "Untitled view";
  const taken = new Set(saved.views.map((view) => view.name));
  if (!taken.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Append a view. At the cap the oldest is *not* evicted — silently losing one is worse. */
export function addSavedView(saved: SavedViews, view: SavedView): SavedViews {
  if (saved.views.length >= MAX_SAVED_VIEWS) return saved;
  if (saved.views.some((entry) => entry.id === view.id)) return saved;
  return {
    views: [...saved.views, { ...view, name: uniqueViewName(saved, view.name) }],
  };
}

export function removeSavedView(saved: SavedViews, id: string): SavedViews {
  return { views: saved.views.filter((view) => view.id !== id) };
}

export function renameSavedView(
  saved: SavedViews,
  id: string,
  name: string,
): SavedViews {
  const without = removeSavedView(saved, id);
  return {
    views: saved.views.map((view) =>
      view.id === id ? { ...view, name: uniqueViewName(without, name) } : view,
    ),
  };
}

/**
 * Write the grid back into the view you are on, keeping its identity.
 *
 * The counterpart to Save, and the reason Save stopped being the only command: without this,
 * adjusting a saved view and keeping the adjustment was impossible — every Save minted a new
 * view, so the picker filled up with "This week (2)", "This week (3)".
 */
export function updateSavedView(
  saved: SavedViews,
  id: string,
  settings: SavedViewSettings,
): SavedViews {
  return {
    views: saved.views.map((view) =>
      view.id === id ? { ...view, ...settings } : view,
    ),
  };
}

export function findSavedView(saved: SavedViews, id: string): SavedView | null {
  return saved.views.find((view) => view.id === id) ?? null;
}

/**
 * The built-in view whose defaults and behaviour apply to `viewId`.
 *
 * A built-in resolves to itself; a saved view to its `base`; anything unresolvable to
 * `defaultViewId`. This is what lets a module hand a saved view straight to code that only
 * understands its own preset ids.
 *
 * The loop exists for hand-edited blobs only. `save` resolves through, so a stored `base` never
 * names another saved view — but a chain read from the database must terminate rather than
 * hang, and the bound is the reason it cannot.
 */
export function baseViewId(
  views: readonly SavedView[],
  viewId: string,
  builtInIds: readonly string[],
  defaultViewId: string,
): string {
  let current = viewId;

  for (let hops = 0; hops <= views.length; hops += 1) {
    if (builtInIds.includes(current)) return current;
    const view = views.find((entry) => entry.id === current);
    if (!view?.base) break;
    current = view.base;
  }

  return defaultViewId;
}
