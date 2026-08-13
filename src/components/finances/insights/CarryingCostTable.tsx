"use client";

import type { CarryingCost } from "@/lib/finances/dashboardQueries";
import { formatUsd } from "@/lib/finances/money";
import { PanelEmpty } from "./Panel";

/**
 * What the accounts themselves cost — interest and fees, straight off the statements.
 *
 * Read from the statement snapshots rather than the register because a statement states
 * these outright, while the register only has them where the bank happened to post a line
 * item. A carrying cost is exactly the number that must not be inferred.
 */
export function CarryingCostTable({ cost }: { cost: CarryingCost }) {
  if (cost.byAccount.length === 0) {
    return (
      <PanelEmpty>
        No statements imported for this window. Import them from the Register.
      </PanelEmpty>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[24rem] text-[0.8125rem]">
        <thead>
          <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
            <th className="py-1 pr-2 font-normal">Account</th>
            <th className="py-1 pr-2 text-right font-normal">Interest</th>
            <th className="py-1 pr-2 text-right font-normal">Fees</th>
            <th className="py-1 text-right font-normal">APR</th>
          </tr>
        </thead>
        <tbody>
          {cost.byAccount.map((account) => (
            <tr key={account.accountId} className="border-b border-rule last:border-0">
              <td className="max-w-[12rem] truncate py-1 pr-2 text-ink">
                {account.accountName}
                <span className="ml-1 text-[0.75rem] text-ink-muted">
                  ({account.statementCount})
                </span>
              </td>
              <td className="tabular py-1 pr-2 text-right text-ink">
                {formatUsd(account.interestCents)}
              </td>
              <td className="tabular py-1 pr-2 text-right text-ink">
                {formatUsd(account.feesCents)}
              </td>
              <td className="tabular py-1 text-right text-ink-muted">
                {account.latestAprPercent === null
                  ? "—"
                  : `${account.latestAprPercent.toFixed(2)}%`}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-rule-strong">
            <td className="py-1 pr-2 text-ink-muted">Total</td>
            <td className="tabular py-1 pr-2 text-right font-medium text-[var(--chart-spend)]">
              {formatUsd(cost.interestCents)}
            </td>
            <td className="tabular py-1 pr-2 text-right font-medium text-[var(--chart-spend)]">
              {formatUsd(cost.feesCents)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
