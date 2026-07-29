"use client";

import type { NodeState, PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import { STATE_LABELS } from "@/lib/tree/hierarchy";
import type { ColumnDef } from "@/components/grid/columns";
import {
  DeadlineCell,
  EffortCell,
  FocusCell,
  NameCell,
  PriorityCell,
  StateCell,
} from "@/components/grid/cells";

/**
 * Callbacks and rendering context the outline columns close over. Kept as a single object
 * so column defs stay pure data + render, and OutlineGrid can swap the handlers freely.
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

export const OUTLINE_COLUMN_IDS = [
  "priority",
  "name",
  "effort",
  "deadline",
  "state",
  "focus",
] as const;

/**
 * The outline's fixed column set, expressed as shared `ColumnDef`s. Priority leads, as it
 * does on Projects, Tasks and Goals — and as it did in Achieve, where the narrow columns
 * sat to the left of the indented tree rather than off past its ragged right edge.
 */
export const outlineColumns: ColumnDef<OutlineColumnCtx>[] = [
  {
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
  },
  {
    id: "name",
    label: "Name",
    width: "minmax(16rem,1fr)",
    hideable: false,
    filterValue: (row) => row.node.name,
    filterKind: "text",
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
    id: "state",
    label: "State",
    width: "7rem",
    filterKind: "enum",
    filterValue: (row) => STATE_LABELS[row.node.state],
    sortValue: (row) => row.node.state,
    render: (row, ctx) => (
      <StateCell
        node={row.node}
        onChange={(state) => ctx.onStateChange(row.node, state)}
      />
    ),
  },
  {
    id: "focus",
    label: "Focus",
    width: "3rem",
    align: "center",
    sortValue: (row) => (row.node.focus ? 1 : 0),
    render: (row, ctx) => (
      <FocusCell
        node={row.node}
        onChange={(focus) => ctx.onFocusChange(row.node, focus)}
      />
    ),
  },
];
