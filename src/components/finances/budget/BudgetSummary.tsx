"use client";

import { formatUsd } from "@/lib/finances/money";
import { readyToAssignNote, type BudgetMonth } from "@/lib/finances/budget/envelope";
import { stillNeededGroups, type StillNeeded } from "@/lib/finances/budget/assign/plan";

/**
 * Ready to Assign, the backlog that explains it, and the arithmetic behind it.
 *
 * **The terms come from the fold, not from this component.** `month.terms` is built beside
 * the arithmetic precisely so a page cannot render a breakdown that fails to add up to its
 * own headline — the same reason `availableToSpend` returns its terms.
 *
 * The terms sit behind a disclosure and are typeset as an equation — labels left, amounts
 * right-aligned in one `.tabular` column, a rule, the total restated. Seven equal-weight
 * chips in a wrapped row read as a list of facts; the card's job is to show a calculation
 * (`agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/` D2).
 *
 * Zero is the target and gets its own tone: in zero-based budgeting a green surplus is not
 * success, it is money without a job.
 *
 * Beside it, **Still needed** answers the opposite question — total needed minus total
 * assigned for the month on screen, the sum of the amber per-row pills. It arrives computed
 * (`stillNeeded()`), for the same reason the terms do
 * (`agent-os/specs/2026-09-06-1215-still-needed-this-month/`).
 */
