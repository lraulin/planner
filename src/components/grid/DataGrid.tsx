"use client";

import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { OutlineNode } from "@/lib/tree/types";
import type { GridRow } from "@/lib/tree/slice";
import type { GridDensity } from "@/lib/settings/grid";
import type { DropZone } from "@/lib/tree/dnd";
import { TYPE_LABELS } from "@/lib/tree/hierarchy";
import {
  alignClass,
  buildGridTemplate,
  type ColumnControls,
  type ColumnDef,
  type ColumnMeta,
  type NodeGridRow,
} from "./columns";
import { ColumnHeaderRow } from "./ColumnHeader";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { filterActive, rowPassesFilters, type ColumnFilter } from "@/lib/grid/filters";
import {
  crossFilterActive,
  rowPassesCrossFilter,
  type CrossColumnFilter,
} from "@/lib/grid/crossFilter";
import { withAncestors } from "@/lib/grid/ancestors";
import { collectColumnValues, distinctValuesOf } from "@/lib/grid/distinct";
import { rowMatchesSearch, searchActive } from "@/lib/grid/search";
import type { GridFilterValue } from "@/lib/grid/filterValue";
import { groupMembers } from "@/lib/grid/groupMembers";
import { totalsLayout } from "@/lib/grid/groupTotals";
import { sortRowsWithinGroups } from "@/lib/grid/sortRows";
import { applyGroupCollapse, dropEmptyGroups } from "@/lib/grid/collapse";
import { resolveCompactFields } from "@/lib/grid/compactFields";
import {
  exportableColumns,
  exportFilename,
  exportMimeType,
  FORMAT_EXTENSION,
  gridCopyCommands,
  gridExportCommands,
  gridExportFormatOf,
  serializeGridExport,
} from "@/lib/grid/exportCsv";
import { writeClipboardText } from "@/lib/tree/copyAsText";
import { useRegisterCommands } from "@/components/shell/CommandProvider";
import type { Command } from "@/lib/commands/registry";
import { useIsCompact } from "@/components/shell/useIsCompact";
import { CompactRow, type RowSwipe } from "./CompactRow";
import type { SelectAllState, SelectMods } from "@/lib/grid/selection";
import { NameIconContext } from "./nameIconContext";
import { RowDragHandleContext, type RowDragHandleApi } from "./rowDragContext";
import { RowSelectedContext } from "./rowSelectedContext";
import { SelectionCheckbox } from "./SelectionCheckbox";
import { downloadTextFile } from "./downloadCsv";

export type GridSortKey = { columnId: string; direction: "asc" | "desc" };

/**
 * The grid's sort, primary key first. An empty array is unsorted.
 *
 * A list rather than a single key so a secondary sort can break ties in the primary one —
 * "priority, then deadline" is the sort people actually want on a planning grid, and one
 * key can only approximate it.
 */
export type SortState = GridSortKey[];

/** Click / keyboard modifiers the host turns into multi-select. */
export type GridSelectMods = SelectMods;

/**
 * Opt-in row drag-and-drop. The grid owns the gesture — what counts as a "before" versus an
 * "inside", which row is lit, when the drop line is drawn — and the host owns the meaning:
 * `resolve` says whether a hover is legal and at what depth the indicator belongs, `onDrop`
 * performs the move. Tabs that pass nothing get the previous, undraggable grid.
 *
 * `dragIds` is the block being moved: a single id for a plain drag, or the multi-selection
 * in display order when the primary row was already selected. Hosts that care about tree
 * ancestry collapse that set to move-roots before writing.
 */
export type RowDrag = {
  resolve: (
    dragIds: readonly string[],
    targetId: string,
    zone: DropZone,
  ) => { depth: number } | null;
  onDrop: (dragIds: readonly string[], targetId: string, zone: DropZone) => void;
  /**
   * Hover-dwell on a collapsed row with the pointer in the "inside" third. The grid
   * owns the timer; the host expands and persists. Group headers expand themselves.
   */
  onExpand?: (id: string) => void;
};

type DropHint = { targetId: string; zone: DropZone; depth: number };

/** Bindings the grid hands one row so it can take part in a drag. */
type RowDragBinding = {
  dragging: boolean;
  hint: { zone: DropZone; depth: number } | null;
  /**
   * Selection for multi-drag is decided at mousedown on a handle, before dragstart, so a
   * plain press on an unselected handle still works as single-drag.
   */
  onHandleMouseDown: () => void;
  onStart: () => void;
  /** Returns whether the hover is a legal drop, which decides the cursor. */
  onOver: (zone: DropZone) => boolean;
  onLeave: () => void;
  onDrop: (zone: DropZone) => void;
  onEnd: () => void;
};

const EMPTY_EXPORT_COMMANDS: Command[] = [];

/**
 * Left gutter: wide enough for a 14px checkbox with padding, and — in `handle` mode — a
 * grab bar big enough to actually catch a press. One width for both, so the drop-line
 * offsets (`nameColumnLeft`) and the header/body templates do not have to care which.
 */
const HANDLE_WIDTH = "1.75rem";

/** Dwell on a collapsed row before it opens under a drag. */
const HOLD_EXPAND_MS = 500;

/**
 * What a row announces to assistive tech and whether it draws as expandable. These are the
 * only two things the grid needs to know about a row's payload, so they are props rather
 * than an `OutlineNode` dependency baked into the component. The defaults reproduce the
 * tree tabs' behaviour, which is why those tabs pass neither.
 */
type RowMeta<TRow> = {
  rowLabel?: (row: NodeGridRow<TRow>) => string;
  /** `true` expanded, `false` collapsed, `undefined` not expandable. */
  rowExpansion?: (row: NodeGridRow<TRow>) => boolean | undefined;
};

function isOutlineNode(node: unknown): node is OutlineNode {
  return typeof node === "object" && node !== null && "type" in node && "name" in node;
}

/**
 * Falling back to the outline's own labelling keeps the tree tabs from having to pass these;
 * a tab with a different row type supplies its own. Shared by the desktop row and the compact
 * one so the two cannot describe the same row differently.
 */
function rowLabelFor<TRow>(
  row: NodeGridRow<TRow>,
  rowLabel: RowMeta<TRow>["rowLabel"],
): string | undefined {
  if (rowLabel) return rowLabel(row);
  const node = row.node;
  return isOutlineNode(node)
    ? `${TYPE_LABELS[node.type]}: ${node.name || "Untitled"}`
    : undefined;
}

function rowExpansionFor<TRow>(
  row: NodeGridRow<TRow>,
  rowExpansion: RowMeta<TRow>["rowExpansion"],
): boolean | undefined {
  if (rowExpansion) return rowExpansion(row);
  const node = row.node;
  if (!isOutlineNode(node)) return undefined;
  // `branch` when the row set is a slice of the tree: a project with only tasks under it is
  // a leaf on the Projects tab and must not announce itself as expandable there.
  const hasChildren = row.branch?.hasChildren ?? node.hasChildren;
  return hasChildren ? !node.collapsed : undefined;
}

/**
 * Shared data grid: column-driven layout, optional sort and per-column filters, group
 * header rows, selection highlighting. Tree commands and optimistic patching stay in the
 * host tab — this component only renders a prepared `GridRow[]` against `ColumnDef[]`.
 *
 * The row payload is a type parameter defaulting to `OutlineNode`, so the Notes tab — whose
 * rows are notes, not nodes — reuses this grid instead of hand-rolling a second one the way
 * Wish List had to.
 */
