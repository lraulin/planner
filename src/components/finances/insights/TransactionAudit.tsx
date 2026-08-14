"use client";

import type { AnalyticsRow } from "@/lib/finances/analytics";
import {
  effectiveCategory,
  effectiveFlow,
  effectiveMerchant,
} from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { PanelEmpty } from "./Panel";

/**
 * The rows behind the current figure. Compact on purpose — the register is the full grid.
 */
export function TransactionAudit({
  rows,
  title,
  onClear,
}: {
  rows: AnalyticsRow[];
  title: string;
  onClear?: () => void;
}) {
  const formatDate = useDateFormatter();
  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.8125rem] text-ink">
          {title}
          <span className="ml-2 text-ink-muted">
            {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"} ·{" "}
            {formatUsd(totalCents)}
          </span>
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-tap text-[0.75rem] text-ink-muted hover:text-ink md:min-h-0"
          >
            Clear drill
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <PanelEmpty>Nothing in this slice.</PanelEmpty>
      ) : (
        <div className="max-h-80 min-w-0 overflow-auto">
          <table className="w-full min-w-[28rem] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
                <th className="py-1 pr-2 font-normal">Date</th>
                <th className="py-1 pr-2 font-normal">Account</th>
                <th className="py-1 pr-2 font-normal">Merchant</th>
                <th className="py-1 pr-2 font-normal">Category</th>
                <th className="py-1 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-rule last:border-0">
                  <td className="whitespace-nowrap py-1 pr-2 text-ink-muted">
                    {formatDate(row.transactionDate)}
                  </td>
                  <td className="max-w-[8rem] truncate py-1 pr-2 text-ink">
                    {row.accountName}
                  </td>
                  <td className="max-w-[12rem] truncate py-1 pr-2 text-ink">
                    {effectiveMerchant(row) || row.description}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-ink-muted">
                    {effectiveFlow(row) === "internal_transfer"
                      ? "Transfer"
                      : effectiveCategory(row)}
                  </td>
                  <td className="tabular whitespace-nowrap py-1 text-right text-ink">
                    {formatUsd(row.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
