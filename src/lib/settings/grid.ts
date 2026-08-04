import {
  filterActive,
  parseColumnFilter,
  type ColumnFilter,
} from "@/lib/grid/customFilter";
import {
  crossFilterActive,
  parseCrossColumnFilter,
  type CrossColumnFilter,
} from "@/lib/grid/crossFilter";
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

export type GridDensity = "comfortable" | "compact";
export const GRID_DENSITIES: readonly GridDensity[] = ["comfortable", "compact"];

/**
 * How many sort keys one grid may hold. A fourth tiebreak has never decided anything a user
 * could see, and the numbered header indicators stop reading as ranks past three.
 */
export const MAX_SORT_KEYS = 3;

export type GridSettings = {
  /** Visible column ids in order, or null to follow the view's preset. */
  order: string[] | null;
  /** Column id → pixel width, overriding the column's declared track. */
  widths: Record<string, number>;
  /**
   * Column id → checklist option ids (`mode: "options"`) or a multi-condition custom
   * filter (`mode: "custom"`). The two modes are mutually exclusive per column.
   */
  filters: Record<string, ColumnFilter>;
  /**
   * Cross-column And/Or expression from the advanced filter builder, ANDed with the
   * per-column filters above. Null when the user has never opened the builder.
   */
  advancedFilter: CrossColumnFilter | null;
  /** Quick-search text, matched across every filterable column. Empty means inactive. */
  search: string;
  /**
   * Sort keys, primary first. Empty means unsorted.
   *
   * Replaces a single nullable `sort`; `parseGridSettings` still reads the old shape so
   * blobs written before multi-sort keep their ordering instead of silently losing it.
   */
  sorts: GridSort[];
  /**
   * Group dimension ids, outer first (see `GroupBy` in `@/lib/tree/slice`). Empty means
   * ungrouped. Stored as plain strings rather than the union so a dimension retired in a
   * later build degrades to "ungrouped" instead of failing to parse.
   */
  groupBy: string[];
  collapsedGroups: string[];
  density: GridDensity;
  /** Sub-view / scope picker selection, or null to follow the tab's default. */
  view: string | null;
  /**
   * Whether postponed / deferred rows appear in the Tasks and Projects grids.
   * Defaults to **showing** them: the hidden set now includes every routine between
   * cycles, so default-hidden would make a task vanish the moment you tick it.
   */
  includeDeferred: boolean;
  /**
   * Per-tab toolbar toggles, by the id the tab declares (`groups`, `includeGoals`,
   * `groupByArea`, …).
   *
   * Deliberately an open map rather than named fields: a tab adding a switch should not
   * have to edit this type, and a switch removed from a tab should leave a harmless orphan
   * key rather than a parse failure. The tab supplies the default for an absent id, because
   * only the tab knows whether "off" or "on" is the sane starting point — see
   * `includeDeferred` above for why that matters.
   */
  switches: Record<string, boolean>;
};

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  order: null,
  widths: {},
  filters: {},
  advancedFilter: null,
  search: "",
  /**
   * Achieve opens prioritized grids sorted by priority. Sibling drag rewrites letter/rank
   * among the destination parent's children, so a priority sort stays meaningful after a
   * drop (we only clear the chip when the active sort is something other than priority).
   * Tabs without a `priority` column ignore this (DataGrid only sorts when `sortValue`
   * exists).
   */
  sorts: [{ columnId: "priority", direction: "asc" }],
  /** Ungrouped by default; each tab opts in through its own preset. */
  groupBy: [],
  collapsedGroups: [],
  density: "comfortable",
  view: null,
  includeDeferred: true,
  switches: {},
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
    filters: asMap(record.filters, (entry) => parseColumnFilter(entry)),
    advancedFilter: parseCrossColumnFilter(record.advancedFilter),
    search: asString(record.search, ""),
    sorts: parseSorts(record),
    groupBy: asStringArray(record.groupBy, []),
    collapsedGroups: asStringArray(record.collapsedGroups, []),
    density: asOneOf(record.density, GRID_DENSITIES, "comfortable"),
    view: typeof record.view === "string" ? record.view : null,
    // Absent or garbage → show. Hiding is the deliberate choice; an old blob without the
    // field must not suddenly empty the grid of every routine between cycles.
    includeDeferred:
      typeof record.includeDeferred === "boolean" ? record.includeDeferred : true,
    switches: asMap(record.switches, (entry) =>
      typeof entry === "boolean" ? entry : null,
    ),
  };
}

/**
 * Sort keys from either shape.
 *
 * `sorts` is the current field. A blob predating multi-sort has a single nullable `sort`
 * instead; read it rather than dropping to the default, or every grid the user had sorted
 * would silently jump back to priority on the first load after the upgrade. Same
 * back-compatibility contract as `parseColumnFilter`'s legacy bare `string[]`.
 *
 * An explicitly empty `sorts` array is honoured as "unsorted" and does **not** fall through
 * to the legacy key — see the note at the top of `./parse`.
 */
function parseSorts(record: Record<string, unknown>): GridSort[] {
  if (Array.isArray(record.sorts)) {
    const parsed = record.sorts
      .map((entry) => parseSort(entry))
      .filter((entry): entry is GridSort => entry !== null);
    return dedupeByColumn(parsed).slice(0, MAX_SORT_KEYS);
  }

  const legacy = parseSort(record.sort);
  return legacy ? [legacy] : [];
}

/** A column may hold only one sort key; the first occurrence wins. */
function dedupeByColumn(sorts: GridSort[]): GridSort[] {
  const seen = new Set<string>();
  const out: GridSort[] = [];
  for (const sort of sorts) {
    if (seen.has(sort.columnId)) continue;
    seen.add(sort.columnId);
    out.push(sort);
  }
  return out;
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
export function hasActiveFilters(filters: Record<string, ColumnFilter>): boolean {
  return Object.values(filters).some(filterActive);
}

/**
 * Whether *anything* is narrowing the rows — column filters, the advanced filter, or the
 * quick search.
 *
 * This is what "Clear all" and the chip bar key off. `hasActiveFilters` alone would leave a
 * user staring at a filtered grid with a disabled clear button because the only thing
 * narrowing it was the search box.
 */
export function hasAnyNarrowing(settings: GridSettings): boolean {
  return (
    hasActiveFilters(settings.filters) ||
    crossFilterActive(settings.advancedFilter) ||
    settings.search.trim() !== ""
  );
}