export function DataGrid<TCtx, TRow = OutlineNode>({
  rows,
  narrowingRows,
  columns,
  allColumns,
  columnCtx,
  selectedId,
  selectedIds,
  onSelect,
  onOpenDetail,
  ariaLabel,
  empty,
  enableFilters = false,
  enableSort = false,
  sorts: controlledSorts,
  onSortChange,
  onSetSort,
  filters: controlledFilters,
  onFilterChange,
  advancedFilter = null,
  search = "",
  distinctValues: providedDistinctValues,
  onCountsChange,
  widths,
  onResizeColumn,
  onResetColumnWidth,
  columnControls,
  collapsedGroups,
  onToggleGroup,
  onGroupIdsChange,
  groupTotals,
  groupNote,
  groupChrome,
  footerTotals,
  onNavigableIdsChange,
  density = "comfortable",
  autoHeight = false,
  rowDrag,
  rowMenu,
  rowSwipe,
  rowLabel,
  rowExpansion,
  selectAllState,
  onToggleSelectAll,
  gutter = "checkbox",
  exportCommands: registerExportCommands = true,
  preparedDisplay = false,
  virtualize = false,
  pendingRowIds,
  preparedCounts,
  loadExportRows,
  onVisibleRange,
}: {
  rows: GridRow<TRow>[];
  /**
   * Rows filters, search, value lists and counts inspect. Tree hosts include descendants
   * rolled up under collapsed parents here even though `rows` omits them from the current
   * presentation. Defaults to `rows` for flat grids and already-expanded row sets.
   */
  narrowingRows?: GridRow<TRow>[];
  /** Visible columns, in order. These are the only ones that get a track and a cell. */
  columns: ColumnDef<TCtx, TRow>[];
  /**
   * Every column the tab defines, whether or not Show Fields is currently showing it.
   * Filtering and searching evaluate against this set, so a filter on a hidden column keeps
   * working — hiding a column is a layout choice, not a change to what you asked for.
   *
   * Defaults to `columns`, which is the old behaviour, for grids that offer no way to hide
   * a column in the first place.
   */
  allColumns?: ColumnDef<TCtx, TRow>[];
  columnCtx: TCtx;
  /** Primary / keyboard-focus row. */
  selectedId: string | null;
  /**
   * Multi-selection highlight. When omitted, only `selectedId` is lit — hosts that have
   * not adopted multi-select keep the old single-row look without extra wiring.
   */
  selectedIds?: ReadonlySet<string>;
  onSelect: (id: string, mods?: GridSelectMods) => void;
  onOpenDetail?: (id: string) => void;
  ariaLabel: string;
  empty?: ReactNode;
  enableFilters?: boolean;
  enableSort?: boolean;
  /** Header checkbox tri-state. Omit with `onToggleSelectAll` only if the host has no rows. */
  selectAllState?: SelectAllState;
  /** Header / compact select-all click. Hosts pass `useMultiSelect().toggleSelectAll`. */
  onToggleSelectAll?: () => void;
  /**
   * Desktop left-gutter chrome. `"checkbox"` is a selection box with a header select-all.
   * `"handle"` is a plain grab bar: click selects (Shift range, ⌘/Ctrl toggle) and the
   * whole width is the HTML5 drag source.
   *
   * **A grid that passes `rowDrag` must use `"handle"`.** A control in the gutter leaves
   * no grabbable track — that is how the checkbox broke Outline and Chooser drag. Compact
   * rows have no gutter and keep their checkbox either way.
   */
  gutter?: "checkbox" | "handle";
  /**
   * Register File ▸ Export / Copy for this grid. Default true so a lone grid keeps the
   * catalog complete. A page with more than one grid turns it off and registers its own
   * export instead — the Budget exports the page as one document
   * (`agent-os/specs/2026-08-28-0759-budget-single-export/` D1), which is what removed the
   * scoped per-grid rows this prop used to be paired with.
   */
  exportCommands?: boolean;
  /**
   * Rows are already the display list: do not filter, search, sort, or collapse them.
   * Register uses this with a server-prepared index. Every other grid omits it.
   */
  preparedDisplay?: boolean;
  /**
   * Mount only the rows in view. Opt-in so Outline drag and other local grids keep
   * mapping every row. Pair with `preparedDisplay` for the Register.
   */
  virtualize?: boolean;
  /** Unloaded prepared rows render as skeletons and should request their block. */
  pendingRowIds?: ReadonlySet<string>;
  /** Host-supplied Showing N of M when `preparedDisplay` skips local narrowing. */
  preparedCounts?: { shown: number; total: number };
  /** Export/Copy load the complete result instead of whatever is cached in the viewport. */
  loadExportRows?: () => Promise<NodeGridRow<TRow>[]>;
  /** Display-index range currently on screen, for prefetching prepared blocks. */
  onVisibleRange?: (start: number, end: number) => void;
  /**
   * Sort and filters are controlled when a host passes them, which is what lets a tab
   * persist them. Omitting both keeps the grid's own state, so a tab can adopt one at a
   * time — and so a grid with nothing to remember does not need a store.
   */
  sorts?: SortState;
  /** `additive` is a Shift-click: refine the existing sort rather than replacing it. */
  onSortChange?: (columnId: string, additive: boolean) => void;
  /**
   * Set one column's sort key outright, or drop it with `null`. The header's cycle cannot
   * express "make this descending" in one step, and a menu item that has to be clicked twice
   * to reach the direction it names is not a menu item.
   */
  onSetSort?: (columnId: string, direction: GridSortKey["direction"] | null) => void;
  filters?: Record<string, ColumnFilter>;
  onFilterChange?: (columnId: string, filter: ColumnFilter) => void;
  /**
   * Cross-column And/Or expression from the advanced filter builder, ANDed with the
   * per-column filters. Always controlled — there is no host-less version, because the
   * builder that writes it lives in the toolbar.
   */
  advancedFilter?: CrossColumnFilter | null;
  /** Quick-search text, matched across every filterable column. */
  search?: string;
  /**
   * Distinct values per column id. Pass the same object given to `GridToolbar` so the
   * header funnels and the advanced builder offer identical choices; omit it and the grid
   * derives its own.
   */
  distinctValues?: Record<string, string[]>;
  /**
   * Reports how many node rows survive narrowing, and how many there were to begin with, so
   * the host can render "Showing 47 of 312" beside its filter chips. Group headers are not
   * counted — they are chrome, not results.
   */
  onCountsChange?: (counts: { shown: number; total: number }) => void;
  /** Column id to pixel width, overriding each column's declared track. */
  widths?: Record<string, number>;
  /** Omit to leave columns unresizable, as a grid with nowhere to store widths should. */
  onResizeColumn?: (columnId: string, width: number) => void;
  onResetColumnWidth?: (columnId: string) => void;
  /**
   * Show / hide / move / reset for the column set — what the header menu's layout items and
   * header drag-to-reorder act through. `useGridState` returns this ready-made as
   * `columnControls`. Omit it and those items are visibly unavailable rather than missing.
   */
  columnControls?: ColumnControls;
  /** Group ids the user has collapsed. Omitted means every group is open. */
  collapsedGroups?: Set<string>;
  onToggleGroup?: (groupId: string) => void;
  /**
   * Every group id currently in the row set, so the toolbar can offer Expand all / Collapse
   * all without re-deriving the grouping it does not own. Reported before collapse is
   * applied, or collapsing one group would hide the nested ids under it and "Expand all"
   * would only reopen one level per press.
   */
  onGroupIdsChange?: (groupIds: string[]) => void;
  /**
   * Column-slotted totals for the rows under a group header, keyed by column id.
   *
   * Each entry renders in the column it totals, right where the values it sums are, so it
   * scrolls off with that column and needs no word label — the column heading is the label.
   * Keys that name a hidden or unknown column are dropped rather than shifted (see
   * `@/lib/grid/groupTotals`).
   *
   * Receives the node payloads that belong to the header on the *filtered* list, including
   * rows hidden by collapse, so a collapsed section shows the same figures expanding it
   * would and nothing moves on toggle. Omit it and headers stay label-plus-count, which is
   * every grid except Budget and Supplies.
   */
  groupTotals?: (
    nodes: TRow[],
    group: Extract<GridRow<TRow>, { kind: "group" }>,
  ) => Record<string, ReactNode> | null;
  /**
   * Free text after the count, for a fact about the group that is not one of the columns —
   * Supplies' "funded from Household". Anything that *is* a column belongs in `groupTotals`.
   */
  groupNote?: (
    nodes: TRow[],
    group: Extract<GridRow<TRow>, { kind: "group" }>,
  ) => ReactNode;
  /**
   * Controls the host renders into the group header, after the count and note — Budget's
   * `+` and `⋮`, and its rename input.
   *
   * One generic seam rather than a prop per gesture: what belongs on a group header is the
   * host's business, and only the host knows what its groups can do.
   *
   * **The host must stop propagation on anything clickable it renders here.** The whole
   * header row is the collapse toggle (`onClick={onToggle}` below), so a `+` that lets its
   * click through collapses the group it was meant to add to.
   */
  groupChrome?: (group: Extract<GridRow<TRow>, { kind: "group" }>) => ReactNode;
  /**
   * A grand total pinned to the bottom of the scroll area, keyed by column id like
   * `groupTotals`. Receives the node payloads that survived filtering, so the column
   * visibly adds up to what it prints.
   *
   * A page-level bar is the alternative and is the right call where the figures are not a
   * straight sum of the columns on screen; see `components/data-grid.md`.
   */
  footerTotals?: (nodes: TRow[]) => Record<string, ReactNode> | null;
  /**
   * The node ids actually on screen, in screen order — after column filters, search, grouping
   * and sort.
   *
   * Hosts used to derive this themselves from the rows they *passed in*, which is the list
   * before this grid narrows it. Shift-arrow therefore walked rows that were filtered out: on
   * the Outline, whose default view hides completed work, a three-row selection could include
   * rows the user could not see — and the row menu now prints that number and Delete now acts
   * on it.
   */
  onNavigableIdsChange?: (ids: string[]) => void;
  /**
   * Row height. Overrides `--row-height` on the grid's own subtree rather than setting a
   * height per row: the header, the data rows and the group headers all already read that
   * one variable, so density stays a single change instead of three that can drift.
   */
  density?: GridDensity;
  /**
   * Size to the rows instead of filling the parent, for a grid that shares a scrolling page
   * with another one. The default fills its container and scrolls internally, which is right
   * for a tab that *is* the page and collapses to a single row when two are stacked.
   */
  autoHeight?: boolean;
  /** Omit to leave rows undraggable, as every tab but the outline does. */
  rowDrag?: RowDrag;
  /**
   * Right-click menu for a row. Omit to leave the browser's own menu alone. Called each
   * time the menu opens rather than memoised, so item state is never stale.
   *
   * **`null` means the pointer was not over a row** — blank space below the last one, or a group
   * header. The same menu is returned with no selection, which greys every item verb with
   * "Select a row first" rather than showing a second, shorter list. That is Achieve's behaviour
   * and `navigation.md`'s: unavailable is not absent, and one menu cannot drift from itself.
   */
  rowMenu?: (nodeId: string | null) => MenuItem[];
  /**
   * Swipe actions for a compact row. Ignored above `md`, where there is no gesture to make.
   * Reversible actions only — `responsive.md` keeps anything without a way back off a swipe.
   */
  rowSwipe?: (nodeId: string) => RowSwipe;
} & RowMeta<TRow>) {
  type Row = NodeGridRow<TRow>;

  const [ownSorts, setOwnSorts] = useState<SortState>([]);
  const [ownFilters, setOwnFilters] = useState<Record<string, ColumnFilter>>({});
  const sorts = controlledSorts ?? ownSorts;
  const filters = controlledFilters ?? ownFilters;

  const [dragIds, setDragIds] = useState<readonly string[] | null>(null);
  /**
   * The same ids, readable from a row that has not re-rendered. `DataRow` is memoised and
   * `dragBindingEqual` deliberately compares only `dragging` / `hint`, so a target row keeps
   * the binding it was built with — one whose captured `dragIds` is still `null`. Reading
   * the closure there refused every hover, which is what took drag-and-drop away. Written
   * synchronously beside the state, because `dragover` can arrive before an effect runs.
   */
  const dragIdsRef = useRef<readonly string[] | null>(null);
  const startDrag = useCallback((ids: readonly string[]) => {
    dragIdsRef.current = ids;
    setDragIds(ids);
  }, []);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const holdExpandId = useRef<string | null>(null);
  const holdExpandTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (holdExpandTimer.current != null) {
        window.clearTimeout(holdExpandTimer.current);
      }
    },
    [],
  );

  function clearHoldExpand() {
    if (holdExpandTimer.current != null) {
      window.clearTimeout(holdExpandTimer.current);
      holdExpandTimer.current = null;
    }
    holdExpandId.current = null;
  }

  function scheduleHoldExpand(id: string, expand: () => void) {
    if (holdExpandId.current === id) return;
    clearHoldExpand();
    holdExpandId.current = id;
    holdExpandTimer.current = window.setTimeout(() => {
      holdExpandTimer.current = null;
      holdExpandId.current = null;
      expand();
    }, HOLD_EXPAND_MS);
  }
  const [menu, setMenu] = useState<{
    /** `null` when the pointer was over blank space rather than a row. */
    rowId: string | null;
    x: number;
    y: number;
  } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const gridRef = useRef<HTMLDivElement>(null);
  /**
   * Hydration-only: the first paint must not `scrollIntoView` the focused row (Lighthouse
   * records that as a layout shift). After this effect, a row that *mounts already focused*
   * — a newly created item — is a user action and should scroll.
   */
  const hydratedRef = useRef(false);
  useEffect(() => {
    hydratedRef.current = true;
  }, []);
  const handleWidth = HANDLE_WIDTH;
  // Handle is grid chrome, not a host column — Show Fields cannot hide it, and widths
  // never apply to it. Prepended on desktop only; compact rows have no gutter.
  const bodyTemplate = buildGridTemplate(columns, widths);
  const gridTemplate = `${handleWidth} ${bodyTemplate}`;

  const compact = useIsCompact();

  /**
   * Which columns survive to a phone row. Filtered to the ones that can actually produce
   * compact text before the meta cap applies, so a column with nothing to show does not
   * spend one of the three slots on a blank chip.
   */
  const compactFields = useMemo(
    () =>
      resolveCompactFields(
        columns.filter(
          (column) =>
            column.compact !== undefined ||
            column.compactTextWithCtx !== undefined ||
            column.compactText !== undefined ||
            column.filterValue !== undefined,
        ),
      ),
    [columns],
  );

  /**
   * The set filtering works over: every defined column, not just the visible ones. Falls
   * back to the visible set for grids that never hide anything.
   */
  const filterColumns = allColumns ?? columns;

  const kinds = useMemo(() => {
    const map: Record<string, ColumnDef<TCtx, TRow>["filterKind"]> = {};
    for (const column of filterColumns) map[column.id] = column.filterKind;
    return map;
  }, [filterColumns]);

  const narrowingNodeRows = useMemo(
    () => (narrowingRows ?? rows).filter((row): row is Row => row.kind === "node"),
    [narrowingRows, rows],
  );

  /**
   * Values per column, with counts. The header's set filter needs the counts, so this is
   * derived here regardless of what the host passed — and `distinctValues` is read back off
   * it rather than walked again, so the funnel and the advanced builder cannot end up
   * offering different values for the same column.
   */
  const columnValues = useMemo(
    () => collectColumnValues(filterColumns, narrowingNodeRows),
    [filterColumns, narrowingNodeRows],
  );
  const ownDistinctValues = useMemo(
    () => distinctValuesOf(columnValues),
    [columnValues],
  );
  const distinctValues = providedDistinctValues ?? ownDistinctValues;

  const today =
    typeof columnCtx === "object" &&
    columnCtx !== null &&
    "today" in columnCtx &&
    typeof (columnCtx as { today: unknown }).today === "string"
      ? (columnCtx as { today: string }).today
      : typeof columnCtx === "object" && columnCtx !== null && "today" in columnCtx
        ? ((columnCtx as { today: string | null }).today ?? null)
        : null;

  /**
   * Anything narrowing the rows. All three compose with AND: the column funnels, the
   * cross-column builder and the search box each answer a different question, and a row has
   * to satisfy every question that was asked.
   */
  const narrowing = useMemo(
    () =>
      Object.values(filters).some(filterActive) ||
      crossFilterActive(advancedFilter) ||
      searchActive(search),
    [filters, advancedFilter, search],
  );

  /**
   * Node ids surviving every narrowing control, or null when nothing is narrowing.
   *
   * Kept separate from `displayRows` so the "Showing N of M" count can be taken from here
   * rather than from what is finally on screen. Collapsing a group hides rows without
   * filtering them out; counting the visible list would make the number drop and read as if
   * a filter had tightened.
   */
  const passIds = useMemo(() => {
    if (preparedDisplay) return null;
    if (!narrowing) return null;

    const pass = new Set<string>();
    for (const row of narrowingNodeRows) {
      const values: Record<string, GridFilterValue> = {};
      for (const column of filterColumns) {
        if (column.filterValue) values[column.id] = column.filterValue(row);
      }
      if (
        rowPassesFilters(values, filters, kinds, today) &&
        rowPassesCrossFilter(values, advancedFilter, kinds) &&
        rowMatchesSearch(values, search)
      ) {
        pass.add(row.id);
      }
    }

    // Hierarchy survives filtering: a row that matched keeps the rows it is indented under,
    // or it would sit three levels in claiming a parent that is not on screen. Flat grids
    // get the same set back untouched. See `lib/grid/ancestors.ts`.
    return withAncestors(narrowingNodeRows, pass);
  }, [
    narrowing,
    narrowingNodeRows,
    filterColumns,
    filters,
    advancedFilter,
    search,
    kinds,
    today,
    preparedDisplay,
  ]);

  /**
   * Filter and empty-group drop, still including collapsed sections. Group summaries and
   * collapse both read from this: collapsing hides rows without un-asking the total.
   */
  const filteredRows = useMemo(() => {
    if (preparedDisplay || !passIds) return rows;
    return dropEmptyGroups(
      rows.filter((row) => row.kind !== "node" || passIds.has(row.id)),
      passIds,
    );
  }, [preparedDisplay, rows, passIds]);

  const summarizeGroups = groupTotals != null || groupNote != null;
  const membersByGroup = useMemo(() => {
    if (!summarizeGroups) return null;
    return groupMembers(filteredRows);
  }, [summarizeGroups, filteredRows]);

  const displayRows = useMemo(() => {
    if (preparedDisplay) return filteredRows;
    let next = filteredRows;

    if (collapsedGroups && collapsedGroups.size > 0) {
      next = applyGroupCollapse(next, collapsedGroups);
    }

    // Within each group, only siblings reorder — parent/child structure is preserved, for
    // every key. See `@/lib/grid/sortRows`.
    //
    // Keys are resolved against `columns` (the visible set) rather than `filterColumns`: a
    // sort you cannot see the indicator for is a grid that has silently rearranged itself.
    // Filtering by a hidden column is legible from its chip; sorting by one is not.
    const keys = sorts.flatMap((entry) => {
      const column = columns.find((candidate) => candidate.id === entry.columnId);
      if (!column?.sortValue) return [];
      const sortValue = column.sortValue;
      return [{ valueOf: (row: Row) => sortValue(row), direction: entry.direction }];
    });

    if (keys.length > 0) next = sortRowsWithinGroups(next, keys);

    return next;
  }, [preparedDisplay, filteredRows, columns, sorts, collapsedGroups]);

  /**
   * Counts for the host's "Showing N of M". `total` is the count before any narrowing, so
   * the denominator holds still as the user types — a fraction whose bottom half also moves
   * says nothing about how much has been filtered out.
   */
  const shownCount =
    preparedCounts?.shown ?? (passIds ? passIds.size : narrowingNodeRows.length);
  const totalCount = preparedCounts?.total ?? narrowingNodeRows.length;

  // Layout, not paint: the chip bar's "Showing N of M" is above the rows. Reporting after
  // paint was a 0.1 CLS on the Outline when the first client frame still said 0 of 0.
  useLayoutEffect(() => {
    onCountsChange?.({ shown: shownCount, total: totalCount });
  }, [onCountsChange, shownCount, totalCount]);

  const rowEstimate = compact ? 56 : density === "compact" ? 22 : 28;
  // TanStack Virtual returns unstable function identities; Register is the only caller.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualize ? displayRows.length : 0,
    getScrollElement: () => gridRef.current,
    estimateSize: () => rowEstimate,
    overscan: 12,
    getItemKey: (index) => displayRows[index]?.id ?? index,
    enabled: virtualize,
  });
  const virtualItems = virtualizer.getVirtualItems();

  const selectedIdRef = useRef(selectedId);
  useLayoutEffect(() => {
    const selectionChanged = selectedIdRef.current !== selectedId;
    selectedIdRef.current = selectedId;
    if (!virtualize || selectedId === null || !selectionChanged) return;
    const index = displayRows.findIndex((row) => row.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [virtualize, selectedId, displayRows, virtualizer]);

  useLayoutEffect(() => {
    if (!virtualize || virtualItems.length === 0) return;
    onVisibleRange?.(
      virtualItems[0].index,
      virtualItems[virtualItems.length - 1].index,
    );
  }, [virtualize, virtualItems, onVisibleRange]);

  // Taken from `rows`, not `displayRows`: collapsing an outer group removes the nested
  // headers beneath it from the visible list, and a toolbar working off that could only
  // reopen one level per press.
  const groupIdKey = rows
    .filter((row) => row.kind === "group")
    .map((row) => row.id)
    .join("\0");

  useLayoutEffect(() => {
    onGroupIdsChange?.(groupIdKey === "" ? [] : groupIdKey.split("\0"));
  }, [onGroupIdsChange, groupIdKey]);

  // Keyed on the joined string for the same reason as the group ids: a fresh array every
  // render would re-notify every render.
  const navigableKey = displayRows
    .filter((row) => row.kind === "node")
    .map((row) => row.id)
    .join("\0");

  useLayoutEffect(() => {
    onNavigableIdsChange?.(navigableKey === "" ? [] : navigableKey.split("\0"));
  }, [onNavigableIdsChange, navigableKey]);

  /**
   * File ▸ Export ▸ and File ▸ Copy to Clipboard ▸. Registered here, not by each host,
   * so every DataGrid — including Day, which never goes through GridToolbar — has the
   * same commands on File. The snapshot is what is on screen: visible columns,
   * filtered/sorted node rows, no group headers. JSON and YAML nest by row depth.
   *
   * The command list is identity-stable. `columns` / `displayRows` are new arrays on some
   * hosts every render; putting them in this memo's deps re-registered every frame and
   * tripped `useRegisterCommands`' churn guard (Maximum update depth on Finances). The run
   * closure reads the latest snapshot from a ref instead — same shape as ViewPicker.
   */
  const exportSnapshot = useRef({ columns, displayRows, ariaLabel, loadExportRows });
  useEffect(() => {
    exportSnapshot.current = { columns, displayRows, ariaLabel, loadExportRows };
  });
  const exportCommands = useMemo(() => {
    const downloads = gridExportCommands(() => {}).map((command) => {
      const format = gridExportFormatOf(command.id);
      if (!format) return command;
      return {
        ...command,
        run: () => {
          void (async () => {
            const {
              columns: visible,
              displayRows: shown,
              ariaLabel: label,
              loadExportRows: loadRows,
            } = exportSnapshot.current;
            const nodeRows = loadRows
              ? await loadRows()
              : shown.filter((row): row is Row => row.kind === "node");
            const exportedAt = new Date();
            downloadTextFile(
              exportFilename(label, FORMAT_EXTENSION[format], exportedAt),
              serializeGridExport(format, exportableColumns(visible), nodeRows, {
                title: label,
                exportedAt,
              }),
              exportMimeType(format),
            );
          })();
        },
        alternate: {
          label: command.alternate?.label ?? "",
          title: command.alternate?.title,
          run: () => {
            void (async () => {
              const {
                columns: visible,
                displayRows: shown,
                ariaLabel: label,
                loadExportRows: loadRows,
              } = exportSnapshot.current;
              const nodeRows = loadRows
                ? await loadRows()
                : shown.filter((row): row is Row => row.kind === "node");
              void writeClipboardText(
                serializeGridExport(format, exportableColumns(visible), nodeRows, {
                  title: label,
                  exportedAt: new Date(),
                }),
              );
            })();
          },
        },
      };
    });
    const copies = gridCopyCommands(() => {}).map((command) => {
      const format = gridExportFormatOf(command.id);
      if (!format) return command;
      return {
        ...command,
        run: () => {
          void (async () => {
            const {
              columns: visible,
              displayRows: shown,
              ariaLabel: label,
              loadExportRows: loadRows,
            } = exportSnapshot.current;
            const nodeRows = loadRows
              ? await loadRows()
              : shown.filter((row): row is Row => row.kind === "node");
            void writeClipboardText(
              serializeGridExport(format, exportableColumns(visible), nodeRows, {
                title: label,
                exportedAt: new Date(),
              }),
            );
          })();
        },
      };
    });
    return [...downloads, ...copies];
  }, []);
  useRegisterCommands(registerExportCommands ? exportCommands : EMPTY_EXPORT_COMMANDS);

  /**
   * Achieve's header cycle: unsorted → ascending → descending → unsorted.
   *
   * A plain click replaces the whole sort; `additive` (Shift-click) cycles this one column's
   * key and leaves the others alone. Mirrors `useGridState.toggleSort`, which is the
   * controlled version — the two must agree or a tab would behave differently depending on
   * whether it persists its sort.
   */
  const handleSort = useCallback(
    (columnId: string, additive: boolean) => {
      if (onSortChange) {
        onSortChange(columnId, additive);
        return;
      }
      setOwnSorts((current) => {
        const existing = current.find((entry) => entry.columnId === columnId);

        if (!additive) {
          const isSoleKey = current.length === 1 && existing !== undefined;
          if (!isSoleKey) return [{ columnId, direction: "asc" }];
          return existing.direction === "asc" ? [{ columnId, direction: "desc" }] : [];
        }

        if (!existing) return [...current, { columnId, direction: "asc" }];
        return existing.direction === "asc"
          ? current.map((entry) =>
              entry.columnId === columnId
                ? { columnId, direction: "desc" as const }
                : entry,
            )
          : current.filter((entry) => entry.columnId !== columnId);
      });
    },
    [onSortChange],
  );

  /**
   * The column menu's Sort ascending / descending / Clear sort. Replaces the whole sort with
   * this one key, matching a plain header click — accumulating keys stays Shift-click's job,
   * so a menu pick can never quietly leave a stale secondary sort behind.
   */
  const handleSetSort = useCallback(
    (columnId: string, direction: GridSortKey["direction"] | null) => {
      if (onSetSort) {
        onSetSort(columnId, direction);
        return;
      }
      setOwnSorts((current) =>
        direction === null
          ? current.filter((entry) => entry.columnId !== columnId)
          : [{ columnId, direction }],
      );
    },
    [onSetSort],
  );

  const handleFilterChange = useCallback(
    (columnId: string, filter: ColumnFilter) => {
      if (onFilterChange) {
        onFilterChange(columnId, filter);
        return;
      }
      setOwnFilters((current) => ({ ...current, [columnId]: filter }));
    },
    [onFilterChange],
  );

  /**
   * Row event handlers must be identity-stable across renders. DataRow's memo compares
   * them by reference; wrapping `onSelect(row.id)` in the map below used to allocate a
   * fresh closure per row per render, so a click that should repaint one row repainted
   * every row. The Register is ~7,000 rows — that was a multi-second hitch.
   *
   * Host callbacks also churn. Opening the Register drawer writes `?detail=`, which
   * rebuilds `onOpenDetail` even though the function still does the same thing. Each
   * visible row owns a native envelope `<select>` of every category, so that identity
   * change froze the main thread and held the drawer open until the rows committed.
   * Read the latest from refs, same as the export snapshot above.
   */
  const selectedIdsRef = useRef(selectedIds);
  const onSelectRef = useRef(onSelect);
  const onOpenDetailRef = useRef(onOpenDetail);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    onSelectRef.current = onSelect;
    onOpenDetailRef.current = onOpenDetail;
  });

  const selectRow = useCallback((id: string, mods?: GridSelectMods) => {
    onSelectRef.current(id, mods);
  }, []);

  const openDetail = useCallback((id: string) => {
    onOpenDetailRef.current?.(id);
  }, []);

  const openRowMenu = useCallback((id: string, x: number, y: number) => {
    if (!selectedIdsRef.current?.has(id)) onSelectRef.current(id);
    setMenu({ rowId: id, x, y });
  }, []);

  const displayNodeIds = useMemo(
    () =>
      displayRows.filter((row): row is Row => row.kind === "node").map((row) => row.id),
    [displayRows],
  );

  function endDrag() {
    clearHoldExpand();
    dragIdsRef.current = null;
    setDragIds(null);
    setDropHint(null);
  }

  /**
   * Which ids travel with a drag starting on `primaryId`. If the row is already in a
   * multi-selection, the whole selection moves (display order). Otherwise just that row —
   * and the selection collapses to it so the user sees what will move.
   */
  function dragIdsFor(primaryId: string, nodeOrder: readonly string[]): string[] {
    const selection = selectedIdsRef.current;
    if (selection && selection.has(primaryId) && selection.size > 1) {
      return nodeOrder.filter((id) => selection.has(id));
    }
    return [primaryId];
  }

  /** One row's share of the drag, or nothing when the tab left drag turned off. */
  function dragBindingFor(
    rowId: string,
    nodeOrder: readonly string[],
    onHoldInside?: () => void,
  ): RowDragBinding | undefined {
    if (!rowDrag) return undefined;
    // Drag is off below `md`, deliberately. The handle is mouse-shaped; reordering on a
    // phone lives in the long-press menu instead (`responsive.md`).
    if (compact) return undefined;

    const forget = () =>
      setDropHint((current) => (current?.targetId === rowId ? null : current));

    // `dragIds` here is render state, for the visuals below; every callback reads
    // `dragIdsRef` instead so it still works on a row the memo skipped.
    const isDragging =
      dragIds !== null && (dragIds.includes(rowId) || dragIds[0] === rowId);

    return {
      dragging: isDragging,
      hint:
        dropHint?.targetId === rowId
          ? { zone: dropHint.zone, depth: dropHint.depth }
          : null,
      onHandleMouseDown: () => {
        // Selection for multi-drag is decided at mousedown on the handle, before dragstart,
        // so a plain click-to-select on an unselected handle still works as single-drag.
        if (!selectedIdsRef.current?.has(rowId)) onSelectRef.current(rowId);
      },
      onStart: () => {
        const ids = dragIdsFor(rowId, nodeOrder);
        startDrag(ids);
        const selection = selectedIdsRef.current;
        if (ids.length === 1 && (!selection || !selection.has(rowId))) {
          onSelectRef.current(rowId);
        }
      },
      onOver: (zone) => {
        const activeDrag = dragIdsRef.current;
        if (!activeDrag || activeDrag.length === 0) return false;
        // Expand even when the hover is not yet a legal drop — the children that appear
        // are what the pointer is looking for.
        if (zone === "inside" && onHoldInside) {
          scheduleHoldExpand(rowId, onHoldInside);
        } else if (holdExpandId.current === rowId) {
          clearHoldExpand();
        }
        const resolved = rowDrag.resolve(activeDrag, rowId, zone);
        if (!resolved) {
          forget();
          return false;
        }
        // Re-using the current object when nothing moved keeps a 60 Hz stream of dragover
        // events from re-rendering the whole grid.
        setDropHint((current) =>
          current?.targetId === rowId &&
          current.zone === zone &&
          current.depth === resolved.depth
            ? current
            : { targetId: rowId, zone, depth: resolved.depth },
        );
        return true;
      },
      onLeave: () => {
        if (holdExpandId.current === rowId) clearHoldExpand();
        forget();
      },
      onDrop: (zone) => {
        const ids = dragIdsRef.current;
        endDrag();
        if (ids && ids.length > 0) rowDrag.onDrop(ids, rowId, zone);
      },
      onEnd: endDrag,
    };
  }

  // One type glyph per row, and the visible column set decides where it goes: its own
  // column when the user has shown `icon`, beside the name otherwise. See `NameIconContext`.
  const nameShowsIcon = !columns.some((column) => column.id === "icon");

  /**
   * The grand total, pinned to the bottom of the scroll area and sharing the column
   * template so each figure scrolls sideways with the column it sums.
   *
   * Built from `filteredRows`, the same list the row count is taken from, so the label and
   * the figures cannot disagree with the chip bar above them.
   */
  const footerValues = footerTotals
    ? footerTotals(
        filteredRows.flatMap((row) => (row.kind === "node" ? [row.node] : [])),
      )
    : null;
  const footerLayout = totalsLayout(columns, footerValues);
  const footerRow =
    footerValues == null ? null : (
      <div
        role="row"
        className={[
          // Same padding as `DataRow` and the group header, or the grand total sits a few
          // pixels off the column it totals.
          "tabular sticky bottom-0 z-20 items-center border-t border-rule bg-surface-raised text-[0.8125rem] font-semibold text-ink",
          compact ? "px-3" : "pr-3",
          // A phone has no columns to align to, so the grand total is a labelled run — the
          // same trade the compact group header makes. See `components/responsive.md`.
          compact ? "flex min-h-9 flex-wrap gap-x-3 gap-y-0.5 py-1.5" : "grid",
        ].join(" ")}
        style={
          compact
            ? undefined
            : {
                gridTemplateColumns: gridTemplate,
                columnGap: "0.75rem",
                height: "var(--row-height)",
              }
        }
      >
        <div
          role="rowheader"
          className={`flex min-w-0 items-center gap-1.5 ${compact ? "" : "pl-3"}`}
          style={
            compact ? undefined : { gridColumn: `1 / span ${footerLayout.labelSpan}` }
          }
        >
          <span className="truncate">Total</span>
          <span className="text-[0.75rem] font-normal text-ink-faint">
            ({shownCount} {shownCount === 1 ? "row" : "rows"})
          </span>
        </div>
        {compact
          ? columns.map((column) =>
              footerValues[column.id] === undefined ? null : (
                <span
                  key={column.id}
                  className="text-[0.75rem] font-normal text-ink-muted"
                >
                  {column.label}{" "}
                  <span className="font-semibold text-ink">
                    {footerValues[column.id]}
                  </span>
                </span>
              ),
            )
          : columns.slice(footerLayout.labelSpan - 1).map((column, index) => (
              <div
                key={column.id}
                role="gridcell"
                className={`flex min-w-0 items-center self-stretch overflow-hidden ${alignClass(column.align)}`}
              >
                {footerLayout.cells[index] === null ? null : footerValues[column.id]}
              </div>
            ))}
      </div>
    );

  return (
    <NameIconContext.Provider value={nameShowsIcon}>
      <div
        className={
          autoHeight ? "flex min-h-0 flex-col" : "flex h-full min-h-0 flex-1 flex-col"
        }
        // Compact is a genuine trade, not a default: more rows per screen against a smaller
        // target for the inline editors that live in those rows. Left to the user per grid.
        style={
          density === "compact"
            ? ({ "--row-height": "1.375rem" } as React.CSSProperties)
            : undefined
        }
      >
        {/* No column header on a phone: there are no columns to head, and sort, filter and
          resize are all mouse-shaped controls at 10px. Sorting stays reachable from the
          view's own toolbar. */}
        {!compact && (
          <ColumnHeaderRow
            columns={columns}
            allColumns={filterColumns}
            gridTemplate={gridTemplate}
            sorts={enableSort ? sorts : []}
            onSort={enableSort ? handleSort : undefined}
            onSetSort={enableSort ? handleSetSort : undefined}
            filters={filters}
            onFilterChange={handleFilterChange}
            distinctValues={distinctValues}
            columnValues={columnValues}
            onResize={onResizeColumn}
            onResetWidth={onResetColumnWidth}
            widths={widths}
            controls={columnControls}
            enableFilters={enableFilters}
            leadingGutter={
              gutter === "checkbox" ? (
                <SelectionCheckbox
                  state={selectAllState ?? "none"}
                  onSelect={() => onToggleSelectAll?.()}
                  ariaLabel="Select all"
                />
              ) : (
                // `false` still draws the empty track, which is what a grab-bar gutter
                // wants — a header checkbox over a column of drag handles selects nothing
                // the handles below it can act on.
                false
              )
            }
          />
        )}

        {compact && onToggleSelectAll ? (
          <div className="flex min-h-tap items-center gap-2 border-b border-rule-strong bg-surface-raised px-2.5">
            <SelectionCheckbox
              state={selectAllState ?? "none"}
              onSelect={() => onToggleSelectAll()}
              ariaLabel="Select all"
              compact
            />
            <span className="text-[0.8125rem] text-ink-muted">Select all</span>
          </div>
        ) : null}

        <div
          ref={gridRef}
          tabIndex={0}
          role="treegrid"
          aria-label={ariaLabel}
          className={
            autoHeight
              ? "min-h-0 overflow-x-auto outline-none"
              : "min-h-0 flex-1 overflow-auto outline-none"
          }
          /*
           * The blank-area menu. Rows handle their own right-click and mark themselves with
           * `data-node-row`, so this fires for everything else the grid covers: the empty space
           * below the last row, the "Nothing to show" panel, and group headers — none of which
           * name a record, which is exactly what a `null` row menu is for.
           *
           * Guarding on the marker rather than stopping propagation in the row keeps the row's
           * early exit honest: ⌃-click on macOS arrives here as a secondary click that means
           * multi-select, not a menu.
           */
          onContextMenu={
            rowMenu &&
            ((event) => {
              const target = event.target as HTMLElement;
              if (target.closest("[data-node-row]")) return;
              if (event.ctrlKey || event.metaKey) return;
              event.preventDefault();
              setMenu({ rowId: null, x: event.clientX, y: event.clientY });
            })
          }
        >
          {displayRows.length === 0
            ? (empty ?? (
                <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
                  Nothing to show.
                </div>
              ))
            : (() => {
                const renderAt = (index: number, style?: CSSProperties) => {
                  const row = displayRows[index];
                  if (!row) return null;
                  const isSelected = selectedIds
                    ? selectedIds.has(row.id)
                    : row.id === selectedId;
                  const isFocus = row.id === selectedId;
                  const pending = pendingRowIds?.has(row.id) ?? false;
                  const body =
                    row.kind === "group" ? (
                      <GroupHeader
                        row={row}
                        gridTemplate={gridTemplate}
                        collapsed={collapsedGroups?.has(row.id) ?? false}
                        onToggle={() => onToggleGroup?.(row.id)}
                        drag={dragBindingFor(
                          row.id,
                          displayNodeIds,
                          collapsedGroups?.has(row.id)
                            ? () => onToggleGroup?.(row.id)
                            : undefined,
                        )}
                        compact={compact}
                        columns={columns}
                        totals={
                          groupTotals && membersByGroup
                            ? groupTotals(membersByGroup.get(row.id) ?? [], row)
                            : null
                        }
                        note={
                          groupNote && membersByGroup
                            ? groupNote(membersByGroup.get(row.id) ?? [], row)
                            : undefined
                        }
                        chrome={groupChrome?.(row)}
                      />
                    ) : pending ? (
                      <div
                        role="row"
                        aria-label="Loading transaction"
                        className="flex h-[var(--row-height)] items-center px-3"
                      >
                        <div className="h-3 w-full max-w-xl animate-pulse rounded bg-surface-raised" />
                      </div>
                    ) : compact ? (
                      <CompactRow
                        row={row}
                        columnCtx={columnCtx}
                        fields={compactFields}
                        selected={isSelected}
                        onSelect={selectRow}
                        onOpenDetail={onOpenDetail ? openDetail : undefined}
                        onLongPress={rowMenu ? openRowMenu : undefined}
                        swipe={rowSwipe?.(row.id)}
                        label={rowLabelFor(row, rowLabel)}
                        expanded={rowExpansionFor(row, rowExpansion)}
                      />
                    ) : (
                      <DataRow
                        row={row}
                        columns={columns}
                        columnCtx={columnCtx}
                        gridTemplate={gridTemplate}
                        handleWidth={handleWidth}
                        gutter={gutter}
                        selected={isSelected}
                        focused={isFocus}
                        onSelect={selectRow}
                        onOpenDetail={onOpenDetail ? openDetail : undefined}
                        drag={dragBindingFor(
                          row.id,
                          displayNodeIds,
                          rowExpansionFor(row, rowExpansion) === false &&
                            rowDrag?.onExpand
                            ? () => rowDrag.onExpand?.(row.id)
                            : undefined,
                        )}
                        onContextMenu={rowMenu ? openRowMenu : undefined}
                        allowInitialScroll={hydratedRef.current}
                        rowLabel={rowLabel}
                        rowExpansion={rowExpansion}
                      />
                    );

                  if (!virtualize) return <div key={row.id}>{body}</div>;
                  return (
                    <div
                      key={row.id}
                      data-index={index}
                      ref={virtualizer.measureElement}
                      style={style}
                    >
                      {body}
                    </div>
                  );
                };

                if (!virtualize) {
                  return displayRows.map((_, index) => renderAt(index));
                }
                return (
                  <div
                    style={{
                      height: virtualizer.getTotalSize(),
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {virtualItems.map((virtualRow) =>
                      renderAt(virtualRow.index, {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }),
                    )}
                  </div>
                );
              })()}

          {footerRow}
        </div>

        {menu && rowMenu && (
          // Built on open rather than held in state, so an item's enabled/disabled state
          // reflects the tree as it is now.
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={rowMenu(menu.rowId)}
            onClose={closeMenu}
          />
        )}
      </div>
    </NameIconContext.Provider>
  );
}

type DataRowProps<TCtx, TRow> = {
  row: NodeGridRow<TRow>;
  columns: ColumnDef<TCtx, TRow>[];
  columnCtx: TCtx;
  gridTemplate: string;
  handleWidth: string;
  gutter: "checkbox" | "handle";
  selected: boolean;
  /** Keyboard-focus row — the one that scrolls into view. Defaults to `selected`. */
  focused?: boolean;
  onSelect: (id: string, mods?: GridSelectMods) => void;
  onOpenDetail?: (id: string) => void;
  drag?: RowDragBinding;
  onContextMenu?: (id: string, x: number, y: number) => void;
  /**
   * False on the grid's first paint so a focused row below the fold does not shift the
   * viewport. True afterwards, so a row that mounts already focused (a newly created
   * item) scrolls into view.
   */
  allowInitialScroll?: boolean;
} & RowMeta<TRow>;

/** Drag bindings rebuild every render; only dragging/hint state should bust the row memo. */
function dragBindingEqual(a?: RowDragBinding, b?: RowDragBinding): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.dragging === b.dragging &&
    a.hint?.zone === b.hint?.zone &&
    a.hint?.depth === b.hint?.depth
  );
}

