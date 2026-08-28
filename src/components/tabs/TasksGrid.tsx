"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { ContactOption } from "@/lib/contacts/types";
import { owningProjectId } from "@/lib/tree/owningProject";
import { asGroupBy, treeGridRows, type GroupBy, type GridRow } from "@/lib/tree/slice";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import {
  scheduleStatusById,
  scheduleStatusForNode,
  STATUS_LABELS,
} from "@/lib/tree/status";
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
import {
  abbrStateColumn,
  actualEffortColumn,
  actualStartColumn,
  categoryColumn,
  completedColumn,
  contextsColumn,
  costColumn,
  dateCompletedColumn,
  dateCreatedColumn,
  dateModifiedColumn,
  deadlineColumn,
  deadlineLeadTimeColumn,
  deferToColumn,
  descriptionColumn,
  effortDrivenColumn,
  focusColumn,
  leadTimeColumn,
  nameColumn,
  percentColumn,
  placeColumn,
  priorityColumn,
  stateColumn,
  targetEndColumn,
  targetStartColumn,
} from "@/components/grid/commonColumns";
import { EffortCell, StatusCell } from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import { ProjectScopePicker } from "@/components/projects/ProjectScopePicker";
import { ToolbarToggle } from "./tabChrome";
import { openStateFilters, settledStateFilters } from "@/lib/grid/stateFilters";
import { nextActionsOnly } from "@/lib/tree/nextActions";
import { useGridTab } from "./useGridTab";
import { useNodeCommandDeck } from "@/components/grid/useNodeCommandDeck";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

type ViewId = "active-status" | "active-schedule" | "completed" | "all";

/**
 * A view is a **collection of settings**, not a mode: its `defaults` are ordinary stored
 * values the user can see as chips, change, and clear. What used to be a hidden `keep`
 * predicate inside `sliceTree` — "active means not completed or cancelled" — is a State
 * filter here, so the grid says what it is doing and you can combine it with anything.
 *
 * `active-status` and `active-schedule` differ only in the column layout each has stored
 * under its own `grid:tasks.{view}` scope; that is what a preset is.
 */
const DEFAULT_ORDER = [
  "abbrState",
  "priority",
  "name",
  "effort",
  "effortLeft",
  "deadline",
  "percent",
  "status",
];

const VIEWS: { id: ViewId; label: string; defaults: GridDefaults }[] = [
  {
    id: "active-status",
    label: "Active Task Status",
    defaults: {
      order: DEFAULT_ORDER,
      filters: openStateFilters("abbrState", "code"),
    },
  },
  {
    id: "active-schedule",
    label: "Active Task Schedule",
    defaults: {
      order: DEFAULT_ORDER,
      filters: openStateFilters("abbrState", "code"),
    },
  },
  {
    id: "completed",
    label: "Completed Tasks",
    defaults: {
      order: DEFAULT_ORDER,
      filters: settledStateFilters("abbrState", "code"),
    },
  },
  { id: "all", label: "All Tasks", defaults: { order: DEFAULT_ORDER } },
];

/**
 * A built-in view's defaults. Only ever called with a built-in id — `useModuleViews` resolves a
 * saved view to the one it was saved from, and layers that view's own settings on top.
 */
function viewDefaults(id: string): GridDefaults {
  return VIEWS.find((entry) => entry.id === id)?.defaults ?? { order: DEFAULT_ORDER };
}

