"use client";

import { useMemo, useState } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import { sliceTree, type GroupBy, type GridRow } from "@/lib/tree/slice";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import { STATE_CODES } from "@/lib/tree/hierarchy";
import { scheduleStatus, STATUS_LABELS } from "@/lib/tree/status";
import type { ColumnDef } from "@/components/grid/columns";
import { DataGrid } from "@/components/grid/DataGrid";
import { useGridColumns } from "@/components/grid/useGridColumns";
import { ShowFieldsDialog } from "@/components/grid/ShowFieldsDialog";
import {
  AbbrStateCell,
  DeadlineCell,
  EffortCell,
  NameCell,
  PercentCell,
  PriorityCell,
  StatusCell,
} from "@/components/grid/cells";
import { NodeDetailDrawer } from "@/components/detail/NodeDetailDrawer";
import {
  ErrorBanner,
  TabToolbar,
  ToolbarButton,
  ToolbarSelect,
  ToolbarToggle,
} from "./tabChrome";
import { useGridTab } from "./useGridTab";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";

type ViewId = "active-status" | "active-schedule" | "completed" | "all";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "active-status", label: "Active Task Status" },
  { id: "active-schedule", label: "Active Task Schedule" },
  { id: "completed", label: "Completed Tasks" },
  { id: "all", label: "All Tasks" },
];

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

function isActive(node: OutlineNode): boolean {
  return node.state !== "completed" && node.state !== "cancelled";
}