const DataRow = memo(
  function DataRow<TCtx, TRow>({
    row,
    columns,
    columnCtx,
    gridTemplate,
    handleWidth,
    gutter,
    selected,
    focused = selected,
    onSelect,
    onOpenDetail,
    drag,
    onContextMenu,
    allowInitialScroll = false,
    rowLabel,
    rowExpansion,
  }: DataRowProps<TCtx, TRow>) {
    const rowRef = useRef<HTMLDivElement>(null);
    // Hydrate must not scroll: `block: "nearest"` still moves the scroller when the
    // focused row is below the fold, and Lighthouse records that as a 0.1 shift of
    // whichever row ended up in view. Arrow keys and a later selection still scroll.
    // Skip only that first paint — a row that mounts focused *after* hydration is a
    // user-created row and should come into view.
    const skipInitialScroll = useRef(focused && !allowInitialScroll);

    const label = rowLabelFor(row, rowLabel);
    const expanded = rowExpansionFor(row, rowExpansion);

    useEffect(() => {
      if (!focused) {
        skipInitialScroll.current = false;
        return;
      }
      if (skipInitialScroll.current) {
        skipInitialScroll.current = false;
        return;
      }
      rowRef.current?.scrollIntoView({ block: "nearest" });
    }, [focused]);

    // Stable enough for the provider: rebuilt when `drag` identity changes (per-row binding).
    const handleApi: RowDragHandleApi | null = drag
      ? {
          onHandleMouseDown: () => {
            drag.onHandleMouseDown();
          },
          onDragStart: (event) => {
            // Modifier-click is multi-select, not a drag.
            if (event.shiftKey || event.metaKey || event.ctrlKey) {
              event.preventDefault();
              return;
            }
            // Some drop targets ignore a drag carrying no data at all.
            event.dataTransfer.setData("text/plain", row.id);
            event.dataTransfer.effectAllowed = "move";
            // Ghost the whole row, not the tiny handle the press started on.
            if (rowRef.current) {
              event.dataTransfer.setDragImage(
                rowRef.current,
                24,
                Math.round(rowRef.current.offsetHeight / 2),
              );
            }
            drag.onStart();
          },
        }
      : null;

    return (
      <div
        ref={rowRef}
        role="row"
        // Tells the grid's blank-area handler that this press was over a record. See `DataGrid`.
        data-node-row=""
        aria-level={row.depth + 1}
        aria-selected={selected}
        aria-expanded={expanded}
        aria-label={label}
        onClick={(event) => {
          // The handle owns its own click. Cell editors and expanders handle theirs.
          if ((event.target as HTMLElement).closest("[data-row-handle]")) return;
          if (
            (event.target as HTMLElement).closest("input, select, textarea, button")
          ) {
            // Keep a multi-selection the row is already in: the cell edit applies to
            // it. An unselected row is a single-row edit. No Shift/⌘ — a click on a
            // date picker should not toggle membership.
            onSelect(row.id, { cellControl: true });
            return;
          }
          // Shift = range, Ctrl (Windows) / ⌘ (Mac) = add/remove one row. Both are standard.
          onSelect(row.id, {
            extend: event.shiftKey,
            toggle: event.metaKey || event.ctrlKey,
          });
        }}
        onDoubleClick={
          onOpenDetail
            ? (event) => {
                // Double-click selects text inside an editor. Opening the drawer steals focus
                // between that click and the user's next keystroke.
                if (
                  (event.target as HTMLElement).closest(
                    "input, select, textarea, button, a, [contenteditable=true]",
                  )
                )
                  return;
                onOpenDetail(row.id);
              }
            : undefined
        }
        onContextMenu={
          onContextMenu &&
          ((event) => {
            // Always-on cell inputs (Supplies, Register, Budget) cover most of the row.
            // Yielding to the browser menu there made right-click look broken; cut/copy/paste
            // still work from the keyboard. Click-to-edit grids get the same row menu while
            // renaming — same as a right-click on the rest of the row.
            // On macOS, Ctrl+click is often synthesised as a secondary click and never reaches
            // `click` — only `contextmenu`. Treat Ctrl/⌘+click as multi-select, not the menu.
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              onSelect(row.id, { toggle: true });
              return;
            }
            event.preventDefault();
            onContextMenu(row.id, event.clientX, event.clientY);
          })
        }
        onDragOver={
          drag &&
          ((event) => {
            if (!drag.onOver(dropZoneFor(event))) return;
            // Only an accepted hover is prevented — refusing lets the browser show the
            // no-drop cursor and stops the drop event from firing at all.
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          })
        }
        onDragLeave={drag && (() => drag.onLeave())}
        onDrop={
          drag &&
          ((event) => {
            event.preventDefault();
            drag.onDrop(dropZoneFor(event));
          })
        }
        onDragEnd={drag && (() => drag.onEnd())}
        className={[
          "relative grid items-center border-b border-rule/60 pr-3 text-[0.875rem] [content-visibility:auto] [contain-intrinsic-size:auto_var(--row-height)]",
          selected ? "bg-select" : "hover:bg-surface-raised/60",
          drag?.dragging ? "opacity-40" : "",
          // Child-drop: whole row framed so it is not confused with the thin sibling line.
          drag?.hint?.zone === "inside"
            ? "bg-select-edge/10 ring-2 ring-select-edge ring-inset"
            : "",
        ].join(" ")}
        style={{
          gridTemplateColumns: gridTemplate,
          columnGap: "0.75rem",
          height: "var(--row-height)",
        }}
      >
        {/*
        Handles (gutter + type icon) are permanently `draggable` when row drag is on, and
        own their own dragstart. Arming the row on mousedown is too late for HTML5 DnD —
        the browser falls through to text selection. The row itself stays undraggable so
        cell inputs keep click-and-drag text selection.
      */}
        <RowSelectedContext.Provider value={selected}>
          <RowDragHandleContext.Provider value={handleApi}>
            <RowHandle
              gutter={gutter}
              selected={selected}
              onSelect={(mods) => onSelect(row.id, mods)}
            />

            {columns.map((column) => (
              <div
                key={column.id}
                role="gridcell"
                className={`flex min-w-0 items-center self-stretch overflow-hidden ${alignClass(column.align)}`}
              >
                {column.render(row, columnCtx)}
              </div>
            ))}
          </RowDragHandleContext.Provider>
        </RowSelectedContext.Provider>

        {drag?.hint &&
          (drag.hint.zone === "inside" ? (
            <ChildDropMark
              depth={drag.hint.depth}
              nameColumnLeft={nameColumnLeft(columns, handleWidth)}
            />
          ) : (
            <DropLine
              zone={drag.hint.zone}
              depth={drag.hint.depth}
              nameColumnLeft={nameColumnLeft(columns, handleWidth)}
            />
          ))}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.row === next.row &&
      prev.columns === next.columns &&
      prev.columnCtx === next.columnCtx &&
      prev.gridTemplate === next.gridTemplate &&
      prev.handleWidth === next.handleWidth &&
      prev.gutter === next.gutter &&
      prev.selected === next.selected &&
      prev.focused === next.focused &&
      prev.onSelect === next.onSelect &&
      prev.onOpenDetail === next.onOpenDetail &&
      prev.onContextMenu === next.onContextMenu &&
      prev.allowInitialScroll === next.allowInitialScroll &&
      prev.rowLabel === next.rowLabel &&
      prev.rowExpansion === next.rowExpansion &&
      dragBindingEqual(prev.drag, next.drag)
    );
  },
) as <TCtx, TRow>(props: DataRowProps<TCtx, TRow>) => React.ReactElement;