function buildColumns(
  allNodes: OutlineNode[],
  today: string | null,
  contactById: ReadonlyMap<string, string>,
): ColumnDef<OutlineColumnCtx>[] {
  const statuses = scheduleStatusById(allNodes, today);
  return [
    abbrStateColumn(today),
    priorityColumn(),
    nameColumn({ dragHandle: true }),
    categoryColumn(),
    {
      id: "effort",
      label: "Effort",
      width: "4.5rem",
      align: "right",
      sortValue: (row) => row.node.effortRollupMinutes ?? -1,
      // This column has no filter to borrow text from, and "how long is it" is one of the
      // three things worth a chip on a phone.
      compactText: (row) => formatEffort(row.node.effortRollupMinutes) || null,
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
        <EffortCell
          key={`left:${formatEffort(row.node.effortLeftMinutes)}`}
          node={row.node}
          field="effortLeft"
          onChange={() => {
            /* effort left is rolled; edits go through the drawer for now */
          }}
        />
      ),
    },
    deadlineColumn(),
    percentColumn(),
    {
      // The Task Chooser's flat cross-project ranking. Off by default — it belongs to the
      // chooser — but it is a real field on the task, so it is available here too, where
      // triage already happens. Read-only: assigning a rank means placing it among all the
      // others, which is the chooser's job.
      id: "tcPriority",
      label: "TC Pri",
      width: "3.5rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank) || null,
      sortValue: (row) =>
        formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank),
      render: (row) => (
        <span className="tabular text-[0.8125rem] font-medium text-ink-muted">
          {formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank)}
        </span>
      ),
    },
    {
      id: "status",
      label: "Status",
      width: "7.5rem",
      filterKind: "enum",
      filterValue: (row) => {
        const status =
          statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today);
        return status === null ? null : STATUS_LABELS[status];
      },
      // Derived from dates + state (manual §3.8 bands), with child→parent roll-up.
      compact: "hidden",
      render: (row, ctx) => (
        <StatusCell
          node={row.node}
          today={ctx.today}
          status={statuses.get(row.node.id)}
        />
      ),
    },
    // Optional AP fields — available via Show Fields; not in DEFAULT_ORDER.
    actualEffortColumn(),
    actualStartColumn(),
    completedColumn(),
    contextsColumn(),
    costColumn("costToDate", "Cost to date", (node) => node.costToDate),
    dateCreatedColumn(),
    dateModifiedColumn(),
    deadlineLeadTimeColumn(),
    deferToColumn(),
    descriptionColumn(),
    effortDrivenColumn(),
    costColumn("costHigh", "High cost", (node) => node.costHigh),
    leadTimeColumn(),
    costColumn("costLow", "Low cost", (node) => node.costLow),
    placeColumn(),
    dateCompletedColumn(),
    stateColumn(today),
    targetEndColumn(),
    targetStartColumn(),
    focusColumn(),
    {
      // `contactId` travels through the outline's existing task-details join. Names are
      // deliberately resolved here from a page-level lookup — adding another join to the
      // recursive outline query would charge every page for an optional Tasks column.
      id: "contact",
      label: "Contact",
      width: "10rem",
      filterKind: "text",
      filterValue: (row) =>
        row.node.contactId ? (contactById.get(row.node.contactId) ?? null) : null,
      sortValue: (row) =>
        row.node.contactId
          ? (contactById.get(row.node.contactId)?.toLowerCase() ?? null)
          : null,
      compact: "hidden",
      render: (row) => {
        const name = row.node.contactId ? contactById.get(row.node.contactId) : null;
        return (
          <span
            className="truncate text-[0.8125rem] text-ink-muted"
            title={name ?? undefined}
          >
            {name ?? ""}
          </span>
        );
      },
    },
  ];
}

/**
 * Toolbar toggles this tab declares, persisted in `switches` rather than component state.
 *
 * `Group by Area` used to live here. It is Result Area in the Group by picker now — a
 * toggle beside a picker that does the same thing meant `(None)` did not mean none.
 */
const TASK_SWITCHES: GridSwitch[] = [
  {
    id: "nextActions",
    label: "Next actions",
    defaultOn: false,
    title:
      "Only the first open step under each task — plan a sequence without it crowding the list",
  },
  { id: "showPurpose", label: "Project's Purpose", defaultOn: false },
];

/** Module scope so the identity is stable — see the note in `useNodeCommandDeck`. */
const TASK_CREATE_KINDS = ["task"] as const;

/** Same dimensions as Projects, plus Project — a task's home is its project. */
const TASK_GROUP_DIMENSIONS: GroupBy[] = [
  "category",
  "resultArea",
  "project",
  "goal",
  "state",
  "priorityLetter",
  "deadlineBand",
];

