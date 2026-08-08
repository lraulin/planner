"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { asGroupBy, sliceTree, type GridRow, type GroupBy } from "@/lib/tree/slice";
import type { ColumnDef } from "@/components/grid/columns";
import { CascadeConfirm } from "@/components/grid/CascadeConfirm";
import { DataGrid } from "@/components/grid/DataGrid";
import { useIncludeDeferred, type GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { GridToolbar } from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import {
  actualEffortColumn,
  categoryColumn,
  contextsColumn,
  dateCreatedColumn,
  dateModifiedColumn,
  descriptionColumn,
  effortLeftColumn,
  percentColumn,
} from "@/components/grid/commonColumns";
import { NameCell, TextCell } from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { setResultAreaFieldsAction } from "@/app/outline/detail-actions";
import { ToolbarToggle } from "./tabChrome";
import { useGridTab } from "./useGridTab";
import { useNodeCommandDeck } from "@/components/grid/useNodeCommandDeck";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

type ViewId = "all";

/**
 * One built-in view. A person has eight or ten result areas, so slicing is not what this
 * list is for.
 *
 * A "By Importance" preset would have been the obvious second one — Achieve's whole premise
 * is that the areas are weighted against each other, and that comparison is unreadable in
 * name order. `GridDefaults` carries order, grouping, filters and switches but **not sorts**,
 * so a built-in view cannot preset one. Sorts do persist per view, so sorting by Importance
 * and saving that as a named view gets there by the route saved views exist for.
 */
const VIEWS: { id: ViewId; label: string }[] = [
  { id: "all", label: "All Result Areas" },
];

const DEFAULT_ORDER = [
  "category",
  "name",
  "importance",
  "description",
  "percent",
  "effortLeft",
];

function viewDefaults(): GridDefaults {
  return { order: DEFAULT_ORDER };
}

type ResultAreasCtx = OutlineColumnCtx & {
  onCategoryChange: (node: OutlineNode, value: string) => void;
  onImportanceChange: (node: OutlineNode, value: number | null) => void;
  onDescriptionChange: (node: OutlineNode, value: string) => void;
};

function buildColumns(): ColumnDef<ResultAreasCtx>[] {
  return [
    {
      ...categoryColumn(),
      render: (row, ctx) => (
        <TextCell
          key={`cat:${row.node.category ?? ""}`}
          value={row.node.category ?? ""}
          ariaLabel="Category"
          onChange={(value) => ctx.onCategoryChange(row.node, value)}
        />
      ),
    },
    {
      id: "name",
      label: "Result Area",
      width: "minmax(12rem,1fr)",
      hideable: false,
      filterKind: "text",
      filterValue: (row) => row.node.name,
      sortValue: (row) => row.node.name.toLowerCase(),
      render: (row, ctx) => (
        <NameCell
          node={row.node}
          depth={0}
          selected={row.node.id === ctx.selectedId}
          editing={row.node.id === ctx.editingId}
          onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
          onOpenDetail={() => ctx.onOpenDetail(row.node)}
          onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
          onCancelEdit={ctx.onCancelEdit}
        />
      ),
    },
    {
      id: "importance",
      label: "Importance",
      width: "6rem",
      align: "right",
      filterKind: "text",
      filterValue: (row) =>
        row.node.importance === null ? null : String(row.node.importance),
      sortValue: (row) => row.node.importance,
      render: (row, ctx) => (
        <ImportanceCell
          key={`imp:${row.node.importance ?? ""}`}
          value={row.node.importance}
          onChange={(value) => ctx.onImportanceChange(row.node, value)}
        />
      ),
    },
    {
      ...descriptionColumn(),
      render: (row, ctx) => (
        <TextCell
          key={`desc:${row.node.description}`}
          value={row.node.description}
          ariaLabel="Description"
          onChange={(value) => ctx.onDescriptionChange(row.node, value)}
        />
      ),
    },
    // Rollups over everything under the area — read-only, and the point of the tab: how much
    // of your committed work actually sits under the areas you called important.
    percentColumn(),
    effortLeftColumn(),
    // Optional fields — available via Show Fields; not in DEFAULT_ORDER.
    actualEffortColumn(),
    contextsColumn(),
    dateCreatedColumn(),
    dateModifiedColumn(),
  ] as ColumnDef<ResultAreasCtx>[];
}

/** Category is the only dimension a flat list of result areas can meaningfully group by. */
const RESULT_AREA_GROUP_DIMENSIONS: GroupBy[] = ["category"];

/** Module scope so the identity is stable — see the note in `useNodeCommandDeck`. */
const RESULT_AREA_CREATE_KINDS = ["result_area"] as const;

/**
 * Result Areas module — Achieve's `Go -> Result Areas` (manual §10.2).
 *
 * The rows have always existed as the outline's top level; what this adds is seeing them
 * *as a set*, with their weights side by side and the work beneath each one rolled up.
 * Editing a name, category, importance or description happens here; everything else is the
 * existing Result Area drawer.
 */
export function ResultAreasGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const nodeCommands = useNodeCommandDeck({
    nodes: tab.nodes,
    selectedId: tab.selectedId,
    selectedIds: tab.selectedIds,
    apply: tab.apply,
    // Result areas are the outline's top level, so there is no scope to create into — and a
    // sub-area is the one nesting this module can express, which `New sub-area` now does.
    create: {
      kinds: RESULT_AREA_CREATE_KINDS,
      child: true,
      onCreated: tab.startNaming,
    },
    onOpen: tab.openDetail,
    onRename: tab.setEditingId,
    onCopyAsText: tab.copySelectionAsText,
    onStateChange: tab.cellHandlers.onStateChange,
  });
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const allColumns = useMemo(() => buildColumns(), []);
  const views = useModuleViews({
    moduleId: "result-areas",
    builtIn: VIEWS,
    defaultViewId: "all",
    columns: allColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("result-areas");

  const rows: GridRow[] = useMemo(
    () =>
      sliceTree(tab.nodes, {
        keep: (node) => node.type === "result_area",
        groupBy: asGroupBy(gridState.groupBy),
        scopeId: null,
        includeDeferred,
        today: tab.today,
      }),
    [tab.nodes, tab.today, gridState.groupBy, includeDeferred],
  );

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        allColumns,
        rows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [allColumns, rows],
  );

  const columnCtx: ResultAreasCtx = useMemo(
    () => ({
      ...tab.cellHandlers,
      onCategoryChange: (node, value) => {
        const next = value.trim() || null;
        tab.patch(node.id, { category: next });
        tab.apply(() => setResultAreaFieldsAction(node.id, { category: next }));
      },
      onImportanceChange: (node, value) => {
        tab.patch(node.id, { importance: value });
        tab.apply(() => setResultAreaFieldsAction(node.id, { importance: value }));
      },
      onDescriptionChange: (node, value) => {
        tab.patch(node.id, { description: value });
        tab.apply(() => setResultAreaFieldsAction(node.id, { description: value }));
      },
    }),
    [tab],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Result Areas"
        allColumns={allColumns}
        distinctValues={distinctValues}
        groupDimensions={RESULT_AREA_GROUP_DIMENSIONS}
        groupIds={groupIds}
        counts={counts}
        error={tab.error}
        views={views}
        left={
          <ToolbarToggle
            checked={includeDeferred}
            onChange={() => setIncludeDeferred(!includeDeferred)}
            label="Postponed"
          />
        }
        commandCapabilities={nodeCommands.capabilities}
      />

      {nodeCommands.dialogs}

      <DataGrid
        rows={rows}
        columns={gridState.columns}
        allColumns={allColumns}
        columnCtx={columnCtx}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Result Areas"
        rowNumbers
        onNavigableIdsChange={tab.setNavigableIds}
        rowMenu={nodeCommands.rowMenu}
        rowSwipe={nodeCommands.rowSwipe}
        enableFilters
        enableSort
        sorts={gridState.sorts}
        onSortChange={gridState.toggleSort}
        onSetSort={gridState.setSort}
        filters={gridState.filters}
        onFilterChange={gridState.setFilter}
        advancedFilter={gridState.advancedFilter}
        search={gridState.search}
        distinctValues={distinctValues}
        onCountsChange={setCounts}
        widths={gridState.widths}
        onResizeColumn={gridState.setWidth}
        onResetColumnWidth={gridState.clearWidth}
        columnControls={gridState.columnControls}
        collapsedGroups={gridState.collapsedGroups}
        onToggleGroup={gridState.toggleGroup}
        onGroupIdsChange={setGroupIds}
        density={gridState.density}
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No result areas match this view.
          </div>
        }
      />

      <CascadeConfirm state={tab.stateChange} />

      <NodeDetailDrawer
        node={tab.detailNode}
        nodes={tab.nodes}
        onClose={() => tab.setDetailId(null)}
      />
    </div>
  );
}

/**
 * Achieve's 0–100 weighting. Out-of-range input clamps rather than rejecting: the value is
 * a rough weight, and refusing "150" teaches nothing that clamping to 100 does not.
 */
function ImportanceCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const current = value === null ? "" : String(value);
  const [draft, setDraft] = useState(current);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (value !== null) onChange(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      setDraft(current);
      return;
    }
    const clamped = Math.min(100, Math.max(0, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <input
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setDraft(current);
          event.currentTarget.blur();
        }
      }}
      aria-label="Importance"
      placeholder="—"
      inputMode="numeric"
      maxLength={3}
      className="tabular w-full border-none bg-transparent text-right text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint/50"
    />
  );
}
