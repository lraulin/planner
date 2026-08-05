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
 * **What a saved view captures, and what it deliberately does not.** Order, filters and
 * grouping are exactly the three settings that already distinguish "the user has not chosen"
 * from "the user chose this" — see the nullable fields in `grid.ts`. Sort and density have no
 * such distinction: every stored blob carries a concrete `sorts` array, so a view default
 * could never win against one, and `sorts: []` legitimately means "unsorted" rather than
 * "unset". Capturing them would need a second migration to buy a fraction of the value, so a
 * saved view is the three that work and says so.
 */

/** The settings a saved view carries. A subset of `GridSettings`, by the note above. */
export type SavedView = {
  /** Scope-safe and stable: it becomes the key of `grid:{tab}.{id}`. */
  id: string;
  name: string;
  /** Visible column ids in order. Null follows the tab's preset, as everywhere else. */
  order: string[] | null;
  filters: Record<string, ColumnFilter>;
  groupBy: string[];
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
    order: Array.isArray(record.order) ? asStringArray(record.order, []) : null,
    filters: asMap(record.filters, (entry) => parseColumnFilter(entry)),
    groupBy: asStringArray(record.groupBy, []),
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

export function findSavedView(saved: SavedViews, id: string): SavedView | null {
  return saved.views.find((view) => view.id === id) ?? null;
}
