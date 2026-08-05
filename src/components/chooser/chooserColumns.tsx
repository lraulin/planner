import type { ColumnDef } from "@/components/grid/columns";
import { EffortCell, FocusCell, StatusCell } from "@/components/grid/cells";
import type { OutlineColumnCtx } from "@/components/outline/outlineColumns";
import type { PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { formatEffort, formatPriority } from "@/lib/tree/format";
import { toDateKey } from "@/lib/schedule/geometry";
import { TcPriorityCell } from "./TcPriorityCell";
import { scheduleStatusForNode, STATUS_LABELS } from "@/lib/tree/status";
import {
  abbrStateColumn,
  categoryColumn,
  deadlineColumn,
  nameColumn,
  priorityColumn,
} from "@/components/grid/commonColumns";

/**
 * Columns for the Task Chooser, matching Achieve's own set (State / Pri / Name / Effort
 * Left / Deadline / Status) plus the two this reimplementation adds: the **rank** number
 * down the left of the screenshot, and the **Score** the ranking is actually built from.
 *
 * The row payload stays `OutlineNode`, so every cell is reused from the other grid tabs
 * unchanged. Rank, score, and the inherited deadline ride along in the column ctx instead.
 */

/** What the chooser knows about a row that the node itself does not carry. */
export type ChooserFacts = {
  rank: number;
  score: number;
  effectiveDeadline: Date | null;
};

export type ChooserColumnCtx = OutlineColumnCtx & {
  facts: Map<string, ChooserFacts>;
  onTcAssign: (
    node: OutlineNode,
    letter: PriorityLetter | null,
    rank: number | null,
  ) => void;
};

/** Columns shown before anyone touches Show Fields. */
export const CHOOSER_DEFAULT_ORDER = [
  "rank",
  "abbrState",
  "priority",
  "name",
  "effortLeft",
  "deadline",
  "status",
  "score",
];

/**
 * The To-do List's preset: **TC Priority replaces Pri**, and Score goes away.
 *
 * Both omissions are the point. This view is ordered by hand, so showing a score the
 * ordering ignores would invite you to wonder why row 3 outranks row 2; and the outline's
 * sibling-relative Pri is a different question from "what am I doing next", which is the
 * one this list answers.
 */
export const CHOOSER_TODO_ORDER = [
  "tcPriority",
  "abbrState",
  "name",
  "effortLeft",
  "deadline",
  "status",
];

export function buildChooserColumns(
  today: string | null,
): ColumnDef<ChooserColumnCtx>[] {
  return [
    {
      id: "rank",
      label: "#",
      width: "2.5rem",
      align: "right",
      hideable: true,
      render: (row, ctx) => (
        <span className="tabular text-[0.75rem] text-ink-faint">
          {ctx.facts.get(row.node.id)?.rank ?? ""}
        </span>
      ),
    },
    abbrStateColumn(today),
    priorityColumn(),
    {
      // The flat cross-project ranking. Default column of the To-do List, available
      // anywhere else via Show Fields — it is a real field on the task, not a view's
      // private state.
      id: "tcPriority",
      label: "TC Pri",
      width: "3.5rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank) || null,
      sortValue: (row) =>
        formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank),
      render: (row, ctx) => (
        <TcPriorityCell
          key={`tc:${formatPriority(row.node.tcPriorityLetter, row.node.tcPriorityRank)}`}
          node={row.node}
          onAssign={(letter, rank) => ctx.onTcAssign(row.node, letter, rank)}
        />
      ),
    },
    {
      // Inherited priority, which is what the score actually reads. Off by default, but
      // it is the first thing to turn on when a row's position looks wrong.
      id: "lap",
      label: "L.A.P.",
      width: "3.5rem",
      align: "center",
      filterKind: "priority",
      filterValue: (row) =>
        formatPriority(row.node.lapLetter, row.node.lapRank) || null,
      sortValue: (row) => formatPriority(row.node.lapLetter, row.node.lapRank),
      render: (row) => (
        <span className="tabular text-[0.75rem] text-ink-muted">
          {formatPriority(row.node.lapLetter, row.node.lapRank)}
        </span>
      ),
    },
    {
      id: "focus",
      label: "Fo",
      width: "2.5rem",
      align: "center",
      filterKind: "enum",
      filterValue: (row) => (row.node.focus ? "Focus" : "—"),
      sortValue: (row) => (row.node.focus ? 0 : 1),
      render: (row, ctx) => (
        <FocusCell
          node={row.node}
          onChange={(focus) => ctx.onFocusChange(row.node, focus)}
        />
      ),
    },
    nameColumn({ flat: true, dragHandle: true }),
    categoryColumn(),
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
            /* effort left is rolled; edits go through the drawer, as on the Tasks tab */
          }}
        />
      ),
    },
    deadlineColumn(),
    {
      // The deadline the *score* uses: the item's own, or the tightest one it inherits.
      // Off by default — it exists to explain why an undated task is near the top.
      id: "effectiveDeadline",
      label: "Due (incl. parents)",
      width: "8rem",
      align: "right",
      // No sortValue/filterValue: this value lives in the ctx, which `ColumnDef` does not
      // hand to those callbacks. The list is score-ordered anyway.
      render: (row, ctx) => {
        const due = ctx.facts.get(row.node.id)?.effectiveDeadline ?? null;
        if (!due) return null;
        const value = toDateKey(due);
        const inherited = row.node.deadline === null;
        return (
          <span
            title={inherited ? "Inherited from a parent" : undefined}
            className={`tabular text-[0.75rem] ${inherited ? "text-ink-faint italic" : "text-ink-muted"}`}
          >
            {value}
          </span>
        );
      },
    },
    {
      id: "status",
      label: "Status",
      width: "7.5rem",
      filterKind: "enum",
      filterValue: (row) => STATUS_LABELS[scheduleStatusForNode(row.node, today)],
      render: (row, ctx) => <StatusCell node={row.node} today={ctx.today} />,
    },
    {
      id: "score",
      label: "Score",
      width: "4rem",
      align: "right",
      // Not sortable for the same reason, and it would be a no-op: the rows arrive in
      // score order already.
      render: (row, ctx) => (
        <span className="tabular text-[0.75rem] text-ink-muted">
          {ctx.facts.get(row.node.id)?.score ?? ""}
        </span>
      ),
    },
  ];
}
