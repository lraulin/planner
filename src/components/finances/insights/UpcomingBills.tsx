"use client";

import type { UpcomingBill } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { cadenceLabel } from "@/lib/finances/recurringBills";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { PanelEmpty } from "./Panel";

/** "In 20 days" is a plan; "2026-09-03" is a date you still have to subtract from today. */
function whenLabel(daysAway: number): string {
  if (daysAway < 0) return `${Math.abs(daysAway)} days ago`;
  if (daysAway === 0) return "Today";
  if (daysAway === 1) return "Tomorrow";
  return `In ${daysAway} days`;
}

/**
 * When each declared bill is next expected, and for how much.
 *
 * **A projection, not a promise.** Nothing here reconciles against the charge that eventually
 * arrives, so a bill still listed after its date means the import is behind or the date
 * moved — never that money went missing. Saying that out loud in the subtitle is the whole
 * difference between a useful forecast and one someone plans a balance around.
 *
 * The panel exists because a cadence you can only see in aggregate is not much use: knowing
 * propane costs $850 a year does not stop $425 landing in a week you had spent.
 */
export function UpcomingBills({ bills }: { bills: UpcomingBill[] }) {
  const formatDate = useDateFormatter();

  if (bills.length === 0) {
    return (
      <PanelEmpty>
        No bills declared yet. Declare a cadence on the one-off review list and the next
        one shows up here.
      </PanelEmpty>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-rule">
      {bills.map((bill) => (
        <li
          key={bill.merchant}
          className="flex items-baseline gap-2 py-1.5 first:pt-0 last:pb-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] text-ink">
              {bill.merchant}
            </span>
            <span className="block truncate text-[0.75rem] text-ink-muted">
              {formatDate(bill.dueOn)} · {cadenceLabel(bill.cadenceMonths)} · last on{" "}
              {formatDate(bill.lastChargeOn)}
            </span>
          </span>
          <span className="flex-none text-right">
            <span className="tabular block text-[0.8125rem] text-[var(--chart-spend)]">
              {formatUsd(bill.expectedCents)}
            </span>
            <span
              className={`block text-[0.75rem] ${
                bill.daysAway < 0 ? "text-priority-a" : "text-ink-muted"
              }`}
            >
              {whenLabel(bill.daysAway)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
