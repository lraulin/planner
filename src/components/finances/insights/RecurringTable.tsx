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

/**
 * Dollars only. A range is an admission that the figure is soft, so printing it to the cent
 * argues with itself — and the two extra columns of width cost the set-aside figure its place
 * on screen.
 */
function wholeUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/**
 * Whether this bill's amount moves enough that one figure would misrepresent it.
 *
 * Schedule and amount are independent, and a utility is typically regular in one and wild in
 * the other: SMECO arrives every month and costs anywhere from $77.95 to $311.13. Printing
 * its median alone states an estimate as a fact, and the annual figure built on it inherits
 * the same false confidence.
 *
 * The threshold is `RECURRING_VARIANCE_RATIO` — the same 25% that decides whether a merchant
 * is regular enough to *be* a bill — so a charge either sits inside the band the detector
 * calls "the same bill every time" or the table says out loud that it does not.
 */
function swings(entry: RecurringMerchant): boolean {
  if (entry.chargeCount < 2 || entry.typicalCents <= 0) return false;
  return entry.highCents - entry.lowCents > entry.typicalCents * 0.25;
}

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
  // 0 is the sentinel for "no fixed schedule". Stored as a yearly period with the forecast
  // switched off, because "about $500 a year" is what an unschedulable bill actually knows.
  const [addCadence, setAddCadence] = useState(6);
  const [addYearly, setAddYearly] = useState("");

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

  const unscheduled = addCadence === 0;
  const yearlyCents = Math.round(Number(addYearly.replace(/[$,\s]/g, "")) * 100);

  function add() {
    if (adding === "") return;
    if (unscheduled && !(yearlyCents > 0)) return;
    startTransition(async () => {
      await setRecurringBillAction(
        unscheduled
          ? {
              merchant: adding,
              // A yearly period carrying the stated annual cost, with the forecast off. The
              // dates are unknowable; the money is not.
              cadenceMonths: 12,
              expectedCents: yearlyCents,
              scheduled: false,
            }
          : // No amount on a scheduled bill: the median of what is on file is the honest
            // figure, and it improves on its own as the bill arrives again.
            { merchant: adding, cadenceMonths: addCadence, scheduled: true },
      );
      setAdding("");
      setAddYearly("");
    });
  }

  function setYearly(merchant: string, dollars: string) {
    const cents = Math.round(Number(dollars.replace(/[$,\s]/g, "")) * 100);
    if (!(cents > 0)) return;
    startTransition(async () => {
      await setRecurringBillAction({
        merchant,
        cadenceMonths: 12,
        expectedCents: cents,
        scheduled: false,
      });
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
        <option value={0}>No fixed schedule</option>
      </select>
      {unscheduled && (
        <input
          type="text"
          inputMode="decimal"
          value={addYearly}
          onChange={(event) => setAddYearly(event.target.value)}
          placeholder="Cost a year"
          aria-label="Yearly cost"
          // 16px, or iOS zooms the whole page on focus.
          className="min-h-tap w-28 rounded border border-rule bg-surface px-2 py-1 text-base text-ink md:min-h-0 md:text-[0.75rem]"
        />
      )}
      <button
        type="button"
        onClick={add}
        disabled={pending || adding === "" || (unscheduled && !(yearlyCents > 0))}
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
        {/* Wide enough for a charge that carries its range underneath without the set-aside
            column being clipped; the wrapper scrolls rather than the page. */}
        <table className="w-full min-w-[34rem] text-[0.8125rem]">
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
                  ) : !entry.scheduled ? (
                    <span title="Recurs, but on no predictable schedule">
                      Irregular
                    </span>
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
                <td className="tabular py-1 pr-2 text-right whitespace-nowrap text-ink">
                  {formatUsd(entry.typicalCents)}
                  {swings(entry) && (
                    <span className="block text-[0.75rem] text-ink-muted">
                      {wholeUsd(entry.lowCents)}–{wholeUsd(entry.highCents)}
                    </span>
                  )}
                </td>
                <td className="tabular py-1 pr-2 text-right text-[var(--chart-spend)]">
                  {entry.declared && !entry.scheduled ? (
                    // The one figure an unscheduled bill actually knows, so it is the one
                    // that is editable. Everything else about it is derived from this.
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={(entry.annualCents / 100).toFixed(2)}
                      disabled={pending}
                      aria-label={`Yearly cost for ${entry.merchant}`}
                      onBlur={(event) => setYearly(entry.merchant, event.target.value)}
                      className="tabular w-20 rounded border border-rule bg-surface px-1 text-right text-base text-ink md:text-[0.8125rem]"
                    />
                  ) : (
                    formatUsd(entry.annualCents)
                  )}
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
