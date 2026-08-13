"use client";

import type { RecurringMerchant } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { PanelEmpty } from "./Panel";

/** Roughly how often, in words. "Every 31 days" is a fact; "monthly" is the answer. */
function cadenceLabel(days: number): string {
  if (days <= 9) return "Weekly";
  if (days <= 18) return "Fortnightly";
  if (days <= 45) return "Monthly";
  if (days <= 75) return "Every 2 months";
  return "Quarterly";
}

/**
 * The bills that renew whether or not anyone looks at them, sorted by what a year of each
 * costs.
 *
 * Annualized on purpose: $34.71 a month is beneath noticing and $416 a year is a decision.
 * Sorting by the annual figure rather than the charge is what puts a small monthly
 * subscription above a large quarterly one when it deserves to be.
 */
export function RecurringTable({ merchants }: { merchants: RecurringMerchant[] }) {
  if (merchants.length === 0) {
    return (
      <PanelEmpty>
        Nothing in this window charges regularly enough to call a subscription.
      </PanelEmpty>
    );
  }

  const annualTotal = merchants.reduce((total, entry) => total + entry.annualCents, 0);

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-[0.8125rem]">
        <thead>
          <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
            <th className="py-1 pr-2 font-normal">Merchant</th>
            <th className="py-1 pr-2 font-normal">Every</th>
            <th className="py-1 pr-2 text-right font-normal">Charge</th>
            <th className="py-1 text-right font-normal">A year</th>
          </tr>
        </thead>
        <tbody>
          {merchants.map((entry) => (
            <tr key={entry.merchant} className="border-b border-rule last:border-0">
              <td className="max-w-[12rem] truncate py-1 pr-2 text-ink">
                {entry.merchant}
              </td>
              <td className="py-1 pr-2 whitespace-nowrap text-ink-muted">
                {cadenceLabel(entry.cadenceDays)}
              </td>
              <td className="tabular py-1 pr-2 text-right text-ink">
                {formatUsd(entry.typicalCents)}
              </td>
              <td className="tabular py-1 text-right text-[var(--chart-spend)]">
                {formatUsd(entry.annualCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-rule-strong">
            <td className="py-1 pr-2 text-ink-muted" colSpan={3}>
              {merchants.length} recurring{" "}
              {merchants.length === 1 ? "charge" : "charges"}
            </td>
            <td className="tabular py-1 text-right font-medium text-ink">
              {formatUsd(annualTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
