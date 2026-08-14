"use client";

import { useState, useTransition } from "react";
import type { RecurringMerchant } from "@/lib/finances/analytics";
import { formatUsd } from "@/lib/finances/money";
import { CADENCE_CHOICES, cadenceLabel } from "@/lib/finances/recurringBills";
import {
  deleteRecurringBillAction,
  setRecurringBillAction,
} from "@/app/finances/actions";
import { PanelEmpty } from "./Panel";

/** Roughly how often, in words, for a cadence read off the gaps rather than declared. */
function detectedCadenceLabel(days: number): string {
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
 *
 * **Set aside** is the same money shown as a plan rather than a measurement, and it is the
 * figure that makes a yearly bill legible: $2,825 once is a shock, $235 a month is a budget
 * line. It is also what the levelled baseline burn is built from, so the two panels reconcile
 * by inspection instead of by trust.
 *
 * A declared row can be corrected and removed here. This is the only place a wrong cadence
 * can be fixed — a declaration that could only ever be made and never revised would be worse
 * than none, because the number it produces would be wrong and permanent.
 */
export function RecurringTable({
  merchants,
  declarable,
}: {
  merchants: RecurringMerchant[];
  /** Every merchant in the history, so a bill too small for the review list is still
   * declarable. Taylor Gas is the case: propane at $335 a delivery never clears the
   * one-off floor, so the review row that the rest of this flow hangs off never appears. */
  declarable: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState("");
  const [addCadence, setAddCadence] = useState(6);

  const annualTotal = merchants.reduce((total, entry) => total + entry.annualCents, 0);
  const setAsideTotal = merchants.reduce(
    (total, entry) => total + Math.round(entry.annualCents / 12),
    0,
  );

  function change(merchant: string, cadenceMonths: number) {
    startTransition(async () => {
      await setRecurringBillAction({ merchant, cadenceMonths });
    });
  }

  function remove(merchant: string) {
    startTransition(async () => {
      await deleteRecurringBillAction(merchant);
    });
  }

  function add() {
    if (adding === "") return;
    startTransition(async () => {
      // No amount: with no charge to read it off, the median of what is on file is the
      // honest figure, and it improves on its own as the bill arrives again.
      await setRecurringBillAction({ merchant: adding, cadenceMonths: addCadence });
      setAdding("");
    });
  }

  const declareControls = (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-2">
      <label className="text-[0.75rem] text-ink-muted" htmlFor="declare-merchant">
        Declare a bill
      </label>
      <select
        id="declare-merchant"
        value={adding}
        disabled={pending}
        onChange={(event) => setAdding(event.target.value)}
        // 16px, or iOS zooms the whole page on focus.
        className="min-h-tap min-w-0 max-w-[14rem] flex-1 rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.75rem]"
      >
        <option value="">Choose a merchant…</option>
        {declarable.map((merchant) => (
          <option key={merchant} value={merchant}>
            {merchant}
          </option>
        ))}
      </select>
      <select
        value={addCadence}
        disabled={pending}
        aria-label="Cadence for the bill being declared"
        onChange={(event) => setAddCadence(Number(event.target.value))}
        className="min-h-tap rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.75rem]"
      >
        {CADENCE_CHOICES.map((months) => (
          <option key={months} value={months}>
            {cadenceLabel(months)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={add}
        disabled={pending || adding === ""}
        className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
      >
        Declare
      </button>
    </div>
  );

  if (merchants.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <PanelEmpty>
          Nothing in this window charges regularly enough to call a subscription, and no
          bill has been declared.
        </PanelEmpty>
        {declareControls}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-[0.8125rem]">
          <thead>
            <tr className="border-b border-rule text-left text-[0.75rem] text-ink-muted">
              <th className="py-1 pr-2 font-normal">Merchant</th>
              <th className="py-1 pr-2 font-normal">Every</th>
              <th className="py-1 pr-2 text-right font-normal">Charge</th>
              <th className="py-1 pr-2 text-right font-normal">A year</th>
              <th className="py-1 text-right font-normal">Set aside</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((entry) => (
              <tr key={entry.merchant} className="border-b border-rule last:border-0">
                <td className="max-w-[12rem] truncate py-1 pr-2 text-ink">
                  {entry.declared && (
                    <span
                      aria-label="Declared by you"
                      title="Cadence declared by you"
                      className="mr-1 text-ink-muted"
                    >
                      ▸
                    </span>
                  )}
                  {entry.merchant}
                </td>
                <td className="py-1 pr-2 whitespace-nowrap text-ink-muted">
                  {entry.cadenceMonths === null ? (
                    detectedCadenceLabel(entry.cadenceDays)
                  ) : (
                    <select
                      value={entry.cadenceMonths}
                      disabled={pending}
                      aria-label={`Cadence for ${entry.merchant}`}
                      onChange={(event) =>
                        change(entry.merchant, Number(event.target.value))
                      }
                      className="min-h-tap rounded border border-rule bg-surface px-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
                    >
                      {CADENCE_CHOICES.map((months) => (
                        <option key={months} value={months}>
                          {cadenceLabel(months)}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="tabular py-1 pr-2 text-right text-ink">
                  {formatUsd(entry.typicalCents)}
                </td>
                <td className="tabular py-1 pr-2 text-right text-[var(--chart-spend)]">
                  {formatUsd(entry.annualCents)}
                </td>
                <td className="tabular py-1 text-right whitespace-nowrap text-ink-muted">
                  {formatUsd(Math.round(entry.annualCents / 12))}
                  {entry.declared && (
                    <button
                      type="button"
                      onClick={() => remove(entry.merchant)}
                      disabled={pending}
                      title={`Stop treating ${entry.merchant} as a recurring bill`}
                      className="ml-2 min-h-tap text-ink-muted hover:text-ink disabled:opacity-50 md:min-h-0"
                    >
                      ×
                    </button>
                  )}
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
              <td className="tabular py-1 pr-2 text-right font-medium text-ink">
                {formatUsd(annualTotal)}
              </td>
              <td className="tabular py-1 text-right font-medium text-ink">
                {formatUsd(setAsideTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {declareControls}
    </div>
  );
}
