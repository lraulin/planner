import { parseCrossColumnFilter, type CrossColumnFilter } from "@/lib/grid/crossFilter";
import { parseColumnFilter, type ColumnFilter } from "@/lib/grid/customFilter";
import {
  asClampedNumber,
  asMap,
  asOneOf,
  asRecord,
  asString,
  asStringArray,
} from "./parse";
import {
  DEFAULT_DENSITY,
  GRID_DENSITIES,
  MAX_COLUMN_WIDTH,
  MAX_SORT_KEYS,
  MIN_COLUMN_WIDTH,
  SORT_DIRECTIONS,
  type GridDensity,
  type GridSort,
} from "./grid";
import { SETTINGS_VERSION } from "./scopes";

/**
 * Views the user saved, for one tab. Stored under `views:{tabId}`.
 *
 * A view is the full set of **customizable** grid settings under a name. Saving one is
 * naming the grid in front of you; Reset this grid returns to that snapshot. The fields
 * that deliberately stay out are the ones that are not per-view by design:
 * `includeDeferred` (tab-wide) and `view` (which view is selected).
 *
 * Module-owned settings that no column can hold (Chooser weights, Notes mode) hang off the
 * view id in their own scopes and are forked on save via `viewScopes` — they are not in this
 * blob because their shape is the module's, not the grid's.
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
  /** Column widths at save time. Empty means every column uses its declared track. */
  widths: Record<string, number>;
  filters: Record<string, ColumnFilter>;
  /** Cross-column advanced filter. Null / absent means none — same as a built-in view. */
  advancedFilter: CrossColumnFilter | null;
  /** Quick-search text. Empty means inactive. */
  search: string;
  /** Sort keys, primary first. Empty means unsorted. */
  sorts: GridSort[];
  groupBy: string[];
  /** Which group headers were collapsed. */
  collapsedGroups: string[];
  density: GridDensity;
  /**
   * Toolbar switch positions, by the id the tab declares. Merged *under* the grid's own
   * stored switches — see `resolveSwitches` in `grid.ts`.
   */
  switches: Record<string, boolean>;
};

export type DefaultViewSeed = {
  id: string;
  name: string;
  base: string | null;
  settings: SavedViewSettings;
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
  /**
   * Factory definition for a shipped default view.
   *
   * Null means this is user-created. When present, rename/edit/delete never lose the
   * original definition: restore can put it back exactly.
   */
  defaultSeed: DefaultViewSeed | null;
};

export type SavedViews = { views: SavedView[]; deletedDefaults: DefaultViewSeed[] };

export const NO_SAVED_VIEWS: SavedViews = { views: [], deletedDefaults: [] };

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

  const deletedDefaults = Array.isArray(record.deletedDefaults)
    ? parseDeletedDefaults(record.deletedDefaults)
    : [];

  return { views: views.slice(0, MAX_SAVED_VIEWS), deletedDefaults };
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
    widths: asMap(record.widths, (entry) =>
      typeof entry === "number" && Number.isFinite(entry)
        ? asClampedNumber(entry, MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)
        : null,
    ),
    filters: asMap(record.filters, (entry) => parseColumnFilter(entry)),
    // Absent on views saved before a field was captured — degrades to the empty / none choice.
    advancedFilter: parseCrossColumnFilter(record.advancedFilter),
    search: typeof record.search === "string" ? record.search : "",
    sorts: parseViewSorts(record),
    groupBy: asStringArray(record.groupBy, []),
    collapsedGroups: asStringArray(record.collapsedGroups, []),
    density: asOneOf(record.density, GRID_DENSITIES, DEFAULT_DENSITY),
    switches: asMap(record.switches, (entry) =>
      typeof entry === "boolean" ? entry : null,
    ),
    defaultSeed: parseDefaultSeed(record.defaultSeed),
  };
}

function parseDeletedDefaults(value: unknown[]): DefaultViewSeed[] {
  const out: DefaultViewSeed[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const seed = parseDefaultSeed(entry);
    if (!seed || seen.has(seed.id)) continue;
    seen.add(seed.id);
    out.push(seed);
  }
  return out;
}

function parseDefaultSeed(value: unknown): DefaultViewSeed | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id, "");
  const name = asString(record.name, "").trim();
  if (!isValidViewId(id) || name === "") return null;
  const settings = asRecord(record.settings);
  const parsed = parseSavedView({
    id,
    name,
    base: record.base,
    order: settings?.order,
    widths: settings?.widths,
    filters: settings?.filters,
    advancedFilter: settings?.advancedFilter,
    search: settings?.search,
    sorts: settings?.sorts,
    groupBy: settings?.groupBy,
    collapsedGroups: settings?.collapsedGroups,
    density: settings?.density,
    switches: settings?.switches,
  });
  if (!parsed) return null;
  return {
    id,
    name,
    base: parsed.base,
    settings: snapshotSettings(parsed),
  };
}

function parseViewSorts(record: Record<string, unknown>): GridSort[] {
  if (!Array.isArray(record.sorts)) return [];
  const seen = new Set<string>();
  const out: GridSort[] = [];
  for (const entry of record.sorts) {
    const row = asRecord(entry);
    if (!row) continue;
    const columnId = asString(row.columnId, "");
    if (!columnId || seen.has(columnId)) continue;
    seen.add(columnId);
    out.push({
      columnId,
      direction: asOneOf(row.direction, SORT_DIRECTIONS, "asc"),
    });
    if (out.length >= MAX_SORT_KEYS) break;
  }
  return out;
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
    ...saved,
    views: [...saved.views, { ...view, name: uniqueViewName(saved, view.name) }],
  };
}