/**
 * Left gutter shared by every desktop row, in one of two modes.
 *
 * `checkbox` — a selection box with Shift-range / toggle, for the catalogs. The track
 * beside the box selects too, so the whole gutter stays live.
 *
 * `handle` — a plain grab bar for grids that offer row drag. This element is then the
 * HTML5 drag source (not the row), and it stays empty on purpose: a 14px control centred
 * in a 28px track leaves ~6px of grabbable gutter on each side, which is what took
 * drag-to-reorder away from the Outline and the Chooser.
 */
function RowHandle({
  gutter,
  selected,
  onSelect,
}: {
  gutter: "checkbox" | "handle";
  selected: boolean;
  onSelect: (mods?: GridSelectMods) => void;
}) {
  const api = useContext(RowDragHandleContext);
  const canDrag = api !== null;
  const showsCheckbox = gutter === "checkbox";

  return (
    <div
      data-row-handle
      role="gridcell"
      draggable={canDrag || undefined}
      aria-label={showsCheckbox ? "Select row" : "Row handle"}
      title={canDrag ? "Drag to reorder · click to select" : "Click to select"}
      onClick={(event) => {
        // The row body ignores clicks landing here, so the gutter owns its own selection.
        // In checkbox mode the box has already stopped its click; this is the track beside it.
        event.stopPropagation();
        onSelect({
          extend: event.shiftKey,
          toggle: event.metaKey || event.ctrlKey,
        });
      }}
      onContextMenu={(event) => {
        // Same Ctrl/⌘+click → multi-select rule as the row body (macOS synthesises a
        // contextmenu for Ctrl+click and skips the click event). Plain right-click
        // bubbles to the row, which opens the app menu even when the target is the
        // checkbox input.
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          onSelect({ toggle: true });
        }
      }}
      onMouseDown={
        api
          ? (event) => {
              if (event.button !== 0) return;
              if (event.shiftKey || event.metaKey || event.ctrlKey) return;
              api.onHandleMouseDown();
            }
          : undefined
      }
      onDragStart={api ? (event) => api.onDragStart(event) : undefined}
      className={[
        "flex h-full cursor-default select-none items-center justify-center self-stretch border-r border-rule/50",
        canDrag ? "cursor-grab active:cursor-grabbing" : "",
        selected ? "bg-select-edge/10" : "hover:bg-surface-raised",
      ].join(" ")}
    >
      {showsCheckbox ? (
        <SelectionCheckbox
          state={selected}
          ariaLabel="Select row"
          onSelect={(event) =>
            onSelect({
              extend: event.shiftKey,
              toggle: !event.shiftKey,
            })
          }
        />
      ) : null}
    </div>
  );
}

