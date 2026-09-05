"use client";
import type { ReactNode } from "react";
import { AmountCell } from "@/components/grid/cells";
import type { BudgetCategoryEdit } from "@/lib/finances/budget/mutations";
import type { BudgetRow } from "@/lib/finances/budget/rows";
import type { MonthKey } from "@/lib/finances/budget/envelope";
import type { monthlyFundingPlan } from "@/lib/finances/budget/incomePlan";
import { formatUsd } from "@/lib/finances/money";
import { ActivityAmountLink } from "./budgetColumns";

export function IncomeSection({
  rows,
  month,
  receivedCents,
  pending,
  onEdit,
  onNew,
  composer,
}: {
  rows: readonly BudgetRow[];
  month: MonthKey;
  receivedCents: number;
  pending: boolean;
  onEdit: (id: string, edit: BudgetCategoryEdit) => void;
  onNew: () => void;
  composer?: ReactNode;
}) {
  return (
    <section className="rounded border border-rule bg-surface px-3 py-2">
      <header className="flex items-center justify-between gap-3 text-sm">
        <h2>Income</h2>
        <span className="tabular text-xs text-ink-muted">
          Received {formatUsd(receivedCents)}
        </span>
        <button
          type="button"
          onClick={onNew}
          className="min-h-tap rounded border border-rule px-2 md:min-h-0"
        >
          + Envelope
        </button>
      </header>
      {(["regular", "other"] as const).map((role) => (
        <div key={role} className="mt-2 border-t border-rule pt-2">
          <h3 className="text-xs font-medium text-ink-muted">
            {role === "regular" ? "Regular" : "Other"} · Received{" "}
            {formatUsd(
              rows
                .filter((row) => row.incomeRole === role)
                .reduce((sum, row) => sum + row.activityCents, 0),
            )}
          </h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {rows
              .filter((row) => row.incomeRole === role)
              .map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span>{row.name}</span>
                  <ActivityAmountLink
                    categoryId={row.id}
                    month={month}
                    cents={row.activityCents}
                  />
                  <select
                    aria-label={`Income role for ${row.name}`}
                    value={role}
                    disabled={pending}
                    onChange={(event) =>
                      onEdit(row.id, {
                        incomeRole: event.target.value as "regular" | "other",
                      })
                    }
                    className="min-h-tap rounded border border-rule bg-surface text-base md:min-h-0 md:text-xs"
                  >
                    <option value="regular">Regular</option>
                    <option value="other">Other</option>
                  </select>
                  {role === "regular" ? (
                    <label className="flex items-center gap-1 text-ink-muted">
                      Expected / mo{" "}
                      <AmountCell
                        cents={row.expectedMonthlyIncomeCents}
                        label={`Expected monthly income for ${row.name}`}
                        disabled={pending}
                        onCommit={(expectedMonthlyIncomeCents) =>
                          onEdit(row.id, { expectedMonthlyIncomeCents })
                        }
                        className="w-24 rounded border border-rule bg-surface text-base md:text-xs"
                      />
                      {row.expectedMonthlyIncomeCents === null ? (
                        <span>Estimate missing</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onEdit(row.id, { expectedMonthlyIncomeCents: null })
                          }
                          title="Clear expected amount"
                        >
                          Clear
                        </button>
                      )}
                    </label>
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      ))}
      <p className="mt-2 text-[0.7rem] text-ink-faint">
        All receipts contribute to Ready to Assign. Expectations are planning amounts
        only.
      </p>
      {composer}
    </section>
  );
}

export function FundingPlanSummary({
  plan,
}: {
  plan: ReturnType<typeof monthlyFundingPlan>;
}) {
  return (
    <section className="rounded border border-rule px-3 py-2 text-xs">
      <h2 className="mb-1 font-medium">Regular spending + Bills · this month’s plan</h2>
      <dl className="tabular flex flex-wrap gap-x-6 gap-y-1">
        <div>
          <dt className="text-ink-muted">Expected regular income</dt>
          <dd>
            {plan.income.expectedCents === null
              ? "Estimates incomplete"
              : formatUsd(plan.income.expectedCents)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Planned funding this month</dt>
          <dd>
            {formatUsd(plan.plannedCents)}
            {plan.missing.length > 0 ? " · incomplete" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Plan margin</dt>
          <dd
            className={
              plan.marginCents !== null && plan.marginCents < 0 ? "text-priority-a" : ""
            }
          >
            {plan.marginCents === null
              ? "Complete the plan to compare"
              : formatUsd(plan.marginCents)}
          </dd>
        </div>
      </dl>
      {plan.income.noRegularIncome ? (
        <p className="mt-1 text-ink-muted">Choose Regular income envelopes below.</p>
      ) : null}
      {plan.income.missing.length > 0 ? (
        <p className="mt-1 text-ink-muted">
          Missing income estimates:{" "}
          {plan.income.missing.map((row) => row.name).join(", ")}
        </p>
      ) : null}
      {plan.missing.length > 0 ? (
        <details className="mt-1 text-ink-muted">
          <summary>Incomplete funding plan · {plan.missing.length} details</summary>
          <ul>
            {plan.missing.map((row, index) => (
              <li key={`${row.id}-${index}`}>
                {row.name}: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
