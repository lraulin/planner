"use client";

import { DateText } from "@/components/date/DateText";
import { formatUsd } from "@/lib/finances/money";
import type { projectForwardMonths } from "@/lib/finances/commitments";
import type { SpendingVsIncome } from "@/lib/finances/expectedSpending";

/**
 * Two forecast panels carried over from the retired Commitments page, collapsed by default
 * (`agent-os/specs/2026-08-23-2313-one-budget/` D8) — a reference you open when you want it,
 * not a permanent section competing with the grid for the top of the page.
 *
 * Pay-period columns and axis were paycheck-to-paycheck leftovers and are gone
 * (`agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` D5).
 */
export function ForecastDetails({
  months,
  comparison,
}: {
  months: ReturnType<typeof projectForwardMonths>;
  comparison: SpendingVsIncome;
}) {
  return (
    <>
      <details className="shrink-0 rounded border border-rule">
        <summary className="cursor-pointer px-3 py-2 text-[0.9375rem] font-medium text-ink">
          Expected vs income
        </summary>
        <div className="border-t border-rule px-3 py-2">
          <ExpectedVsIncome comparison={comparison} />
        </div>
      </details>
      <details className="shrink-0 rounded border border-rule">
        <summary className="cursor-pointer px-3 py-2 text-[0.9375rem] font-medium text-ink">
          Next 12 months
        </summary>
        <div className="border-t border-rule px-3 py-2">
          <ForwardPanel months={months} />
        </div>
      </details>
    </>
  );
}

function ExpectedVsIncome({ comparison }: { comparison: SpendingVsIncome }) {
  const leftover = comparison.remainder.monthlyCents;
  return (
    <>
      <p className="mb-2 text-[0.75rem] text-ink-muted">
        What active bills cost, against typical monthly income. Amount on a bill is left
        out — a yearly $72 and a monthly $72 are not the same number.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
              <th className="py-1 pr-2 font-normal"> </th>
              <th className="py-1 pr-2 text-right font-normal">Monthly</th>
              <th className="py-1 text-right font-normal">A year</th>
            </tr>
          </thead>
          <tbody>
            <ComparisonRow
              label="Bills"
              monthly={comparison.bills.monthlyCents}
              annual={comparison.bills.annualCents}
            />
            <ComparisonRow
              label="Expected income"
              monthly={comparison.income.monthlyCents}
              annual={comparison.income.annualCents}
            />
            <ComparisonRow
              label={leftover >= 0 ? "Left after bills" : "Overcommitted"}
              monthly={comparison.remainder.monthlyCents}
              annual={comparison.remainder.annualCents}
              strong
              tone={leftover >= 0 ? "income" : "spend"}
            />
          </tbody>
        </table>
      </div>
    </>
  );
}

function ComparisonRow({
  label,
  monthly,
  annual,
  strong,
  tone,
}: {
  label: string;
  monthly: number;
  annual: number;
  strong?: boolean;
  tone?: "income" | "spend";
}) {
  const color =
    tone === "income"
      ? "text-[var(--chart-income)]"
      : tone === "spend"
        ? "text-[var(--chart-spend)]"
        : "text-ink";
  const weight = strong ? "font-medium" : "font-normal";
  return (
    <tr className="border-b border-rule last:border-b-0">
      <td className={`py-1.5 pr-2 ${weight} text-ink`}>{label}</td>
      <td className={`tabular py-1.5 pr-2 text-right ${weight} ${color}`}>
        {formatUsd(monthly)}
      </td>
      <td className={`tabular py-1.5 text-right ${weight} ${color}`}>
        {formatUsd(annual)}
      </td>
    </tr>
  );
}

function ForwardPanel({ months }: { months: ReturnType<typeof projectForwardMonths> }) {
  return (
    <>
      <p className="mb-2 text-[0.75rem] text-ink-muted">
        Dated bills land on a day. Unscheduled bills are a monthly rate with no date.
        Months above the median are marked.
      </p>
      <ol className="flex flex-col gap-1">
        {months.map((bucket) => (
          <li
            key={bucket.key}
            className={`rounded border px-2 py-1 ${
              bucket.aboveMedian
                ? "border-[var(--chart-spend)]/40 bg-surface-raised"
                : "border-rule"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.8125rem] text-ink">
                <DateText dateKey={bucket.startKey} className="inline" />
                {bucket.aboveMedian && (
                  <span className="ml-2 text-[0.7rem] text-[var(--chart-spend)]">
                    above median
                  </span>
                )}
              </span>
              <span className="tabular text-[0.8125rem] text-ink">
                {formatUsd(bucket.totalCents)}
              </span>
            </div>
            {bucket.items.length > 0 && (
              <ul className="mt-0.5 flex flex-wrap gap-x-3 text-[0.75rem] text-ink-muted">
                {bucket.items.map((item) => (
                  <li key={`${item.name}:${item.dateKey ?? "rate"}`}>
                    {item.name} {formatUsd(item.cents)}
                    {item.dateKey && (
                      <>
                        {" · "}
                        <DateText dateKey={item.dateKey} className="inline" />
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
