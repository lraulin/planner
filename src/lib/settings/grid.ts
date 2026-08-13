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
 * Several fields are nullable on purpose: null means "use whatever this view declares",
 * which is not the same as an empty choice and cannot be represented by one. That is what
 * lets a saved view restore sort, density, search and widths on Reset — the same contract
 * `order` and `filters` have always had.
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

/**
 * Achieve opens prioritized grids sorted by priority. Used when neither the grid scope nor
 * the view has chosen a sort — tabs without a `priority` column ignore it (DataGrid only
 * sorts when `sortValue` exists).
 */
export const DEFAULT_SORTS: GridSort[] = [{ columnId: "priority", direction: "asc" }];

export const DEFAULT_DENSITY: GridDensity = "comfortable";

export type GridSettings = {
  /** Visible column ids in order, or null to follow the view's preset. */
  order: string[] | null;
  /**
   * Column id → pixel width, or null to follow the view's saved widths.
   * `{}` is the deliberate "use every column's declared track".
   */
  widths: Record<string, number> | null;
  /**
   * Column id → checklist option ids (`mode: "options"`) or a multi-condition custom
   * filter (`mode: "custom"`). The two modes are mutually exclusive per column.
   *
   * **Null means "use the view's defaults", which is not the same as `{}`.** A view opens
   * with completed work hidden; clearing every chip has to be able to say "show me
   * everything" and *stay* said. Without the distinction a view could only have default
   * filters it was impossible to turn off. Same contract as `order` and `groupBy`.
   */
  filters: Record<string, ColumnFilter> | null;
  /**
   * Cross-column And/Or expression from the advanced filter builder, ANDed with the
   * per-column filters above.
   *
   * **Null means "use the view's default"** (same contract as `filters`). An empty
   * expression (`conditions: []`) is the deliberate clear — "no advanced filter", even when
   * the view was saved with one. Without that distinction, Clear all on a saved view would
   * either be impossible to persist or would restore the view's Filter… on the next read.
   */
  advancedFilter: CrossColumnFilter | null;
  /**
   * Quick-search text. **Null follows the view**; `""` is the deliberate clear.
   */
  search: string | null;
  /**
   * Sort keys, primary first. **Null follows the view** (or `DEFAULT_SORTS` when the view
   * has none). `[]` is the deliberate "unsorted".
   *
   * Replaces a single nullable `sort`; `parseGridSettings` still reads the old shape so
   * blobs written before multi-sort keep their ordering instead of silently losing it.
   */
  sorts: GridSort[] | null;
  /**
   * Group dimension ids, outer first (see `GridGroupBy` in `@/lib/grid/grouping`), or null
   * to follow the tab's own default.
   *
   * Nullable for the same reason `order` is, and it is the same distinction: null means
   * "whatever this tab groups by out of the box", `[]` means "the user turned grouping
   * off". Collapsing those two would make Group by → (None) un-representable on a tab that
   * groups by default, so choosing it would silently do nothing.
   *
   * Plain strings rather than the union so a dimension retired in a later build degrades to
   * ungrouped instead of failing to parse the whole layout.
   */
  groupBy: string[] | null;
  /**
   * Collapsed group ids. **Null follows the view**; `[]` means every group is open.
   */
  collapsedGroups: string[] | null;
  /**
   * Row density. **Null follows the view**; otherwise the concrete choice.
   */
  density: GridDensity | null;
  /** Sub-view / scope picker selection, or null to follow the tab's default. */
  view: string | null;
  /**
   * Whether postponed / deferred rows appear in the Tasks and Projects grids.
   * Defaults to **showing** them: the hidden set now includes every routine between
   * cycles, so default-hidden would make a task vanish the moment you tick it.
   *
   * Lives on the **tab** scope, not per view — deliberately not part of a saved view.
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

/**
 * An empty / never-written grid scope. Null fields follow the view (or the tab fallbacks
 * in `useGridState`); concrete empties would pin "unsorted" / "no widths" forever.
 */
export const DEFAULT_GRID_SETTINGS: GridSettings = {
  order: null,
  widths: null,
  filters: null,
  advancedFilter: null,
  search: null,
  sorts: null,
  groupBy: null,
  collapsedGroups: null,
  density: null,
  view: null,
  includeDeferred: true,
  switches: {},
};

/**
 * The scope with everything **the view owns** cleared, and everything the *module* owns
 * kept.
 *
 * A grid scope is not purely per-view: the working set (`grid:{module}`) also holds `view`
 * — the origin definition — and `includeDeferred`, both tab-level. So "put this working
 * set back to the origin" cannot be a scope reset: that would forget which view you had
 * just loaded.
 *
 * Everything else is per-view by construction — it is exactly what `snapshotOf` captures.
 */
export function clearViewSettings(settings: GridSettings): GridSettings {
  return {
    ...DEFAULT_GRID_SETTINGS,
    view: settings.view,
    includeDeferred: settings.includeDeferred,
  };
}

/**
 * Whether the working set is holding any view-owned override.
 *
 * Null fields follow the origin definition, so a loaded view is clean. A concrete value —
 * including `[]` / `{}` / `""` — is a tweak, which is what makes the picker show
 * Unsaved changes while still naming the active view.
 *
 * `view` and `includeDeferred` are not view-owned; they do not count.
 */
export function hasViewOverrides(settings: GridSettings): boolean {
  return (
    settings.order !== null ||
    settings.widths !== null ||
    settings.filters !== null ||
    settings.advancedFilter !== null ||
    settings.search !== null ||
    settings.sorts !== null ||
    settings.groupBy !== null ||
    settings.collapsedGroups !== null ||
    settings.density !== null ||
    Object.keys(settings.switches).length > 0
  );
}

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
    widths: parseWidths(record),
    filters: parseFilters(record),
    advancedFilter: parseCrossColumnFilter(record.advancedFilter),
    search: parseSearch(record),
    sorts: parseSorts(record),
    groupBy: Array.isArray(record.groupBy) ? asStringArray(record.groupBy, []) : null,
    collapsedGroups: parseCollapsedGroups(record),
    density: parseDensity(record),
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
 * Stored filters, or null to follow the view's defaults.
 *
 * **The v1 migration lives here.** Version 1 had no way to say "cleared": every grid
 * serialized `filters: {}` whether or not the user had ever opened a funnel, so an empty map
 * from a v1 blob cannot be read as a deliberate choice and follows the defaults instead. A v1
 * blob with real filters keeps them, and from v2 on an empty map means exactly what it says.
 *
 * The cost is one-time and small: a v1 grid the user had genuinely cleared comes back with
 * its view's defaults once. The alternative is a default nobody who already used the app
 * would ever see.
 */
function parseFilters(
  record: Record<string, unknown>,
): Record<string, ColumnFilter> | null {
  if (!asRecord(record.filters)) return null;

  const filters = asMap(record.filters, (entry) => parseColumnFilter(entry));
  const version = typeof record.v === "number" ? record.v : 1;
  if (version < 2 && Object.keys(filters).length === 0) return null;

  return filters;
}

/** Absent → follow the view; present map (even empty) → that choice. */
function parseWidths(record: Record<string, unknown>): Record<string, number> | null {
  if (!("widths" in record) || record.widths === null) return null;
  if (!asRecord(record.widths)) return null;
  return asMap(record.widths, (entry) =>
    typeof entry === "number" && Number.isFinite(entry)
      ? asClampedNumber(entry, MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)
      : null,
  );
}

/** Absent → follow the view; present string (even empty) → that choice. */
function parseSearch(record: Record<string, unknown>): string | null {
  if (!("search" in record) || record.search === null) return null;
  return typeof record.search === "string" ? record.search : "";
}

/** Absent → follow the view; present string → known density or comfortable. */
function parseDensity(record: Record<string, unknown>): GridDensity | null {
  if (!("density" in record) || record.density === null) return null;
  return asOneOf(record.density, GRID_DENSITIES, DEFAULT_DENSITY);
}

/** Absent → follow the view; present array (even empty) → that choice. */
function parseCollapsedGroups(record: Record<string, unknown>): string[] | null {
  if (!("collapsedGroups" in record) || record.collapsedGroups === null) return null;
  return Array.isArray(record.collapsedGroups)
    ? asStringArray(record.collapsedGroups, [])
    : [];
}

/**
 * Sort keys from either shape.
 *
 * `sorts` is the current field. A blob predating multi-sort has a single nullable `sort`
 * instead; read it rather than dropping to the default, or every grid the user had sorted
 * would silently jump back to priority on the first load after the upgrade.
 *
 * **Absent → null (follow the view).** An explicitly empty `sorts` array is "unsorted" and
 * does **not** fall through to the legacy key — see the note at the top of `./parse`.
 */
function parseSorts(record: Record<string, unknown>): GridSort[] | null {
  if (Array.isArray(record.sorts)) {
    const parsed = record.sorts
      .map((entry) => parseSort(entry))
      .filter((entry): entry is GridSort => entry !== null);
    return dedupeByColumn(parsed).slice(0, MAX_SORT_KEYS);
  }

  if ("sort" in record) {
    const legacy = parseSort(record.sort);
    return legacy ? [legacy] : [];
  }

  return null;
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
  // Null means "follow the view". Writing the key as JSON null makes `parseSearch` /
  // `parseDensity` treat it as present and coerce it to a concrete empty — the working
  // copy would look dirty the moment you Reset or Save.
  const blob: Record<string, unknown> = { v: SETTINGS_VERSION };
  for (const [key, value] of Object.entries(settings)) {
    if (value !== null && value !== undefined) blob[key] = value;
  }
  return blob;
}

/** Whether any column filter is actually narrowing the rows. */
export function hasActiveFilters(filters: Record<string, ColumnFilter>): boolean {
  return Object.values(filters).some(filterActive);
}

/**
 * A view's switch positions with the user's own adjustments on top.
 *
 * Three layers resolve per **key**, not per map: what the grid has stored wins, then what the
 * view was saved with, then the default the tab declared (`switchValue`, at the far end of this
 * chain, supplies that last one). That is why `switches` needed no nullable treatment and no
 * `SETTINGS_VERSION` bump, unlike `filters`: `Clear all` acts on the whole filter map, so `{}`
 * had to be distinguishable from "never touched", while a switch the user has not touched is
 * simply an absent key.
 *
 * Order matters and is the easy mistake: spread the other way and a view with a switch on
 * would override the user having just turned it off, which reads as the toggle being broken.
 */
export function resolveSwitches(
  viewSwitches: Record<string, boolean> | undefined,
  stored: Record<string, boolean>,
): Record<string, boolean> {
  if (!viewSwitches) return stored;
  return { ...viewSwitches, ...stored };
}

/**
 * Effective advanced filter from a stored blob and a view default.
 *
 * `null` follows the view (same as column `filters`). An empty expression is the deliberate
 * "cleared" state so Clear all can beat a saved view's Filter… without Reset. The three
 * states are easy to collapse into two by accident — this is the whole function.
 */
export function resolveAdvancedFilter(
  stored: CrossColumnFilter | null,
  viewDefault: CrossColumnFilter | null,
): CrossColumnFilter | null {
  if (stored === null) return viewDefault;
  return crossFilterActive(stored) ? stored : null;
}

/**
 * Whether *anything* is narrowing the rows — column filters, the advanced filter, or the
 * quick search.
 *
 * This is what "Clear all" and the chip bar key off. `hasActiveFilters` alone would leave a
 * user staring at a filtered grid with a disabled clear button because the only thing
 * narrowing it was the search box.
 */
export function hasAnyNarrowing(
  /** The **effective** filters — `settings.filters` resolved against the view's defaults. */
  filters: Record<string, ColumnFilter>,
  advancedFilter: CrossColumnFilter | null,
  search: string,
): boolean {
  return (
    hasActiveFilters(filters) ||
    crossFilterActive(advancedFilter) ||
    search.trim() !== ""
  );
}
