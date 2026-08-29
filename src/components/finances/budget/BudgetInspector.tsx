"use client";

import { useId, useState } from "react";

import { CadenceSelect } from "@/components/finances/CadenceSelect";
import { AmountCell, DateKeyCell } from "@/components/grid/cells";
import type { EnvelopeStatus } from "@/db/schema";
import type { EnvelopeIndicator } from "@/lib/finances/budget/indicator";
import {
  billCadence,
  billInspectorView,
  inspectorBreakdown,
} from "@/lib/finances/budget/inspector";
import {
  isBillRow,
  type BudgetBillRow,
  type BudgetRow,
} from "@/lib/finances/budget/rows";
import { summarize } from "@/lib/finances/budget/targets/types";
import type { PayeeEvidenceRow } from "@/lib/finances/payees/evidence";
import { monthName, type MonthKey } from "@/lib/finances/budget/envelope";
import { snoozeUnavailableReason } from "@/lib/finances/budget/snooze";
import { formatUsd } from "@/lib/finances/money";
import { FilesHereSection } from "./FilesHereSection";
import { UrlCell, withScheme } from "./UrlCell";
import { ActivityAmountLink, type BillPatch } from "./budgetColumns";

const fieldClass =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:py-1 md:text-[0.8125rem]";

const labelClass = "flex flex-col gap-1 text-[0.75rem] text-ink-muted";

const PILL: Record<EnvelopeIndicator["pill"], string> = {
  green: "text-[var(--chart-income)]",
  yellow: "text-[var(--goal-unmet)]",
  red: "text-[var(--chart-spend)]",
  gray: "text-ink-faint",
};

const IDLE: EnvelopeIndicator = {
  state: "idle",
  moreNeededCents: 0,
  copy: null,
  pill: "gray",
  icon: null,
  bar: null,
};

