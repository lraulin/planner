"use client";

import type { NodeState, PriorityLetter } from "@/db/schema";
import { encodePriority } from "@/lib/achieve/encodings";
import { toDateKey } from "@/lib/schedule/geometry";
import type { OutlineNode } from "@/lib/tree/types";
import { formatCompactDate, formatPriority } from "@/lib/tree/format";
import { STATE_CODES, STATE_LABELS } from "@/lib/tree/hierarchy";
import type { ColumnDef } from "./columns";
import {
  AbbrStateCell,
  DeadlineCell,
  NameCell,
  PercentCell,
  PriorityCell,
  ReadOnlyCell,
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

/**
 * Achieve's two-letter State codes back to their full labels, for the set filter. Built
 * from `STATE_CODES` rather than written out again, so a new state cannot appear in one
 * map and not the other.
 */
const STATE_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  (Object.keys(STATE_CODES) as (keyof typeof STATE_CODES)[]).map((state) => [
    STATE_CODES[state],
    STATE_LABELS[state],
  ]),
);

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
    // Achieve's int encoding so A1 < A2 < A10 < B, and blank sorts last (null).
    sortValue: (row) =>
      row.node.priorityLetter
        ? encodePriority({
            letter: row.node.priorityLetter,
            rank: row.node.priorityRank,
          })
        : null,
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
    filterValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
    sortValue: (row) => (row.node.deadline ? toDateKey(row.node.deadline) : null),
    // The filter's day key is the wrong shape for a meta chip; "12 Sep" is the same
    // information in a third of the width.
    compactText: (row) =>
      formatCompactDate(
        row.node.deadline ? toDateKey(row.node.deadline) : null,
        new Date().getFullYear(),
      ),
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
    // Filters on the code, because that is what the cell shows and what stored filters
    // already match on; the set filter spells it out via `filterLabel`.
    filterValue: (row) => STATE_CODES[row.node.state],
    filterLabel: (code) => STATE_LABEL_BY_CODE[code] ?? code,
    sortValue: (row) => row.node.state,
    render: (row, ctx) => (
      <AbbrStateCell
        node={row.node}
        onChange={(state) => ctx.onStateChange(row.node, state)}
      />
    ),
  };
}

/**
 * Category, inherited from the nearest ancestor that carries one (`effectiveCategory`, see
 * `derive.ts`). Read-only: the value belongs to the Result Area that set it, and editing it
 * from a task's row would silently rewrite every sibling under that area.
 *
 * Exists so Category is an ordinary column — showable, sortable, filterable, reachable from
 * the advanced filter and the search box — rather than a grouping dimension with no visible
 * value behind it. Off by default in every preset; add it from Show Fields.
 */
export function categoryColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "category",
    label: "Category",
    width: "8rem",
    filterKind: "enum",
    filterValue: (row) => row.node.effectiveCategory,
    sortValue: (row) => row.node.effectiveCategory,
    // Already the outermost grouping on most views; a chip repeating it on every phone row
    // spends a slot on something the section header above it already says.
    compact: "hidden",
    render: (row) => <ReadOnlyCell value={row.node.effectiveCategory ?? ""} />,
  };
}

export function percentColumn(): ColumnDef<OutlineColumnCtx> {
  return {
    id: "percent",
    label: "%",
    width: "3rem",
    align: "right",
    sortValue: (row) => row.node.percentCompleteRollup,
    // 0% on every untouched row would be noise; only progress is worth a chip.
    compactText: (row) =>
      row.node.percentCompleteRollup > 0 ? `${row.node.percentCompleteRollup}%` : null,
    render: (row) => <PercentCell node={row.node} />,
  };
}

/**
 * The name cell, with inline rename and the expander.
 *
 * Indent comes from `row.depth`. On the Outline that is full tree depth. On Projects and
 * Tasks, `sliceTree` re-bases it onto kept ancestors only — so a project under a filtered-
 * out goal sits at 0, and only real subprojects / subtasks indent. The Chooser passes
 * `flat: true` because its ranking is cross-project and must not imply nesting.
 */
export function nameColumn(
  options: { width?: string; flat?: boolean; dragHandle?: boolean } = {},
): ColumnDef<OutlineColumnCtx> {
  const { width = "minmax(14rem,1.4fr)", flat = false, dragHandle = false } = options;

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
        depth={flat ? 0 : row.depth}
        selected={row.node.id === ctx.selectedId}
        editing={row.node.id === ctx.editingId}
        dragHandle={dragHandle}
        onToggleCollapsed={() => ctx.onToggleCollapsed(row.node)}
        onOpenDetail={() => ctx.onOpenDetail(row.node)}
        onFinishEdit={(name) => ctx.onFinishEdit(row.node, name)}
        onCancelEdit={ctx.onCancelEdit}
      />
    ),
  };
}
