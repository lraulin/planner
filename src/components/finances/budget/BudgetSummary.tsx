"use client";

import { formatUsd } from "@/lib/finances/money";
import type { BudgetMonth } from "@/lib/finances/budget/envelope";

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
  onAssignAll,
}: {
  month: BudgetMonth;
  onAssignAll?: () => void;
}) {
  const ready = month.readyToAssignCents;
  const tone =
    ready < 0
      ? "text-[var(--chart-spend)]"
      : ready === 0
        ? "text-[var(--chart-income)]"
        : "text-ink";

  return (
    <section className="rounded border border-rule bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`tabular text-[2.25rem] leading-none font-medium ${tone}`}>
          {formatUsd(ready)}
        </span>
        <span className="text-[0.8125rem] text-ink-muted">
          {ready > 0
            ? "left to assign"
            : ready < 0
              ? "assigned more than you have"
              : "every dollar has a job"}
        </span>
        {onAssignAll && ready > 0 ? (
          <button
            type="button"
            onClick={onAssignAll}
            className="ml-auto rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised"
          >
            Assign remaining…
          </button>
        ) : null}
      </div>

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
    </section>
  );
}