function buildColumns(): ColumnDef<OutlineColumnCtx>[] {
  return [
    {
      id: "abbrState",
      label: "State",
      width: "3.5rem",
      align: "center",
      filterKind: "enum",
      filterValue: (row) => STATE_CODES[row.node.state],
      sortValue: (row) => row.node.state,
      render: (row, ctx) => (
        <AbbrStateCell
          node={row.node}
          onChange={(state) => ctx.onStateChange(row.node, state)}
        />
      ),
    },
    {
      id: "priority",
      label: "Pri",
      width: "3rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
      sortValue: (row) =>
        formatPriority(row.node.priorityLetter, row.node.priorityRank),
      render: (row, ctx) => (
        <PriorityCell
          key={`priority:${formatPriority(row.node.priorityLetter, row.node.priorityRank)}`}
          node={row.node}
          onChange={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
        />
      ),
    },
    {
      id: "name",
      label: "Name",
      width: "minmax(14rem,1.4fr)",
      hideable: false,
      filterKind: "text",
      filterValue: (row) => row.node.name,
      sortValue: (row) => row.node.name.toLowerCase(),
      render: (row, ctx) => (
        <NameCell
          node={row.node}
          depth={ctx.nodeDepths.get(row.node.id) ?? 0}
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
      id: "effort",
      label: "Effort",
      width: "4.5rem",
      align: "right",
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
    {
      id: "deadline",
      label: "Deadline",
      width: "7rem",
      align: "right",
      filterKind: "date",
      filterValue: (row) =>
        row.node.deadline ? row.node.deadline.toISOString().slice(0, 10) : null,
      sortValue: (row) =>
        row.node.deadline ? row.node.deadline.toISOString().slice(0, 10) : null,
      render: (row, ctx) => (
        <DeadlineCell
          node={row.node}
          today={ctx.today}
          onChange={(deadline) => ctx.onDeadlineChange(row.node, deadline)}
        />
      ),
    },
    {
      id: "percent",
      label: "%",
      width: "3rem",
      align: "right",
      sortValue: (row) => row.node.percentCompleteRollup,
      render: (row) => <PercentCell node={row.node} />,
    },
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
        STATUS_LABELS[scheduleStatus(row.node.deadline, null, row.node.state)],
      render: (row, ctx) => <StatusCell node={row.node} today={ctx.today} />,
    },
  ];
}

export function TasksGrid({ initialNodes }: { initialNodes: OutlineNode[] }) {
  const tab = useGridTab(initialNodes);
  const [view, setView] = useState<ViewId>("active-status");
  const [scopeId, setScopeId] = useState<string>("");
  const [groupByArea, setGroupByArea] = useState(false);
  const [includeDeferred, setIncludeDeferred] = useState(false);
  const [showPurpose, setShowPurpose] = useState(false);
  const [showFields, setShowFields] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const projects = useMemo(
    () => tab.nodes.filter((n) => n.type === "project"),
    [tab.nodes],
  );

  const allColumns = useMemo(() => buildColumns(), []);
  const columnState = useGridColumns(`tasks:${view}`, allColumns, DEFAULT_ORDER);

  const purposeText = useMemo(() => {
    if (!showPurpose || !scopeId) return null;
    const project = tab.byId.get(scopeId);
    return project?.purpose ?? "";
  }, [showPurpose, scopeId, tab.byId]);

  const rows: GridRow[] = useMemo(() => {
    const groupBy: GroupBy[] = groupByArea ? ["resultArea"] : [];
    return sliceTree(tab.nodes, {
      keep: (node) => {
        if (node.type !== "task") return false;
        if (view === "completed") return node.state === "completed";
        if (view === "all") return true;
        return isActive(node);
      },
      groupBy,
      // Empty scope = all; special "__none__" = tasks with no project ancestor.
      scopeId: scopeId && scopeId !== "__none__" ? scopeId : null,
      includeDeferred,
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
  }, [tab.nodes, tab.byId, view, groupByArea, includeDeferred, scopeId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <TabToolbar>
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
        <ToolbarSelect
          label="View"
          value={view}
          onChange={(value) => setView(value as ViewId)}
          options={VIEWS.map((entry) => ({ value: entry.id, label: entry.label }))}
        />
        <ToolbarToggle
          checked={groupByArea}
          onChange={() => setGroupByArea((v) => !v)}
          label="Group by Area"
        />
        <ToolbarToggle
          checked={includeDeferred}
          onChange={() => setIncludeDeferred((v) => !v)}
          label="Deferred"
        />
        <ToolbarToggle
          checked={showPurpose}
          onChange={() => setShowPurpose((v) => !v)}
          label="Project's Purpose"
        />
        <ToolbarButton onClick={() => setShowFields(true)}>Show Fields</ToolbarButton>
        <ToolbarButton
          onClick={() => tab.selectedId && tab.setEditingId(tab.selectedId)}
          disabled={!tab.selectedId}
          title="F2"
        >
          Rename
        </ToolbarButton>
        <ToolbarButton
          onClick={() => tab.selectedId && tab.openDetail(tab.selectedId)}
          disabled={!tab.selectedId}
          title="Enter"
        >
          Open
        </ToolbarButton>
      </TabToolbar>

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

      {tab.error && <ErrorBanner message={tab.error} />}

      <DataGrid
        rows={rows}
        columns={columnState.columns}
        columnCtx={tab.cellHandlers}
        selectedId={tab.selectedId}
        onSelect={tab.setSelectedId}
        onOpenDetail={tab.openDetail}
        ariaLabel="Tasks"
        rowMenu={tab.rowMenu}
        enableFilters
        enableSort
        collapsedGroups={collapsedGroups}
        onToggleGroup={(id) =>
          setCollapsedGroups((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        empty={
          <div className="flex h-full items-center justify-center p-8 text-[0.9375rem] text-ink-muted">
            No tasks match this view.
          </div>
        }
      />

      <NodeDetailDrawer node={tab.detailNode} onClose={() => tab.setDetailId(null)} />

      <ShowFieldsDialog
        open={showFields}
        allColumns={allColumns}
        shownIds={columnState.order}
        onShow={columnState.show}
        onHide={columnState.hide}
        onMove={columnState.move}
        onReset={columnState.reset}
        onClose={() => setShowFields(false)}
      />
    </div>
  );
}