export function removeSavedView(saved: SavedViews, id: string): SavedViews {
  const removed = saved.views.find((view) => view.id === id) ?? null;
  const views = saved.views.filter((view) => view.id !== id);
  if (!removed?.defaultSeed) return { ...saved, views };
  const without = saved.deletedDefaults.filter((entry) => entry.id !== removed.id);
  return { views, deletedDefaults: [...without, removed.defaultSeed] };
}

export function renameSavedView(
  saved: SavedViews,
  id: string,
  name: string,
): SavedViews {
  const without = removeSavedView(saved, id);
  return {
    ...saved,
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
    ...saved,
    views: saved.views.map((view) =>
      view.id === id ? { ...view, ...settings } : view,
    ),
  };
}

export function findSavedView(saved: SavedViews, id: string): SavedView | null {
  return saved.views.find((view) => view.id === id) ?? null;
}

export function reconcileDefaultViews(
  saved: SavedViews,
  defaults: readonly DefaultViewSeed[],
): SavedViews {
  if (defaults.length === 0) return saved;

  const defaultsById = new Map(defaults.map((entry) => [entry.id, entry]));
  const defaultIds = new Set(defaultsById.keys());
  const viewsById = new Map(saved.views.map((view) => [view.id, view]));
  const deleted = new Set(saved.deletedDefaults.map((entry) => entry.id));
  let changed = false;

  const views = saved.views.map((view) => {
    const seed = defaultsById.get(view.id);
    if (!seed) return view;
    const next = withDefaultSeed(view, seed);
    if (next !== view) changed = true;
    deleted.delete(seed.id);
    return next;
  });

  // Shipped defaults bypass the user-created cap: they were always present in the old
  // separate optgroup and must not be omitted because the user's Save-as copies filled up.
  for (const seed of defaultsById.values()) {
    if (viewsById.has(seed.id) || deleted.has(seed.id)) continue;
    const currentSaved: SavedViews = { views, deletedDefaults: saved.deletedDefaults };
    views.push(
      defaultViewFromSeed({ ...seed, name: uniqueViewName(currentSaved, seed.name) }),
    );
    changed = true;
  }

  const deletedDefaults = saved.deletedDefaults.filter((entry) =>
    defaultIds.has(entry.id),
  );
  if (deletedDefaults.length !== saved.deletedDefaults.length) changed = true;

  return changed ? { views, deletedDefaults } : saved;
}

export function restoreDefaultViews(saved: SavedViews): SavedViews {
  const restored: SavedView[] = [];

  for (const view of saved.views) {
    if (!view.defaultSeed) {
      restored.push(view);
      continue;
    }
    const seed = view.defaultSeed;
    // If a user view already occupies the factory name, suffix the restored default.
    const name = uniqueViewName({ views: restored, deletedDefaults: [] }, seed.name);
    restored.push({
      ...view,
      name,
      base: seed.base,
      ...seed.settings,
    });
  }

  const byId = new Set(restored.map((view) => view.id));
  for (const seed of saved.deletedDefaults) {
    if (byId.has(seed.id)) continue;
    const currentSaved: SavedViews = { views: restored, deletedDefaults: [] };
    restored.push(
      defaultViewFromSeed({ ...seed, name: uniqueViewName(currentSaved, seed.name) }),
    );
  }
  return { views: restored, deletedDefaults: [] };
}

function defaultViewFromSeed(seed: DefaultViewSeed): SavedView {
  return {
    id: seed.id,
    name: seed.name,
    base: seed.base,
    ...seed.settings,
    defaultSeed: seed,
  };
}

function withDefaultSeed(view: SavedView, seed: DefaultViewSeed): SavedView {
  if (stableEqual(view.defaultSeed, seed)) return view;
  return { ...view, defaultSeed: seed };
}

function snapshotSettings(view: SavedView): SavedViewSettings {
  return {
    order: view.order,
    widths: view.widths,
    filters: view.filters,
    advancedFilter: view.advancedFilter,
    search: view.search,
    sorts: view.sorts,
    groupBy: view.groupBy,
    collapsedGroups: view.collapsedGroups,
    density: view.density,
    switches: view.switches,
  };
}

export function viewSnapshotEquals(
  a: SavedViewSettings,
  b: SavedViewSettings,
): boolean {
  return (
    sameList(a.order, b.order) &&
    sameNumberMap(a.widths, b.widths) &&
    stableEqual(a.filters, b.filters) &&
    stableEqual(a.advancedFilter, b.advancedFilter) &&
    a.search === b.search &&
    stableEqual(a.sorts, b.sorts) &&
    sameList(a.groupBy, b.groupBy) &&
    sameSet(a.collapsedGroups, b.collapsedGroups) &&
    a.density === b.density &&
    sameBoolMap(a.switches, b.switches)
  );
}

function sameList(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const other = new Set(right);
  return left.every((value) => other.has(value));
}

function sameNumberMap(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => right[key] === left[key]);
}

function sameBoolMap(
  left: Record<string, boolean>,
  right: Record<string, boolean>,
): boolean {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => right[key] === left[key]);
}

function stableEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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
