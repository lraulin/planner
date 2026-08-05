"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { asGroupBy, sliceTree, type GroupBy, type GridRow } from "@/lib/tree/slice";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import {
  scheduleStatusById,
  scheduleStatusForNode,
  STATUS_LABELS,
} from "@/lib/tree/status";
import type { ColumnDef } from "@/components/grid/columns";
import { CascadeConfirm } from "@/components/grid/CascadeConfirm";
import { DataGrid } from "@/components/grid/DataGrid";
import {
  useGridState,
  type GridDefaults,
  useIncludeDeferred,
  useTabView,
} from "@/components/grid/useGridState";
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
import { ToolbarSelect, ToolbarToggle } from "./tabChrome";
import { openStateFilters, settledStateFilters } from "@/lib/grid/stateFilters";
import { ViewPicker } from "@/components/grid/ViewPicker";
import {
  savedViewDefaults,
  snapshotOf,
  useSavedViews,
} from "@/components/grid/useSavedViews";
import { nextActionsOnly } from "@/lib/tree/nextActions";
import { useGridTab } from "./useGridTab";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

const VIEW_IDS = ["active-status", "active-schedule", "completed", "all"] as const;

type ViewId = (typeof VIEW_IDS)[number];

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

/** A built-in view's defaults, or the tab's preset for a saved id. */
function viewDefaults(id: string): GridDefaults {
  return VIEWS.find((entry) => entry.id === id)?.defaults ?? { order: DEFAULT_ORDER };
}

function buildColumns(
  allNodes: OutlineNode[],
  today: string | null,
): ColumnDef<OutlineColumnCtx>[] {
  const statuses = scheduleStatusById(allNodes, today);
  return [
    abbrStateColumn(),
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
      filterValue: (row) =>
        STATUS_LABELS[
          statuses.get(row.node.id) ?? scheduleStatusForNode(row.node, today)
        ],
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
    stateColumn(),
    targetEndColumn(),
    targetStartColumn(),
    focusColumn(),
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

export function TasksGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const savedViews = useSavedViews("tasks");
  /**
   * Saved ids join the built-ins so `useTabView` treats them as legal selections. Deleting
   * one drops it from this list, and the stored preference falls back rather than leaving
   * the tab pointing at a view that no longer exists.
   */
  const viewIds = useMemo(
    () => [...VIEW_IDS, ...savedViews.views.map((entry) => entry.id)],
    [savedViews.views],
  );
  const [view, setView] = useTabView("tasks", viewIds, "active-status");
  const [scopeId, setScopeId] = useState<string>("");
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("tasks");
  const [counts, setCounts] = useState({ shown: 0, total: 0 });
  const [groupIds, setGroupIds] = useState<string[]>([]);

  const projects = useMemo(
    () => tab.nodes.filter((n) => n.type === "project"),
    [tab.nodes],
  );

  const allColumns = useMemo(
    () => buildColumns(tab.nodes, tab.today),
    [tab.nodes, tab.today],
  );
  const gridState = useGridState(
    `tasks.${view}`,
    allColumns,
    savedViewDefaults(savedViews.find(view), viewDefaults(view)),
  );
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

  const rows: GridRow[] = useMemo(() => {
    const groupBy = asGroupBy(gridState.groupBy);
    return sliceTree(sourceNodes, {
      // Structural only. Which *states* a view shows is its default State filter, which
      // the user can see and change; being a task is what makes this the Tasks tab.
      keep: (node) => node.type === "task",
      groupBy,
      // Empty scope = all; special "__none__" = tasks with no project ancestor.
      scopeId: scopeId && scopeId !== "__none__" ? scopeId : null,
      includeDeferred,
      today: tab.today,
    }).filter((row) => {
      if (scopeId !== "__none__" || row.kind !== "node") return true;
      // No project in the ancestor chain.
      let cur: OutlineNode | undefined = row.node;
      while (cur) {
        if (cur.type === "project") return false;
        cur = cur.parentId ? tab.byId.get(cur.parentId) : undefined;
      }
      return true;
    });
  }, [sourceNodes, tab.byId, tab.today, gridState.groupBy, includeDeferred, scopeId]);

  const distinctValues = useMemo(
    () =>
      collectDistinctValues(
        allColumns,
        rows.flatMap((row) => (row.kind === "node" ? [row] : [])),
      ),
    [allColumns, rows],
  );

  const navigableIds = useMemo(
    () => rows.flatMap((row) => (row.kind === "node" ? [row.id] : [])),
    [rows],
  );
  const navigableKey = navigableIds.join("\0");
  const [seenNavigable, setSeenNavigable] = useState(navigableKey);
  if (navigableKey !== seenNavigable) {
    setSeenNavigable(navigableKey);
    tab.setNavigableIds(navigableIds);
  }

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
        left={
          <>
            <ToolbarSelect
              label="Project"
              value={scopeId}
              onChange={setScopeId}
              options={[
                { value: "", label: "<All Projects>" },
                { value: "__none__", label: "<No Project>" },
                ...projects.map((project) => ({
                  value: project.id,
                  label: project.name || "Untitled project",
                })),
              ]}
            />
            <ViewPicker
              value={view}
              onChange={setView}
              builtIn={VIEWS}
              saved={savedViews}
              onSave={(name) => setView(savedViews.save(name, snapshotOf(gridState)))}
              onDelete={(id) => {
                setView(VIEWS[0].id);
                savedViews.remove(id);
              }}
            />
            {/* Tab-scoped, not per-view: one Postponed setting covers every sub-view. */}
            <ToolbarToggle
              checked={includeDeferred}
              onChange={() => setIncludeDeferred(!includeDeferred)}
              label="Postponed"
            />
          </>
        }
        rowActions={{
          selectedId: tab.selectedId,
          onRename: tab.setEditingId,
          onOpen: tab.openDetail,
        }}
      />

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
        columns={gridState.columns}
        allColumns={allColumns}
        columnCtx={tab.cellHandlers}
        selectedId={tab.selectedId}
        selectedIds={tab.selectedIds}
        onSelect={tab.select}
        onOpenDetail={tab.openDetail}
        ariaLabel="Tasks"
        rowNumbers
        rowMenu={tab.rowMenu}
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