/** Which third of a row the pointer is over. */
function dropZoneFor(event: React.DragEvent<HTMLDivElement>): DropZone {
  const rect = event.currentTarget.getBoundingClientRect();
  const offset = (event.clientY - rect.top) / rect.height;
  if (offset < 0.33) return "before";
  if (offset > 0.67) return "after";
  return "inside";
}

/**
 * Sibling insertion: Achieve draws a single red arrow on the line between rows. We use a
 * chevron + bar at the depth the node will land (which may snap out from the cursor row).
 */
function DropLine({
  zone,
  depth,
  nameColumnLeft,
}: {
  zone: "before" | "after";
  depth: number;
  nameColumnLeft: string;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-2 z-20 flex h-0 items-center"
      style={{
        left: `calc(${nameColumnLeft} + ${depth} * var(--indent-step))`,
        top: zone === "before" ? "0" : undefined,
        bottom: zone === "after" ? "0" : undefined,
        transform: "translateY(-50%)",
      }}
    >
      {/* Filled chevron — reads as "insert here" even on a 1px gap between rows. */}
      <span
        className="mr-0.5 inline-block h-0 w-0 shrink-0 border-y-[5px] border-y-transparent border-r-[7px] border-r-select-edge"
        title={zone === "before" ? "Drop before" : "Drop after"}
      />
      <span className="h-[3px] min-w-0 flex-1 rounded-full bg-select-edge shadow-[0_0_0_1px_rgb(0_0_0/10%)]" />
    </div>
  );
}