export function BudgetSummary({
  month,
  accountPoolCents,
  action = "assign",
  onAction,
  uncategorizedCount = 0,
  uncategorizedCents = 0,
  uncategorizedSinceLabel,
  stillNeeded,
}: {
  month: BudgetMonth;
  /** When viewing the current month, the live on-budget working pool. */
  accountPoolCents?: number;
  /** Same slot: Assign, or Fix This when Ready to Assign is negative on a current/future month. */
  action?: "assign" | "fix-this";
  onAction?: () => void;
  /** The whole-budget backlog, not this month's — see the label below. */
  uncategorizedCount?: number;
  uncategorizedCents?: number;
  /** Month the budget starts, already formatted; omitted when the budget has no start. */
  uncategorizedSinceLabel?: string;
  /** The viewed month's remaining ask, computed beside the grid it must agree with. */
  stillNeeded: StillNeeded;
}) {
  const ready = month.readyToAssignCents;
  const tone =
    ready < 0
      ? "text-[var(--chart-spend)]"
      : ready === 0
        ? "text-[var(--chart-income)]"
        : "text-ink";
  const fixThis = action === "fix-this";
  const needed = stillNeeded.totalCents;
  const neededTone =
    needed > 0 ? "text-[var(--goal-unmet)]" : "text-[var(--chart-income)]";
  // Short of an ask is not an overspend, so amber, never `--chart-spend` (D6).
  const groups = stillNeededGroups(stillNeeded);
  // Both readings of the one question: what is unassigned, and what has still to arrive.
  const toArrive = Math.max(0, needed - Math.max(0, ready));

  return (
    <section className="rounded border border-rule bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div>
          <span className={`tabular text-[2.25rem] leading-none font-medium ${tone}`}>
            {formatUsd(ready)}
          </span>
          <span className="mt-0.5 block text-[0.75rem] text-ink-muted">
            Ready to Assign
          </span>
          {/* Inside the figure's own block: below the whole row, the phone's wrap put it under
              Still needed, where "Still needed · unassigned from on-budget accounts" reads as
              one sentence about the wrong number. */}
          <span className="mt-1 block text-[0.8125rem] text-ink-muted">
            {readyToAssignNote(ready)}
          </span>
        </div>
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
        {/* No vertical rule between the pair: it would not survive the wrap on phone, and
            the labels already carry the separation. */}
        <div>
          <span
            className={`tabular text-[1.5rem] leading-none font-medium ${neededTone}`}
          >
            {formatUsd(needed)}
          </span>
          <span className="mt-0.5 block text-[0.75rem] text-ink-muted">
            Still needed
          </span>
        </div>
        {accountPoolCents !== undefined ? (
          <span className="ml-auto text-[0.75rem] text-ink-muted">
            Account pool{" "}
            <span className="tabular text-ink">{formatUsd(accountPoolCents)}</span>
          </span>
        ) : null}
      </div>

      {/* Gated on the count, never on the amount: a backlog whose signed sum cancels to
          $0.00 is still a pile of transactions nobody has filed. */}
      {uncategorizedCount > 0 ? (
        <p
          role="status"
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-[var(--goal-unmet)] bg-[var(--goal-unmet)]/10 px-3 py-2 text-[0.8125rem] text-ink"
        >
          <span aria-hidden="true" className="text-[var(--goal-unmet)]">
            ⚠
          </span>
          <span>
            {uncategorizedCount}{" "}
            {uncategorizedCount === 1 ? "transaction has" : "transactions have"} no
            category
            {/* The backlog spans the whole budget, not the month on screen. Unqualified, it
                reads as September's when you have paged forward — and this figure is the
                one that explains the gap between the budget and the bank, so it has to say
                what it is counting. */}
            {uncategorizedSinceLabel ? ` since ${uncategorizedSinceLabel}` : ""}
          </span>
          <span className="tabular text-ink-muted">
            {formatUsd(uncategorizedCents)}
          </span>
          <a
            href="/finances/register?view=uncategorized"
            className="ml-auto inline-flex min-h-tap items-center rounded border border-[var(--goal-unmet)] px-2 text-ink hover:bg-[color-mix(in_srgb,var(--goal-unmet)_16%,transparent)] md:min-h-0 md:py-1"
          >
            Categorize
          </a>
        </p>
      ) : null}

      <details className="group mt-3 border-t border-rule pt-2">
        <summary className="flex min-h-tap cursor-pointer list-none items-center gap-1.5 text-[0.8125rem] text-ink-muted marker:content-none hover:text-ink md:min-h-0">
          <span aria-hidden="true" className="inline-block group-open:rotate-90">
            ▸
          </span>
          How this adds up
        </summary>
        <dl className="mt-2 max-w-sm text-[0.8125rem]">
          {month.terms.map((term) => (
            <div key={term.label} className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-muted">{term.label}</dt>
              <dd
                className={`tabular ${term.cents === 0 ? "text-ink-faint" : "text-ink"}`}
              >
                {formatUsd(term.cents)}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-rule pt-1">
            <dt className="text-ink">Ready to Assign</dt>
            <dd className={`tabular font-medium ${tone}`}>{formatUsd(ready)}</dd>
          </div>
        </dl>
        {accountPoolCents !== undefined ? (
          <p className="mt-2 max-w-prose text-[0.75rem] leading-snug text-ink-muted">
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
      </details>

      {needed > 0 ? (
        <details className="group mt-2 border-t border-rule pt-2">
          <summary className="flex min-h-tap cursor-pointer list-none items-center gap-1.5 text-[0.8125rem] text-ink-muted marker:content-none hover:text-ink md:min-h-0">
            <span aria-hidden="true" className="inline-block group-open:rotate-90">
              ▸
            </span>
            What&rsquo;s still asking
          </summary>
          <dl className="mt-2 max-w-sm text-[0.8125rem]">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink">{group.label}</dt>
                  <dd className="tabular text-ink">{formatUsd(group.totalCents)}</dd>
                </div>
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-baseline justify-between gap-4 pl-3"
                  >
                    <dt className="text-ink-muted">{row.name}</dt>
                    <dd className="tabular text-ink-muted">
                      {formatUsd(row.gapCents)}
                    </dd>
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-rule pt-1">
              <dt className="text-ink">Still needed</dt>
              <dd className={`tabular font-medium ${neededTone}`}>
                {formatUsd(needed)}
              </dd>
            </div>
            {ready > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-ink-muted">Ready to Assign</dt>
                  <dd className="tabular text-ink-muted">&minus;{formatUsd(ready)}</dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-rule pt-1">
                  <dt className="text-ink">Still to arrive</dt>
                  <dd
                    className={`tabular font-medium ${
                      toArrive > 0
                        ? "text-[var(--goal-unmet)]"
                        : "text-[var(--chart-income)]"
                    }`}
                  >
                    {formatUsd(toArrive)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </details>
      ) : (
        <p className="mt-2 border-t border-rule pt-2 text-[0.8125rem] text-ink-muted">
          Every envelope has what it asked for this month.
        </p>
      )}
    </section>
  );
}
