"use client";
import { CadenceSelect } from "@/components/finances/CadenceSelect";
import { AmountCell, DateKeyCell } from "@/components/grid/cells";
import type { EnvelopeStatus } from "@/db/schema";
import {
  billCadence,
  billInspectorView,
  cancelledChargeWarning,
} from "@/lib/finances/budget/inspector";
import type { BudgetBillRow } from "@/lib/finances/budget/rows";
import { formatUsd } from "@/lib/finances/money";
import { UrlCell } from "./UrlCell";
import { UrlLink } from "@/components/url/UrlLink";
import { suggestLeadDays } from "@/lib/finances/billSchedule";
import { declaresBillSchedule } from "@/lib/finances/budget/inspector";
import type { BillPatch } from "./budgetColumns";
const fieldClass =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]";
const labelClass = "flex flex-col gap-1 text-[0.75rem] text-ink-muted";
export function BillFields({
  bill,
  pending,
  chargeKeys,
  onPatchBill,
  onEditPayees,
}: {
  bill: BudgetBillRow;
  pending: boolean;
  /** Posted charge dates for this bill, for the payment-lead suggestion. */
  chargeKeys?: readonly string[];
  onPatchBill: (row: BudgetBillRow, patch: BillPatch) => void;
  onEditPayees: (row: BudgetBillRow) => void;
}) {
  const billView = billInspectorView(bill.bill);
  const chargeWarning = cancelledChargeWarning(bill.bill.status, bill.activityCents);
  // Suggested, never applied — the same rule the cadence detection follows. Offered only
  // once a due day exists, because a lead with nothing to lead means nothing.
  const declared = declaresBillSchedule(bill.bill);
  const suggestedLead =
    bill.bill.dueDay === null
      ? null
      : suggestLeadDays(bill.bill.dueDay, chargeKeys ?? [], billCadence(bill.bill));
  return (
    <section className="rounded border border-rule bg-surface px-3 py-2">
      <h3 className="mb-2 text-[0.75rem] font-medium text-ink-muted">Bill</h3>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={bill.bill.scheduled}
            disabled={pending}
            onChange={(event) =>
              onPatchBill(bill, {
                scheduled: event.target.checked,
                expectedCents: bill.bill.expectedCents,
              })
            }
          />
          Predictable charge dates
        </label>
        {bill.bill.scheduled ? (
          <>
            <label className={labelClass}>
              Due day (optional)
              <input
                type="number"
                min="1"
                max="31"
                key={bill.bill.dueDay}
                defaultValue={bill.bill.dueDay ?? ""}
                disabled={pending}
                className={fieldClass}
                onBlur={(event) => {
                  const dueDay =
                    event.target.value === "" ? null : Number(event.target.value);
                  if (dueDay !== bill.bill.dueDay) onPatchBill(bill, { dueDay });
                }}
              />
            </label>
            {bill.bill.dueDay === null ? null : (
              <label className={labelClass}>
                Charged this many days before due
                <input
                  type="number"
                  min="0"
                  max="60"
                  key={bill.bill.leadDays}
                  defaultValue={bill.bill.leadDays}
                  disabled={pending}
                  className={fieldClass}
                  aria-label={`Payment lead for ${bill.name}`}
                  onBlur={(event) => {
                    const leadDays =
                      event.target.value === "" ? 0 : Number(event.target.value);
                    if (leadDays !== bill.bill.leadDays)
                      onPatchBill(bill, { leadDays });
                  }}
                />
              </label>
            )}
            {suggestedLead !== null && suggestedLead !== bill.bill.leadDays ? (
              <button
                type="button"
                disabled={pending}
                className="min-h-tap self-start rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
                onClick={() => onPatchBill(bill, { leadDays: suggestedLead })}
              >
                {suggestedLead === 0
                  ? "History says it posts on the due date — use 0"
                  : `History says it posts ${suggestedLead} days early — use ${suggestedLead}`}
              </button>
            ) : null}
          </>
        ) : null}
        {chargeWarning ? (
          <p className="text-[0.8125rem] text-[var(--chart-spend)]">{chargeWarning}</p>
        ) : null}
        {billView.omitNextCharge ? null : declared ? (
          // Two writable sources for one date is how `anchorDate` acquired three meanings.
          // With a due day the charge date is derived, so it is shown rather than typed.
          <div className={labelClass}>
            <span>Next charge</span>
            <p className="text-[0.8125rem] text-ink">
              {bill.nextDueKey ?? "—"}
              {bill.dueKey === null ? null : (
                <span className="text-ink-muted"> · due {bill.dueKey}</span>
              )}
            </p>
            <p className="text-[0.75rem] text-ink-faint">
              Set by the due day and the lead above. Clear the due day to type a date.
            </p>
          </div>
        ) : billView.showDateEditor ? (
          <label className={labelClass}>
            Next charge
            <DateKeyCell
              value={bill.nextDueKey ?? ""}
              ariaLabel={`Next charge for ${bill.name}`}
              disabled={pending}
              align="left"
              onChange={(anchorDate) => onPatchBill(bill, { anchorDate })}
            />
          </label>
        ) : (
          <p className="text-[0.8125rem] text-ink-faint">Unscheduled</p>
        )}
        {bill.bill.scheduled ? (
          <label className={labelClass}>
            Cadence
            <CadenceSelect
              value={billCadence(bill.bill)}
              disabled={pending}
              ariaLabel={`Cadence for ${bill.name}`}
              onChange={(cadence) => onPatchBill(bill, { cadence })}
              className={fieldClass}
            />
          </label>
        ) : (
          <p className="text-[0.8125rem] text-ink-muted">
            Cadence {billView.cadenceCaption}
          </p>
        )}
        {bill.bill.expectedCents === null ? (
          <p className="text-xs text-priority-b">Bill amount missing</p>
        ) : null}
        <label className={labelClass}>
          Amount
          <AmountCell
            cents={bill.bill.expectedCents}
            onCommit={(cents) => onPatchBill(bill, { expectedCents: cents })}
            label={`Amount for ${bill.name}`}
            disabled={pending}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          Status
          <select
            value={bill.bill.status}
            disabled={pending}
            aria-label={`Status for ${bill.name}`}
            onChange={(event) =>
              onPatchBill(bill, {
                status: event.target.value as EnvelopeStatus,
              })
            }
            className={fieldClass}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className={labelClass}>
          URL
          <UrlCell
            value={bill.bill.url}
            label={bill.name}
            disabled={pending}
            onCommit={(url) => onPatchBill(bill, { url })}
          />
        </label>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-[0.8125rem]">
          <dt className="text-ink-muted">A year</dt>
          <dd className="tabular text-[var(--chart-spend)]">
            {formatUsd(billView.annualCents)}
          </dd>
          <dt className="text-ink-muted">Monthly</dt>
          <dd className="tabular text-ink">{formatUsd(billView.monthlyCents)}</dd>
        </dl>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onEditPayees(bill)}
            className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
          >
            Edit payees…
          </button>
          {bill.bill.url !== "" ? (
            <UrlLink
              value={bill.bill.url}
              className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            >
              Open URL
            </UrlLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
