"use client";

import { formatUsd } from "@/lib/finances/money";
import { readyToAssignNote, type BudgetMonth } from "@/lib/finances/budget/envelope";

/**
 * Ready to Assign, and the five terms that make it.
 *
 * **The terms come from the fold, not from this component.** `month.terms` is built beside
 * the arithmetic precisely so a page cannot render a breakdown that fails to add up to its
 * own headline — the same reason `availableToSpend` returns its terms.
 *
 * Zero is the target and gets its own tone: in zero-based budgeting a green surplus is not
 * success, it is money without a job.
 */
export function BudgetSummary({
  month,
  accountPoolCents,
  action = "assign",
  onAction,
}: {
  month: BudgetMonth;
  /** When viewing the current month, the live on-budget working pool. */
  accountPoolCents?: number;
  /** Same slot: Assign, or Fix This when Ready to Assign is negative on a current/future month. */
  action?: "assign" | "fix-this";
  onAction?: () => void;
}) {
  const ready = month.readyToAssignCents;
  const tone =
    ready < 0
      ? "text-[var(--chart-spend)]"
      : ready === 0
        ? "text-[var(--chart-income)]"
        : "text-ink";
  const fixThis = action === "fix-this";

  return (
    <section className="rounded border border-rule bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`tabular text-[2.25rem] leading-none font-medium ${tone}`}>
          {formatUsd(ready)}
        </span>
        {onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={
              fixThis
                ? "min-h-tap rounded border border-[var(--chart-spend)] px-2 py-1 text-[0.8125rem] text-[var(--chart-spend)] hover:bg-[color-mix(in_srgb,var(--chart-spend)_12%,transparent)] md:min-h-0"
                : "min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            }
          >
            {fixThis ? "Fix This" : "Assign"}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[0.8125rem] text-ink-muted">{readyToAssignNote(ready)}</p>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-rule pt-2">
        {month.terms.map((term) => (
          <div key={term.label} className="flex items-baseline gap-1.5">
            <dt className="text-[0.75rem] text-ink-muted">{term.label}</dt>
            <dd
              className={`tabular text-[0.8125rem] ${
                term.cents === 0 ? "text-ink-faint" : "text-ink"
              }`}
            >
              {formatUsd(term.cents)}
            </dd>
          </div>
        ))}
      </dl>
      {accountPoolCents !== undefined ? (
        <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">
          Account pool{" "}
          <span className="tabular text-ink">{formatUsd(accountPoolCents)}</span>
          {" = "}
          Ready to Assign + envelope balances
          {month.assignedInFutureMonthsCents !== 0
            ? " + assigned in future months"
            : ""}
          {month.bufferedCents !== 0 ? " + held" : ""}. Credit-card debt reduces the
          pool; a payment between on-budget accounts does not.
        </p>
      ) : null}
    </section>
  );
}
