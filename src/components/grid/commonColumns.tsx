"use client";

import type { NodeState, PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { formatPriority } from "@/lib/tree/format";
import { STATE_CODES } from "@/lib/tree/hierarchy";
import type { ColumnDef } from "./columns";
import {
  AbbrStateCell,
  DeadlineCell,
  NameCell,
  PercentCell,
  PriorityCell,
} from "./cells";

/**
 * Column definitions shared by the node grids.
 *
 * `priority` and `deadline` were byte-identical in four files; `abbrState` in three and
 * `percent` in two. Those live here now, so a change to how a priority filters happens
 * once instead of four times with three of them silently drifting.
 *
 * **Not everything with a shared id belongs here.** `effort`, `effortLeft`, `status`,
 * `focus`, `lap` and `tcPriority` also repeat across tabs, but they genuinely differ —
 * Projects renders effort-left as a read-only rollup where Tasks lets you edit it, the
 * Chooser's TC Priority is assignable where the Tasks one is not, only Projects sorts by
 * status. Forcing those into a factory would mean three or four option flags each, which
 * is harder to read than the duplication and easier to get wrong.
 */

/**
 * Callbacks and rendering context the node columns close over. Kept as a single object so
 * column defs stay pure data + render, and each grid can swap the handlers freely.
 */
export type OutlineColumnCtx = {
  today: string | null;
  selectedId: string | null;
  editingId: string | null;
  nodeDepths: Map<string, number>;
  onToggleCollapsed: (node: OutlineNode) => void;
  onOpenDetail: (node: OutlineNode) => void;
  onFinishEdit: (node: OutlineNode, name: string) => void;
  onCancelEdit: () => void;
  onPriorityChange: (
    node: OutlineNode,
    letter: PriorityLetter | null,
    rank: number | null,
  ) => void;
  onStateChange: (node: OutlineNode, state: NodeState) => void;
  onFocusChange: (node: OutlineNode, focus: boolean) => void;
  onDeadlineChange: (node: OutlineNode, deadline: string | null) => void;
  onEffortChange: (node: OutlineNode, minutes: number | null) => void;
};

/** ABCD priority with its rank — `A1`, `B`, or blank. */
export function priorityColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "priority",
    label: "Pri",
    width: "3rem",
    align: "center",
    filterKind: "priority",
    filterValue: (row) =>
      formatPriority(row.node.priorityLetter, row.node.priorityRank) || null,
    sortValue: (row) => formatPriority(row.node.priorityLetter, row.node.priorityRank),
    render: (row, ctx) => (
      <PriorityCell
        key={`priority:${formatPriority(row.node.priorityLetter, row.node.priorityRank)}`}
        node={row.node}
        onChange={(letter, rank) => ctx.onPriorityChange(row.node, letter, rank)}
      />
    ),
  };
}

export function deadlineColumn(): ColumnDef<OutlineColumnCtx> {
  return {
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
  };
}

/** Achieve's two-letter State code — `NS`, `IP`, `C`. */
export function abbrStateColumn(): ColumnDef<OutlineColumnCtx> {
  return {
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
  };
}

export function percentColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "percent",
    label: "%",
    width: "3rem",
    align: "right",
    sortValue: (row) => row.node.percentCompleteRollup,
    render: (row) => <PercentCell node={row.node} />,
  };
}

/**
 * The name cell, with inline rename and the expander.
 *
 * Two things vary. The outline gives the tree more room than the list tabs do, and the
 * Chooser renders flat — its rows are ranked across projects, so an indent inherited from
 * the outline would suggest a nesting that the ordering does not follow.
 */
export function nameColumn(
  options: { width?: string; flat?: boolean } = {},
): ColumnDef<OutlineColumnCtx> {
  const { width = "minmax(14rem,1.4fr)", flat = false } = options;

  return {
    id: "name",
    label: "Name",
    width,
    hideable: false,
    filterKind: "text",
    filterValue: (row) => row.node.name,
    sortValue: (row) => row.node.name.toLowerCase(),
    render: (row, ctx) => (
      <NameCell
        node={row.node}
        depth={flat ? 0 : (ctx.nodeDepths.get(row.node.id) ?? 0)}
        selected={row.node.id === ctx.selectedId}
        editing={row.node.id === ctx.editingId}
        onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
        onOpenDetail={() => ctx.onOpenDetail(row.node)}
        onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
        onCancelEdit={ctx.onCancelEdit}
      />
    ),
  };
}
