"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { asGroupBy, treeGridRows, type GroupBy } from "@/lib/tree/slice";
import { formatEffort } from "@/lib/tree/format";
import {
  scheduleStatusById,
  scheduleStatusForNode,
  STATUS_LABELS,
} from "@/lib/tree/status";
import { taskRatio } from "@/lib/tree/taskRatio";
import type { ColumnDef } from "@/components/grid/columns";
import { CascadeConfirm } from "@/components/grid/CascadeConfirm";
import { DataGrid } from "@/components/grid/DataGrid";
import { type GridDefaults, useIncludeDeferred } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { useTreeRowDrag } from "@/components/grid/useTreeRowDrag";
import {
  GridToolbar,
  switchValue,
  type GridSwitch,
} from "@/components/grid/GridToolbar";
import { collectDistinctValues } from "@/lib/grid/distinct";
import { openStateFilters, settledStateFilters } from "@/lib/grid/stateFilters";
import {
  abbrStateColumn,
  actualEffortColumn,
  actualStartColumn,
  assigneeColumn,
  categoryColumn,
  typeColumn,
  completedColumn,
  contextsColumn,
  costColumn,
  dateCompletedColumn,
  dateCreatedColumn,
  deadlineColumn,
  descriptionColumn,
  effortDrivenColumn,
  focusColumn,
  lapColumn,
  leadTimeColumn,
  nameColumn,
  percentColumn,
  placeColumn,
  priorityColumn,
  purposeColumn,
  resultAreaNameColumn,
  stateColumn,
  targetEndColumn,
  targetStartColumn,
} from "@/components/grid/commonColumns";
import { EffortCell, ReadOnlyCell, StatusCell } from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { ToolbarSelect, ToolbarToggle } from "./tabChrome";
import { useGridTab } from "./useGridTab";
import { useNodeCommandDeck } from "@/components/grid/useNodeCommandDeck";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

/** Projects' default order leads with the narrow State column, which filters on codes. */
const OPEN = openStateFilters("abbrState", "code");
const SETTLED = settledStateFilters("abbrState", "code");

type ViewId =
  | "active-status"
  | "active-schedule"
  | "active-purpose"
  | "active-delegation"
  | "completed"
  | "all";

/**
 * Views as collections of settings — see the same note on Tasks. The four `active-*` views
 * share one State filter and differ only in the column layout each stores; "Completed" is the
 * mirror filter, and "All" simply has none.
 */
const VIEWS: { id: ViewId; label: string; filters?: GridDefaults["filters"] }[] = [
  { id: "active-status", label: "Active Project Status", filters: OPEN },
  { id: "active-schedule", label: "Active Project Schedule", filters: OPEN },
  { id: "active-purpose", label: "Active Project Purpose", filters: OPEN },
  { id: "active-delegation", label: "Active Project Delegation", filters: OPEN },
  { id: "completed", label: "Completed Projects", filters: SETTLED },
  { id: "all", label: "All Projects" },
];

const STATUS_COLUMNS = [
  "abbrState",
  "priority",
  "name",
  "tasks",
  "effort",
  "effortLeft",
  "targetStart",
  "deadline",
  "percent",
  "status",
  "lap",
] as const;

