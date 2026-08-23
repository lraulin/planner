"use client";

import type { ColumnDef, NodeGridRow } from "@/components/grid/columns";
import { formatUsd } from "@/lib/finances/money";
import { balanceTone, goalTone, type BudgetRow } from "@/lib/finances/budget/rows";

/**
 * Three columns, and only three.
 *
 * Assigned is the one thing the user controls, Activity is what the bank did, and Balance is
 * the answer. Actual shows the same trio for the same reason: any fourth column is derivable
 * from these and competes with the number the row exists to state.
 */

export type BudgetColumnCtx = {
  /** Commit an inline assignment. Cents, absolute. */
  onAssign: (row: BudgetRow, cents: number) => void;
  /** Open the row's menu at the balance cell, where the cover/move actions belong. */
  onBalanceMenu: (row: BudgetRow, at: { x: number; y: number }) => void;
  pending: boolean;
};

/**
 * Goal-met / goal-not-met on the Assigned cell.
 *
 * The comparison is against `goalCents` — what Apply last wrote — not a live recompute, so
 * editing Assigned by hand afterwards still shows whether the template was met rather than
 * quietly redefining the goal to whatever was just typed.
 */
const GOAL_CLASS: Record<"met" | "unmet", string> = {
  // `ring-inset` rather than a thicker border: it doubles the weight of a 1px tint on a small
  // input without changing the cell's box, so paging between months cannot nudge the grid.
  met: "border-[var(--chart-income)] ring-1 ring-inset ring-[var(--chart-income)]",
  unmet: "border-[var(--goal-unmet)] ring-1 ring-inset ring-[var(--goal-unmet)]",
};

const TONE_CLASS: Record<ReturnType<typeof balanceTone>, string> = {
  positive: "text-[var(--chart-income)]",
  zero: "text-ink-faint",
  negative: "text-[var(--chart-spend)]",
};

function assignedCell(row: NodeGridRow<BudgetRow>, ctx: BudgetColumnCtx) {
  // Income is never assigned — it feeds Ready to Assign and holds no balance — so the cell is
  // blank rather than a zero the user might try to type into.
  if (row.node.isIncome) return <span className="text-ink-faint">—</span>;

  const tone = goalTone(row.node.assignedCents, row.node.goalCents);

  return (
    <input
      key={row.node.assignedCents}
      title={
        row.node.goalCents === null
          ? undefined
          : `Goal ${formatUsd(row.node.goalCents)} \u00b7 assigned ${formatUsd(row.node.assignedCents)}`
      }
      type="text"
      inputMode="decimal"
      defaultValue={(row.node.assignedCents / 100).toFixed(2)}
      disabled={ctx.pending}
      aria-label={`Assigned to ${row.node.name}`}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = (row.node.assignedCents / 100).toFixed(2);
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const next = Math.round(
          Number(event.target.value.replace(/[$,\s]/g, "")) * 100,
        );
        if (!Number.isFinite(next)) {
          event.target.value = (row.node.assignedCents / 100).toFixed(2);
          return;
        }
        if (next !== row.node.assignedCents) ctx.onAssign(row.node, next);
      }}
      className={`tabular w-24 rounded border bg-surface px-1 text-right text-base text-ink md:text-[0.8125rem] ${
        tone ? GOAL_CLASS[tone] : "border-rule"
      }`}
    />
  );
}

export const budgetColumns: ColumnDef<BudgetColumnCtx, BudgetRow>[] = [
  {
    id: "name",
    label: "Envelope",
    width: "minmax(12rem,1fr)",
    hideable: false,
    render: (row) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={`truncate ${row.node.hidden ? "text-ink-faint italic" : ""}`}>
          {row.node.name}
        </span>
        {row.node.carryover ? (
          <span
            title="Overspending rolls into this envelope instead of onto Ready to Assign"
            className="shrink-0 rounded bg-surface-raised px-1 text-[0.625rem] text-ink-faint"
          >
            rolls over
          </span>
        ) : null}
      </span>
    ),
    sortValue: (row) => row.node.name,
    filterValue: (row) => row.node.name,
    compactText: (row) => row.node.name,
  },
  {
    id: "assigned",
    label: "Assigned",
    width: "7rem",
    align: "right",
    hideable: false,
    render: assignedCell,
    sortValue: (row) => row.node.assignedCents,
    compactText: (row) =>
      row.node.isIncome ? null : formatUsd(row.node.assignedCents),
  },
  {
    id: "activity",
    label: "Activity",
    width: "7rem",
    align: "right",
    render: (row) => (
      <span
        className={`tabular ${row.node.activityCents === 0 ? "text-ink-faint" : "text-ink"}`}
      >
        {formatUsd(row.node.activityCents)}
      </span>
    ),
    sortValue: (row) => row.node.activityCents,
    compactText: (row) => formatUsd(row.node.activityCents),
  },
  {
    id: "balance",
    label: "Balance",
    width: "7.5rem",
    align: "right",
    hideable: false,
    render: (row, ctx) => {
      if (row.node.isIncome) return <span className="text-ink-faint">—</span>;
      return (
        <button
          type="button"
          onClick={(event) =>
            ctx.onBalanceMenu(row.node, { x: event.clientX, y: event.clientY })
          }
          title="Cover, move money, or roll overspending forward"
          className={`tabular rounded px-1 hover:bg-surface-raised ${TONE_CLASS[balanceTone(row.node.balanceCents)]}`}
        >
          {formatUsd(row.node.balanceCents)}
        </button>
      );
    },
    sortValue: (row) => row.node.balanceCents,
    compactText: (row) => (row.node.isIncome ? null : formatUsd(row.node.balanceCents)),
  },
];