/**
 * Child drop: Achieve frames the target with opposing red arrows (→ status ←). We put the
 * same idea on the name track at landing depth, plus the row ring from the parent.
 */
function ChildDropMark({
  depth,
  nameColumnLeft,
}: {
  depth: number;
  nameColumnLeft: string;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center"
      style={{
        left: `calc(${nameColumnLeft} + ${Math.max(0, depth - 1)} * var(--indent-step))`,
      }}
    >
      <span className="text-[0.75rem] font-bold leading-none text-select-edge">→</span>
      <span className="min-w-0 flex-1" />
      <span className="text-[0.75rem] font-bold leading-none text-select-edge">←</span>
      <span className="sr-only">Drop as child</span>
    </div>
  );
}

/**
 * Where the name column starts, as a CSS length: the handle track (always present on
 * desktop), then every fixed track before the name. Indentation lives in the name cell, so
 * the drop line has to start there too. Any non-fixed track before the name gives up and
 * measures from the row edge.
 */
function nameColumnLeft(
  columns: { id: string; width: string }[],
  handleWidth: string,
): string {
  const parts = [handleWidth, "0.75rem"];
  for (const column of columns) {
    if (column.id === "name") break;
    if (!/^[\d.]+(rem|px|em)$/.test(column.width)) {
      return `calc(${handleWidth} + 0.75rem)`;
    }
    parts.push(column.width, "0.75rem");
  }
  return `calc(${parts.join(" + ")})`;
}