function buildColumns(
  allNodes: OutlineNode[],
  today: string | null,
): ColumnDef<OutlineColumnCtx>[] {
  const statuses = scheduleStatusById(allNodes, today);
  return [
    abbrStateColumn(today),
    priorityColumn(),
    nameColumn({ dragHandle: true }),
    categoryColumn(),
    typeColumn(),
    {
      id: "tasks",
      label: "Tasks",
      width: "4rem",
      align: "right",
      sortValue: (row) => taskRatio(row.node.id, allNodes),
      render: (row) => (
        <ReadOnlyCell value={taskRatio(row.node.id, allNodes)} align="right" />
      ),
    },
    {
      id: "effort",
      label: "Effort",
      width: "4.5rem",
      align: "right",
      filterKind: "text",
      filterValue: (row) => formatEffort(row.node.effortRollupMinutes) || null,
      sortValue: (row) => row.node.effortRollupMinutes ?? -1,
      render: (row, ctx) => (
        <EffortCell
          key={`effort:${formatEffort(row.node.effortMinutes)}`}
          node={row.node}
          onChange={(minutes) => ctx.onEffortChange(row.node, minutes)}
        />
      ),
    },
    {
      id: "effortLeft",
      label: "Left",
      width: "4.5rem",
      align: "right",
      sortValue: (row) => row.node.effortLeftRollupMinutes ?? -1,
      // Reads as a second effort chip with no label to tell them apart.
      compact: "hidden",
      render: (row) => (
        <ReadOnlyCell
          value={formatEffort(row.node.effortLeftRollupMinutes)}
          align="right"
        />
      ),
    },
    // Compact-hidden like the prior hand-rolled column: two bare dates compete on a phone.
    { ...targetStartColumn(), compact: "hidden" as const },
    deadlineColumn(),
    percentColumn(),
    {
      id: "status",
      label: "Status",
      width: "7.5rem",
      filterKind: "enum",
      // Derived from the state and deadline chips already on the line.
      compact: "hidden",
      filterValue: (row) => {
        const status =
          statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today);
        return status === null ? null : STATUS_LABELS[status];
      },
      sortValue: (row) =>
        statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today),
      render: (row, ctx) => (
        <StatusCell
          node={row.node}
          today={ctx.today}
          status={statuses.get(row.node.id)}
        />
      ),
    },
    lapColumn(),
    purposeColumn(),
    assigneeColumn(),
    // Optional AP fields — available via Show Fields; not in view defaults.
    actualEffortColumn(),
    actualStartColumn(),
    completedColumn(),
    contextsColumn(),
    dateCompletedColumn(),
    dateCreatedColumn(),
    descriptionColumn(),
    effortDrivenColumn(),
    costColumn("expectedCost", "Expected cost", (node) => node.expectedCost),
    focusColumn(),
    costColumn("costHigh", "High cost", (node) => node.costHigh),
    leadTimeColumn(),
    costColumn("costLow", "Low cost", (node) => node.costLow),
    placeColumn(),
    resultAreaNameColumn(),
    stateColumn(today),
    targetEndColumn(),
  ];
}

/** A built-in view's column preset, or the tab's default for a saved id. */
function viewOrder(view: string): string[] {
  switch (view) {
    case "active-purpose":
      return ["abbrState", "priority", "name", "purpose", "status", "deadline"];
    case "active-delegation":
      return ["abbrState", "priority", "name", "assignedTo", "status", "deadline"];
    case "active-schedule":
      return [
        "abbrState",
        "priority",
        "name",
        "targetStart",
        "deadline",
        "effort",
        "effortLeft",
        "status",
      ];
    default:
      return [...STATUS_COLUMNS];
  }
}

/**
 * What each built-in view opens as. Module scope, so `useModuleViews` can memoise on the view
 * id — `viewOrder` builds a fresh array per call.
 */
function viewDefaults(id: string): GridDefaults {
  return {
    order: viewOrder(id),
    groupBy: PROJECT_DEFAULT_GROUP_BY,
    filters: VIEWS.find((entry) => entry.id === id)?.filters,
  };
}

/**
 * Toolbar toggles this tab declares. They live in the persisted `switches` map rather than
 * component state, so they survive a reload like every other grid preference.
 *
 * `includeDeferred` keeps its own hook: it is stored on the **tab** scope so one setting
 * covers every sub-view, where these are per-view.
 */
const PROJECT_SWITCHES: GridSwitch[] = [
  { id: "includeGoals", label: "Goals", defaultOn: false },
];

/**
 * Achieve opens Projects grouped Category → Result Area. That used to be a `Groups` toggle
 * beside the picker, which meant Group by → (None) still showed headers — two controls for
 * one thing, with the older one quietly winning. It is the tab's **default grouping** now,
 * so the picker shows it, can extend it, and can genuinely clear it.
 */
const PROJECT_DEFAULT_GROUP_BY = ["category", "resultArea"];

/**
 * Module scope so the identity is stable — see the note in `useNodeCommandDeck`.
 *
 * One kind, so the button says `New project` rather than `New`. A project shown here can sit
 * under a goal or a result area, but this module only ever *makes* projects; use the Outline (or
 * the Goals tab) to originate the levels above.
 */
const PROJECT_CREATE_KINDS = ["project"] as const;

