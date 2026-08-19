"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { cadenceLabel, cadenceMonthsFromGapDays } from "@/lib/finances/recurringBills";
import {
  setRecurringBillAction,
  setRecurringSpendAction,
} from "@/app/finances/actions";
import { PanelEmpty } from "../insights/Panel";

function detectedCadenceLabel(days: number): string {
  if (days <= 9) return "Weekly";
  if (days <= 18) return "Fortnightly";
  if (days <= 45) return "Monthly";
  if (days <= 75) return "Every 2 months";
  return "Quarterly";
}

/**
 * Detected charges that are not yet a commitment. Propose, never apply — each row is
 * an offer to track as a bill, track as recurring spend, or dismiss as not a commitment.
 */
export function ReviewList({
  items,
  onError,
}: {
  items: RecurringMerchant[];
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <PanelEmpty>
        Nothing new looks like a subscription. Detected charges you have already tracked
        or dismissed stay off this list.
      </PanelEmpty>
    );
  }

  function cadenceOf(entry: RecurringMerchant): number {
    return entry.cadenceMonths ?? cadenceMonthsFromGapDays(entry.cadenceDays) ?? 1;
  }

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    onError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) onError(result.error ?? "Could not save.");
      else router.refresh();
    });
  }

  return (
    <div className="max-h-64 min-w-0 overflow-auto">
      <table className="w-full min-w-[32rem] text-[0.8125rem]">
        <thead>
          <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
            <th className="py-1 pr-2 font-normal">Merchant</th>
            <th className="py-1 pr-2 font-normal">Looks like</th>
            <th className="py-1 pr-2 text-right font-normal">Typical</th>
            <th className="py-1 pr-2 text-right font-normal">A year</th>
            <th className="py-1 font-normal"> </th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.merchant} className="border-b border-rule last:border-0">
              <td className="max-w-[12rem] truncate py-1.5 pr-2 text-ink">
                {entry.merchant}
                <span className="mt-0.5 block text-[0.7rem] text-ink-muted">
                  {entry.chargeCount} charges
                </span>
              </td>
              <td className="py-1.5 pr-2 whitespace-nowrap text-ink-muted">
                {entry.cadenceMonths !== null
                  ? cadenceLabel(entry.cadenceMonths)
                  : detectedCadenceLabel(entry.cadenceDays)}
              </td>
              <td className="tabular py-1.5 pr-2 text-right text-ink">
                {formatUsd(entry.typicalCents)}
              </td>
              <td className="tabular py-1.5 pr-2 text-right text-[var(--chart-spend)]">
                {formatUsd(entry.annualCents)}
              </td>
              <td className="py-1.5">
                <div className="flex flex-wrap justify-end gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setRecurringBillAction({
                          name: entry.merchant,
                          matchers: [entry.merchant],
                          cadenceMonths: cadenceOf(entry),
                          expectedCents: entry.typicalCents,
                          scheduled: true,
                        }),
                      )
                    }
                    className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
                  >
                    Track as bill
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setRecurringSpendAction({
                          name: entry.merchant,
                          matchers: [entry.merchant],
                        }),
                      )
                    }
                    className="min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
                  >
                    Track as spend
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    title="Not a commitment — hide it from this list"
                    onClick={() =>
                      run(() =>
                        setRecurringBillAction({
                          name: entry.merchant,
                          matchers: [entry.merchant],
                          cadenceMonths: cadenceOf(entry),
                          status: "ignored",
                        }),
                      )
                    }
                    className="min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink-muted disabled:opacity-50 md:min-h-0 md:py-1"
                  >
                    Dismiss
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
