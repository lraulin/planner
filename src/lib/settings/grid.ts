import {
  asClampedNumber,
  asMap,
  asOneOf,
  asRecord,
  asString,
  asStringArray,
} from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * What a grid tab remembers between sessions, stored under scope `grid:{tabId}`.
 *
 * Column *order* is nullable on purpose: null means "use whatever preset this view
 * declares", which is not the same as an empty layout and cannot be represented by one.
 * Views change their presets as tabs gain columns, and a stored `[]` would pin a tab to a
 * layout the user never chose.
 */

export type SortDirection = "asc" | "desc";
export const SORT_DIRECTIONS: readonly SortDirection[] = ["asc", "desc"];

export type GridSort = { columnId: string; direction: SortDirection };

export type GridSettings = {
  /** Visible column ids in order, or null to follow the view's preset. */
  order: string[] | null;
  /** Column id → pixel width, overriding the column's declared track. */
  widths: Record<string, number>;
  /** Column id → selected filter option ids, OR'd together. */
  filters: Record<string, string[]>;
  sort: GridSort | null;
  collapsedGroups: string[];
  /** Sub-view / scope picker selection, or null to follow the tab's default. */
  view: string | null;
  /**
   * Whether postponed / deferred rows appear in the Tasks and Projects grids.
   * Defaults to **showing** them: the hidden set now includes every routine between
   * cycles, so default-hidden would make a task vanish the moment you tick it.
   */
  includeDeferred: boolean;
};

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  order: null,
  widths: {},
  filters: {},
  /**
   * Achieve's Projects / Tasks / Outline views open sorted by priority. Tabs without a
   * `priority` column ignore this (DataGrid only sorts when `sortValue` exists). Clearing
   * the sort chip restores manual / tree order for that tab.
   */
  sort: { columnId: "priority", direction: "asc" },
  collapsedGroups: [],
  view: null,
  includeDeferred: true,
};

/**
 * Column widths are written straight into `grid-template-columns`, so they are stored as
 * numbers and rendered as `px` rather than kept as free-text CSS tracks. A blob edited by
 * hand can then make a column comically narrow, but it cannot inject a track expression.
 *
 * The floor is a usable click target; the ceiling stops one column from pushing every
 * other off screen with no way back but the reset button.
 */
export const MIN_COLUMN_WIDTH = 40;
export const MAX_COLUMN_WIDTH = 1200;

export function parseGridSettings(value: unknown): GridSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_GRID_SETTINGS;

  return {
    order: Array.isArray(record.order) ? asStringArray(record.order, []) : null,
    widths: asMap(record.widths, (entry) =>
      typeof entry === "number" && Number.isFinite(entry)
        ? asClampedNumber(entry, MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)
        : null,
    ),
    filters: asMap(record.filters, (entry) =>
      Array.isArray(entry) ? asStringArray(entry, []) : null,
    ),
    sort: parseSort(record.sort),
    collapsedGroups: asStringArray(record.collapsedGroups, []),
    view: typeof record.view === "string" ? record.view : null,
    // Absent or garbage → show. Hiding is the deliberate choice; an old blob without the
    // field must not suddenly empty the grid of every routine between cycles.
    includeDeferred:
      typeof record.includeDeferred === "boolean" ? record.includeDeferred : true,
  };
}

function parseSort(value: unknown): GridSort | null {
  const record = asRecord(value);
  if (!record) return null;

  const columnId = asString(record.columnId, "");
  if (!columnId) return null;

  return { columnId, direction: asOneOf(record.direction, SORT_DIRECTIONS, "asc") };
}

export function serializeGridSettings(settings: GridSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}

/** Whether any column filter is actually narrowing the rows. */
export function hasActiveFilters(filters: Record<string, string[]>): boolean {
  return Object.values(filters).some((ids) => ids.length > 0 && !ids.includes("all"));
}