const GroupHeader = memo(function GroupHeader({
  row,
  gridTemplate,
  columns,
  collapsed,
  onToggle,
  drag,
  compact,
  totals,
  note,
  chrome,
}: {
  row: Extract<GridRow, { kind: "group" }>;
  gridTemplate: string;
  /** The visible column set — the tracks a total can land in, and their alignment. */
  columns: ColumnMeta[];
  collapsed: boolean;
  onToggle: () => void;
  /** Drop target only — group headers are never themselves dragged. */
  drag?: RowDragBinding;
  compact: boolean;
  /** Totals for the rows under this header, keyed by column id. */
  totals?: Record<string, ReactNode> | null;
  /** A fact about the group with no column of its own. */
  note?: ReactNode;
  /** Host-rendered controls. Responsible for their own `stopPropagation`. */
  chrome?: ReactNode;
}) {
  const layout = totalsLayout(columns, totals);
  const totalColumns = columns.slice(layout.labelSpan - 1);
  return (
    <div
      role="row"
      aria-expanded={!collapsed}
      onClick={onToggle}
      onDragOver={
        drag &&
        ((event) => {
          // Treat the whole header as "inside" the group — no before/after line on a bar.
          if (!drag.onOver("inside")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        })
      }
      onDragLeave={drag && (() => drag.onLeave())}
      onDrop={
        drag &&
        ((event) => {
          event.preventDefault();
          drag.onDrop("inside");
        })
      }
      className={[
        // Sticky in both layouts: scrolling through forty rows of a group without being
        // able to see which group you are in is the failure mode grouping exists to avoid.
        // `bg-surface-raised` (not `/80`) so rows do not show through while it is pinned.
        // `pr-3` only, matching `DataRow`: a group header that pads its left edge shrinks
        // the flexible name track by that much and every total lands a few pixels off the
        // values it sums. The chevron takes the handle gutter, where the row handles are.
        "sticky top-0 z-10 grid cursor-pointer items-center border-b border-rule bg-surface-raised text-[0.8125rem] font-semibold text-ink hover:brightness-95",
        compact ? "px-3" : "pr-3",
        // A compact header is a section label rather than a row in a template, and is tall
        // enough to tap.
        compact ? "min-h-9 py-1.5" : "",
        drag?.hint ? "bg-select-edge/10 ring-2 ring-select-edge ring-inset" : "",
      ].join(" ")}
      style={{
        // Nested headers stack rather than cover each other: each level parks one row-height
        // lower than its parent, and outer levels keep the higher z so they stay on top.
        top: compact
          ? `calc(${row.depth} * 2.25rem)`
          : `calc(${row.depth} * var(--row-height))`,
        zIndex: 20 - row.depth,
        ...(compact
          ? {}
          : {
              gridTemplateColumns: gridTemplate,
              columnGap: "0.75rem",
              height: "var(--row-height)",
            }),
      }}
    >
      <div
        role="rowheader"
        // The inset lives on the cell, not the row: padding the row would shrink the
        // flexible name track and pull every total off its column.
        className={`flex min-w-0 items-center gap-1.5 ${compact ? "flex-wrap" : "pl-3"}`}
        style={compact ? undefined : { gridColumn: `1 / span ${layout.labelSpan}` }}
      >
        <span
          className="text-[0.625rem] text-ink-faint"
          style={{ marginLeft: `${row.depth * 0.75}rem` }}
        >
          {collapsed ? "▶" : "▼"}
        </span>
        <span className="min-w-0 truncate">{row.label}</span>
        <span className="tabular text-[0.75rem] font-normal text-ink-faint">
          ({row.count})
        </span>
        {note != null && (
          <span className="min-w-0 truncate pl-2 text-[0.75rem] font-normal text-ink-faint">
            {note}
          </span>
        )}
        {chrome}
        {/*
          A phone row has no columns to align to, so the totals stay an inline run here —
          but built from the same record and labelled with each column’s own heading, since
          nothing above them says what they are. See `components/responsive.md`.
        */}
        {compact && totals != null && (
          <span className="tabular flex flex-wrap items-baseline gap-x-3 pl-2 text-[0.75rem] font-normal text-ink-muted">
            {columns.map((column) =>
              totals[column.id] === undefined ? null : (
                <span key={column.id}>
                  {column.label} <span className="text-ink">{totals[column.id]}</span>
                </span>
              ),
            )}
          </span>
        )}
      </div>
      {/*
        One cell per column from here right, so a total sits under the values it sums and
        goes off-screen exactly when its own column does. The earlier design put the run of
        figures beside the label because the header spanned every track, which left `ml-auto`
        no edge to reach but the far right of the whole grid; per-column cells are what that
        comment should have reached for, so do not retry the flex approach.
      */}
      {!compact &&
        totalColumns.map((column, index) => (
          <div
            key={column.id}
            role="gridcell"
            className={`tabular flex min-w-0 items-center self-stretch overflow-hidden text-[0.75rem] font-normal text-ink-muted ${alignClass(column.align)}`}
          >
            {layout.cells[index] === null ? null : totals?.[column.id]}
          </div>
        ))}
    </div>
  );
});

/**
 * Drop filtered-out rows, drop group headers left with nothing under them, and **restate
 * the counts** on the headers that survive.
 *
 * Recounting is the part that is easy to miss and impossible to miss once seen: the counts
 * come from the unfiltered slice, so a header reading "Career (7)" above a single visible
 * row is not a rounding error, it is a claim the user can see is false. A count beside a
 * filtered list has to be the count of that list.
 */