/** Dimensions worth offering here. Goal is included; a project's goal is its natural home. */
const PROJECT_GROUP_DIMENSIONS: GroupBy[] = [
  "category",
  "resultArea",
  "goal",
  "state",
  "priorityLetter",
  "deadlineBand",
];

export function ProjectsGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const nodeCommands = useNodeCommandDeck({
    nodes: tab.nodes,
    selectedId: tab.selectedId,
    selectedIds: tab.selectedIds,
    apply: tab.apply,
    create: {
      kinds: PROJECT_CREATE_KINDS,
      // Narrowed to a Result Area, `New project` makes one *in* that area — otherwise the row
      // would be filed where this view cannot show it, and naming it would never begin.
      parentId: tab.scope ?? null,
      child: true,
      onCreated: tab.startNaming,
    },
    onOpen: tab.openDetail,
    onRename: tab.setEditingId,
    onCopyAsText: tab.copySelectionAsText,
    onSelectAll: tab.selectAll,
    onStateChange: tab.cellHandlers.onStateChange,
  });
  // From `?scope=` rather than local state, so the narrowing survives reload and Back —
  // and so `View tasks…` from another module is a plain navigation into it.
  const scopeId = tab.scope ?? "";
  const setScopeId = tab.setScope;
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("projects");
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const resultAreas = useMemo(
    () => tab.nodes.filter((n) => n.type === "result_area"),
    [tab.nodes],
  );

  const allColumns = useMemo(
    () => buildColumns(tab.nodes, tab.today),
    [tab.nodes, tab.today],
  );
  const views = useModuleViews({
    moduleId: "projects",
    builtIn: VIEWS,
    defaultViewId: "active-status",
    columns: allColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
  const rowDrag = useTreeRowDrag({
    nodes: tab.nodes,
    byId: tab.byId,
    apply: tab.apply,
    patch: tab.patch,
    selectOne: tab.selectOne,
    headerSorts: gridState.sorts,
    clearHeaderSort: gridState.clearSort,
  });

  const includeGoals = switchValue(gridState, PROJECT_SWITCHES[0]);

  // When the view changes, reset to that view's preset (still overridable via Show Fields).
  const columns = gridState.columns;

  const preparedRows = useMemo(() => {
    const groupBy = asGroupBy(gridState.groupBy);

    return treeGridRows(tab.nodes, {
      // Structural only — which states a view shows is its default State filter.
      keep: (node) => node.type === "project" || (includeGoals && node.type === "goal"),
      groupBy,
      scopeId: scopeId || null,
      includeDeferred,
      today: tab.today,
    });
  }, [tab.nodes, tab.today, gridState.groupBy, includeGoals, includeDeferred, scopeId]);
  const { rows, narrowingRows } = preparedRows;

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        allColumns,
        narrowingRows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [allColumns, narrowingRows],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <GridToolbar
        grid={gridState}
        gridLabel="Projects"
        allColumns={allColumns}
        distinctValues={distinctValues}
        groupDimensions={PROJECT_GROUP_DIMENSIONS}
        groupIds={groupIds}
        switches={PROJECT_SWITCHES}
        counts={counts}
        error={tab.error}
        views={views}
        left={
          <>
            <ToolbarSelect
              label="Result Area"
              value={scopeId}
              onChange={setScopeId}
              options={[
                { value: "", label: "All Result Areas" },
                ...resultAreas.map((area) => ({ value: area.id, label: area.name })),
              ]}
            />
            {/* Tab-scoped, not per-view: one Postponed setting covers every sub-view. */}
            <ToolbarToggle
              checked={includeDeferred}
              onChange={() => setIncludeDeferred(!includeDeferred)}
              label="Postponed"
            />
          </>
        }
        commandCapabilities={nodeCommands.capabilities}
      />

      {nodeCommands.dialogs}

      <DataGrid
        rows={rows}
        narrowingRows={narrowingRows}
        columns={columns}
        allColumns={allColumns}
        columnCtx={tab.cellHandlers}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        selectAllState={tab.headerState}
        onToggleSelectAll={tab.toggleSelectAll}
        gutter="handle"
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Projects"
        onNavigableIdsChange={tab.setNavigableIds}
        rowMenu={nodeCommands.rowMenu}
        rowSwipe={nodeCommands.rowSwipe}
        rowDrag={rowDrag}
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
            No projects match this view.
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
