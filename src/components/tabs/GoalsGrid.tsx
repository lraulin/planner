"use client";

import { useMemo } from "react";
import type { OutlineNode } from "@/lib/tree/types";
import type { OutlineWire } from "@/lib/tree/wire";
import { asGroupBy, treeGridRows, type GroupBy } from "@/lib/tree/slice";
import { formatPriority } from "@/lib/tree/format";
import { toDateKey } from "@/lib/schedule/geometry";
import type { ColumnDef } from "@/components/grid/columns";
import { useIncludeDeferred, type GridDefaults } from "@/components/grid/useGridState";
import { useModuleViews } from "@/components/grid/useModuleViews";
import { openStateFilters, settledStateFilters } from "@/lib/grid/stateFilters";
import {
  categoryColumn,
  typeColumn,
  dateCompletedColumn,
  purposeColumn,
  stateColumn,
} from "@/components/grid/commonColumns";
import { DeadlineCell, NameCell, TextCell } from "@/components/grid/cells";
import { setGoalFieldAction } from "@/app/(shell)/plan/outline/detail-actions";
import { ResultAreaScopePicker, ToolbarToggle } from "./tabChrome";
import { useGridTab } from "./useGridTab";
import { NodeTabGrid, useNodeTabCommands } from "./NodeTabGrid";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";
import { LetterRankCell } from "@/components/grid/LetterRankCell";

type ViewId = "all" | "active" | "completed";

/**
 * Views as collections of settings — see the note on Tasks. Goals' default order carries the
 * **wide** State column, which filters on full labels rather than Achieve's codes.
 */
const VIEWS: { id: ViewId; label: string; filters?: GridDefaults["filters"] }[] = [
  { id: "all", label: "All Goals" },
  { id: "active", label: "Active Goals", filters: openStateFilters("state", "label") },
  {
    id: "completed",
    label: "Completed Goals",
    filters: settledStateFilters("state", "label"),
  },
];

const DEFAULT_ORDER = ["priority", "name", "definition", "state", "deadline", "range"];

/** Module scope so `useModuleViews` gets a stable identity, not a fresh closure per render. */
function viewDefaults(id: string): GridDefaults {
  return {
    order: DEFAULT_ORDER,
    filters: VIEWS.find((entry) => entry.id === id)?.filters,
  };
}

type GoalsCtx = OutlineColumnCtx & {
  onDefinitionChange: (node: OutlineNode, value: string) => void;
  onRangeChange: (node: OutlineNode, value: string) => void;
};

function buildColumns(today: string | null): ColumnDef<GoalsCtx>[] {
  return [
    categoryColumn(),
    typeColumn(),
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
        <LetterRankCell
          letter={row.node.priorityLetter}
          rank={row.node.priorityRank}
          onAssign={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
          ariaLabel="Priority — A, B, C or D with a rank"
        />
      ),
    },
    {
      id: "name",
      label: "Title",
      width: "18rem",
      hideable: false,
      filterKind: "text",
      filterValue: (row) => row.node.name,
      sortValue: (row) => row.node.name.toLowerCase(),
      render: (row, ctx) => (
        <NameCell
          node={row.node}
          depth={row.node.depth}
          dragHandle
          editing={row.node.id === ctx.editingId}
          onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
          onOpenDetail={() => ctx.onOpenDetail(row.node)}
          onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
          onCancelEdit={ctx.onCancelEdit}
        />
      ),
    },
    {
      id: "definition",
      label: "Definition",
      width: "19rem",
      filterKind: "text",
      filterValue: (row) => row.node.definition || null,
      render: (row, ctx) => (
        <TextCell
          key={`def:${row.node.definition}`}
          value={row.node.definition}
          ariaLabel="Definition"
          onChange={(value) => ctx.onDefinitionChange(row.node, value)}
        />
      ),
    },
    // Goals tab: "Status" here is nodes.state spelled out, not the derived schedule
    // status. Only the heading differs from the shared column, so it borrows it rather
    // than keeping a second copy that has to be remembered whenever State changes.
    { ...stateColumn(today), label: "Status" },
    {
      id: "deadline",
      label: "Deadline",
      width: "7rem",
      align: "right",
      filterKind: "date",
      filterValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
      sortValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
      render: (row, ctx) => (
        <DeadlineCell
          node={row.node}
          today={ctx.today}
          onChange={(deadline) => ctx.onDeadlineChange(row.node, deadline)}
        />
      ),
    },
    {
      id: "range",
      label: "Range",
      width: "6rem",
      filterKind: "enum",
      filterValue: (row) => row.node.range || null,
      render: (row, ctx) => (
        <TextCell
          key={`range:${row.node.range}`}
          value={row.node.range}
          ariaLabel="Range"
          onChange={(value) => ctx.onRangeChange(row.node, value)}
        />
      ),
    },
    // Optional AP fields — available via Show Fields; not in DEFAULT_ORDER.
    dateCompletedColumn(),
    purposeColumn(),
  ];
}