export function TasksGrid({
  initialNodes,
  contactOptions,
}: {
  initialNodes: OutlineNode[];
  /** Name lookup for the optional Contact column; see `buildColumns`. */
  contactOptions: ContactOption[];
}) {
  const tab = useGridTab(initialNodes);
  const nodeCommands = useNodeCommandDeck({
    nodes: tab.nodes,
    selectedId: tab.selectedId,
    selectedIds: tab.selectedIds,
    apply: tab.apply,
    create: {
      kinds: TASK_CREATE_KINDS,
      // Scoped to a project, `New task` makes one *in* that project. `__none__` is the opposite
      // filter — tasks with no project above them — so it creates at the top level, which is
      // exactly the row that view is for.
      parentId: tab.scope && tab.scope !== "__none__" ? tab.scope : null,
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
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("tasks");
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const contactById = useMemo(
    () => new Map(contactOptions.map((contact) => [contact.id, contact.displayName])),
    [contactOptions],
  );

  const allColumns = useMemo(
    () => buildColumns(tab.nodes, tab.today, contactById),
    [tab.nodes, tab.today, contactById],
  );
  const views = useModuleViews({
    moduleId: "tasks",
    builtIn: VIEWS,
    defaultViewId: "active-status",
    columns: allColumns,
    defaultsFor: viewDefaults,
    // The Project picker is part of what a Tasks view is. Built-ins leave it
    // alone; a saved view restores the project that was selected at Save.
    branchScope: tab.scope,
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

  const nextActions = switchValue(gridState, TASK_SWITCHES[0]);
  const showPurpose = switchValue(gridState, TASK_SWITCHES[1]);

  const purposeText = useMemo(() => {
    if (!showPurpose || !scopeId) return null;
    const project = tab.byId.get(scopeId);
    return project?.purpose ?? "";
  }, [showPurpose, scopeId, tab.byId]);

  /**
   * Next actions narrows the **tree**, before slicing: the rule is about which of a task's
   * siblings is available, so it has to see them as siblings. Running it on the sliced rows
   * would judge a re-based list where every task looks top-level.
   */
  const sourceNodes = useMemo(
    () => (nextActions ? nextActionsOnly(tab.nodes) : tab.nodes),
    [nextActions, tab.nodes],
  );

  const preparedRows = useMemo(() => {
    const groupBy = asGroupBy(gridState.groupBy);
    const prepared = treeGridRows(sourceNodes, {
      // Structural only. Which *states* a view shows is its default State filter, which
      // the user can see and change; being a task is what makes this the Tasks tab.
      keep: (node) => node.type === "task",
      groupBy,
      // Empty scope = all; special "__none__" = tasks with no project ancestor.
      scopeId: scopeId && scopeId !== "__none__" ? scopeId : null,
      includeDeferred,
      today: tab.today,
    });
    const inScope = (row: GridRow) => {
      if (scopeId !== "__none__" || row.kind !== "node") return true;
      // The full tree, not the next-actions slice: a hidden project ancestor still
      // files the task.
      return owningProjectId(tab.nodes, row.node.id) === null;
    };
    return {
      rows: prepared.rows.filter(inScope),
      narrowingRows: prepared.narrowingRows.filter(inScope),
    };
  }, [sourceNodes, tab.nodes, tab.today, gridState.groupBy, includeDeferred, scopeId]);
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
        gridLabel="Tasks"
        allColumns={allColumns}
        distinctValues={distinctValues}
        groupDimensions={TASK_GROUP_DIMENSIONS}
        groupIds={groupIds}
        switches={TASK_SWITCHES}
        counts={counts}
        error={tab.error}
        views={views}
        left={
          <>
            <ProjectScopePicker
              nodes={tab.nodes}
              scopeId={scopeId}
              onChange={setScopeId}
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

      {showPurpose && (
        <div className="flex-none border-b border-rule bg-surface-raised/60 px-4 py-2">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
            Project&apos;s Purpose
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-[0.8125rem] text-ink-muted">
            {scopeId
              ? purposeText || "No purpose recorded for this project."
              : "Select a project to show its purpose."}
          </p>
        </div>
      )}

      <DataGrid
        rows={rows}
        narrowingRows={narrowingRows}
        columns={gridState.columns}
        allColumns={allColumns}
        columnCtx={tab.cellHandlers}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        selectAllState={tab.headerState}
        onToggleSelectAll={tab.toggleSelectAll}
        gutter="handle"
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Tasks"
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
            No tasks match this view.
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