export function BudgetInspector({
  row,
  carryInCents,
  indicator,
  pending,
  evidence,
  selectedPayeeIds,
  onPatchBill,
  onNotes,
  onAssignUnderfunded,
  onEditTarget,
  onSnooze,
  onEditPayees,
  onTogglePayee,
  onMergePayees,
  onRemovePayeeRouting,
  onFileWaiting,
  month,
  currentMonth,
}: {
  row: BudgetRow | null;
  carryInCents: number;
  indicator: EnvelopeIndicator | null;
  pending: boolean;
  /** Payees filing into this envelope; `null` while the list is still loading. */
  evidence: readonly PayeeEvidenceRow[] | null;
  selectedPayeeIds: readonly string[];
  onPatchBill: (row: BudgetBillRow, patch: BillPatch) => void;
  onNotes: (row: BudgetRow, notes: string) => void;
  onAssignUnderfunded: (row: BudgetRow) => void;
  onEditTarget: (row: BudgetRow) => void;
  onSnooze: (row: BudgetRow) => void;
  onEditPayees: (row: BudgetRow) => void;
  onTogglePayee: (payeeId: string) => void;
  onMergePayees: () => void;
  onRemovePayeeRouting: (evidenceRow: PayeeEvidenceRow) => void;
  onFileWaiting: (evidenceRow: PayeeEvidenceRow) => void;
  month: MonthKey;
  /** Today's month, so the current-month-only rule reads the same clock the server does. */
  currentMonth: MonthKey;
}) {
  const titleId = useId();
  const [notesDraft, setNotesDraft] = useState(row?.notes ?? "");

  if (!row) {
    return (
      <div className="flex h-full items-start px-4 py-6 text-[0.8125rem] text-ink-muted">
        Select a category to see details.
      </div>
    );
  }

  const scan = indicator ?? IDLE;
  const breakdown = inspectorBreakdown(
    carryInCents,
    row.assignedCents,
    row.activityCents,
    row.balanceCents,
  );
  const bill = isBillRow(row) ? row : null;
  const billView = bill ? billInspectorView(bill.bill) : null;
  const targetSummary = row.target !== null ? summarize(row.target) : null;
  const hasTarget = targetSummary !== null;
  const snoozeReason = snoozeUnavailableReason(row, month, currentMonth);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3">
      <header className="min-w-0">
        <h2
          id={titleId}
          className={`truncate text-[1.0625rem] font-semibold ${row.hidden ? "italic text-ink-faint" : "text-ink"}`}
        >
          {row.name}
        </h2>
        <p className={`tabular mt-1 text-[1.25rem] font-medium ${PILL[scan.pill]}`}>
          {formatUsd(row.balanceCents)}
        </p>
        <p className="text-[0.6875rem] text-ink-muted">Available</p>
      </header>

      <section className="rounded border border-rule bg-surface px-3 py-2">
        <h3 className="mb-2 text-[0.75rem] font-medium text-ink-muted">
          Available balance
        </h3>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.8125rem]">
          <dt className="text-ink-muted">Leftover from last month</dt>
          <dd className="tabular text-ink">{formatUsd(breakdown.carryInCents)}</dd>
          <dt className="text-ink-muted">Assigned this month</dt>
          <dd className="tabular text-ink">{formatUsd(breakdown.assignedCents)}</dd>
          <dt className="text-ink-muted">Activity</dt>
          <dd className="tabular text-right">
            {row.isIncome ? (
              <span className="text-ink">{formatUsd(breakdown.activityCents)}</span>
            ) : (
              <ActivityAmountLink
                categoryId={row.id}
                month={month}
                cents={breakdown.activityCents}
              />
            )}
          </dd>
        </dl>
      </section>

      <section className="rounded border border-rule bg-surface px-3 py-2">
        <h3 className="mb-2 text-[0.75rem] font-medium text-ink-muted">Target</h3>
        {billView?.estimateCopy ? (
          <p className="text-[0.8125rem] text-ink">{billView.estimateCopy}</p>
        ) : scan.copy ? (
          <p className="text-[0.8125rem] text-ink">{scan.copy}</p>
        ) : (
          <p className="text-[0.8125rem] text-ink-muted">
            {bill
              ? "This bill is funded for the current month."
              : hasTarget
                ? targetSummary
                : "No target. Assign what you have; leftover stays here."}
          </p>
        )}
        {!row.isIncome ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => onEditTarget(row)}
              className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            >
              {bill || hasTarget ? "Edit target…" : "Create target…"}
            </button>
            <button
              type="button"
              disabled={pending || snoozeReason !== null}
              // The same reason the mutation rejects with, so a disabled control and a
              // permissive endpoint cannot disagree (`navigation.md`).
              title={
                snoozeReason ??
                (row.snoozed
                  ? `${row.name} will ask for its target again.`
                  : `${row.name} stops asking for the rest of ${monthName(month)}. It lapses on its own next month.`)
              }
              onClick={() => onSnooze(row)}
              className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised disabled:cursor-not-allowed disabled:text-ink-faint md:min-h-0"
            >
              {row.snoozed ? "Stop snoozing" : "Snooze target for this month"}
            </button>
          </div>
        ) : null}
      </section>

      {bill && billView ? (
        <section className="rounded border border-rule bg-surface px-3 py-2">
          <h3 className="mb-2 text-[0.75rem] font-medium text-ink-muted">Bill</h3>
          <div className="flex flex-col gap-2">
            {billView.showDateEditor ? (
              <label className={labelClass}>
                Next charge
                <DateKeyCell
                  value={row.nextDueKey ?? ""}
                  ariaLabel={`Next charge for ${row.name}`}
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
                  ariaLabel={`Cadence for ${row.name}`}
                  onChange={(cadence) => onPatchBill(bill, { cadence })}
                  className={fieldClass}
                />
              </label>
            ) : (
              <p className="text-[0.8125rem] text-ink-muted">
                Cadence {billView.cadenceCaption}
              </p>
            )}
            <label className={labelClass}>
              Amount
              <AmountCell
                cents={billView.expectedCents}
                onCommit={(cents) => onPatchBill(bill, { expectedCents: cents })}
                label={`Amount for ${row.name}`}
                disabled={pending}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Status
              <select
                value={bill.bill.status}
                disabled={pending}
                aria-label={`Status for ${row.name}`}
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
                label={row.name}
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
                onClick={() => onEditPayees(row)}
                className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
              >
                Edit payees…
              </button>
              {bill.bill.url !== "" ? (
                <a
                  href={withScheme(bill.bill.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-tap rounded border border-rule px-2 py-1 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
                >
                  Open URL
                </a>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {row.isIncome ? null : (
        <FilesHereSection
          envelopeName={row.name}
          rows={evidence}
          selected={selectedPayeeIds}
          pending={pending}
          onToggle={onTogglePayee}
          onMerge={onMergePayees}
          onRemove={onRemovePayeeRouting}
          onFileWaiting={onFileWaiting}
        />
      )}

      {scan.moreNeededCents > 0 && !row.isIncome ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAssignUnderfunded(row)}
          className="min-h-tap rounded border border-rule bg-surface px-3 py-2 text-left text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
        >
          Assign {formatUsd(scan.moreNeededCents)} to stay on track
        </button>
      ) : null}

      <label className={labelClass}>
        Notes
        <textarea
          value={notesDraft}
          disabled={pending}
          rows={3}
          aria-label={`Notes for ${row.name}`}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => {
            const next = notesDraft.trim();
            if (next !== row.notes) onNotes(row, next);
          }}
          className={`${fieldClass} resize-y`}
        />
      </label>
    </div>
  );
}