/**
 * Both kinds, because this tab shows both — a Dream is a Goal you have not committed to a date
 * for, and it is filed here. Two kinds is also why the button stays `New` with the kinds behind
 * it: which one you meant is worth asking at the moment the row is made.
 *
 * Module scope so the identity is stable — see the note in `useNodeCommandDeck`.
 */
const GOAL_CREATE_KINDS = ["goal", "dream"] as const;

/** A goal has no project or deadline band worth grouping under; these are what remain. */
const GOAL_GROUP_DIMENSIONS: GroupBy[] = [
  "resultArea",
  "category",
  "state",
  "priorityLetter",
];

export function GoalsGrid({ wire }: { wire: OutlineWire }) {
  const tab = useGridTab(wire);
  // Narrowed to a Result Area, a new goal belongs to it.
  const nodeCommands = useNodeTabCommands(tab, {
    kinds: GOAL_CREATE_KINDS,
    parentId: tab.scope ?? null,
  });
  // From `?scope=` rather than local state, so the narrowing survives reload and Back —
  // and so `View tasks…` from another module is a plain navigation into it.
  const scopeId = tab.scope ?? "";
  const setScopeId = tab.setScope;

  const allColumns = useMemo(() => buildColumns(tab.today), [tab.today]);
  const views = useModuleViews({
    moduleId: "goals",
    builtIn: VIEWS,
    defaultViewId: "all",
    columns: allColumns,
    defaultsFor: viewDefaults,
  });
  const gridState = views.grid;
  const [includeDeferred, setIncludeDeferred] = useIncludeDeferred("goals");

  const preparedRows = useMemo(
    () =>
      treeGridRows(tab.nodes, {
        // Structural only — which states a view shows is its default State filter.
        keep: (node) => node.type === "goal",
        // Result Area is the arrangement Achieve ships; Group by overrides it on request.
        groupBy: (() => {
          const chosen = asGroupBy(gridState.groupBy);
          return chosen.length > 0 ? chosen : (["resultArea"] as GroupBy[]);
        })(),
        scopeId: scopeId || null,
        includeDeferred,
        today: tab.today,
      }),
    [tab.nodes, tab.today, scopeId, gridState.groupBy, includeDeferred],
  );
  const { rows, narrowingRows } = preparedRows;

  const columnCtx: GoalsCtx = useMemo(
    () => ({
      ...tab.cellHandlers,
      onDefinitionChange: (node, value) => {
        tab.patch(node.id, { definition: value });
        tab.apply(() => setGoalFieldAction(node.id, "definition", value));
      },
      onRangeChange: (node, value) => {
        tab.patch(node.id, { range: value });
        tab.apply(() => setGoalFieldAction(node.id, "range", value));
      },
    }),
    [tab],
  );

  return (
    <NodeTabGrid
      tab={tab}
      commands={nodeCommands}
      views={views}
      label="Goals"
      noun="goals"
      allColumns={allColumns}
      columnCtx={columnCtx}
      rows={rows}
      narrowingRows={narrowingRows}
      groupDimensions={GOAL_GROUP_DIMENSIONS}
      left={
        <>
          <ResultAreaScopePicker
            nodes={tab.nodes}
            scopeId={scopeId}
            onChange={setScopeId}
          />
          {/*
                Parity with Tasks and Projects. Goals used to hard-code `includeDeferred: true`,
                so a goal shelved until next quarter sat in the list with no way to put it away
                — the one node tab where shelving did nothing.
              */}
          <ToolbarToggle
            checked={includeDeferred}
            onChange={() => setIncludeDeferred(!includeDeferred)}
            label="Postponed"
          />
        </>
      }
    />
  );
}
