"use client";

import { useId, useState } from "react";

import { BillFields } from "./BillFields";
import type { EnvelopeIndicator } from "@/lib/finances/budget/indicator";
import { isQuietCancelledBill } from "@/lib/finances/budget/hierarchy";
import {
  billInspectorView,
  inspectorBreakdown,
  targetPaneView,
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

const RING: Record<EnvelopeIndicator["pill"], string> = {
  green: "text-[var(--chart-income)]",
  yellow: "text-[var(--goal-unmet)]",
  red: "text-[var(--chart-spend)]",
  gray: "text-ink-faint",
};

function TargetProgressRing({
  fill01,
  pill,
}: {
  fill01: number;
  pill: EnvelopeIndicator["pill"];
}) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fill01);
  const percent = Math.round(fill01 * 100);
  return (
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-rule"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={RING[pill]}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[0.625rem] font-medium tabular text-ink">
        {percent}%
      </span>
    </div>
  );
}

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
  const subduedName = row.hidden || isQuietCancelledBill(row);
  const targetSummary = row.target !== null ? summarize(row.target) : null;
  const hasTarget = targetSummary !== null;
  const snoozeReason = snoozeUnavailableReason(row, month, currentMonth);
  const pane = targetPaneView(row, carryInCents, month, scan);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3">
      <header className="min-w-0">
        <h2
          id={titleId}
          className={`truncate text-[1.0625rem] font-semibold ${subduedName ? "italic text-ink-faint" : "text-ink"}`}
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {billView?.estimateCopy ? (
              <p className="text-[0.8125rem] text-ink">{billView.estimateCopy}</p>
            ) : pane.progress ? (
              <p className="text-[0.8125rem] text-ink">{pane.progress.summary}</p>
            ) : scan.copy ? (
              <p className="text-[0.8125rem] text-ink">{scan.copy}</p>
            ) : (
              <p className="text-[0.8125rem] text-ink-muted">
                {bill
                  ? "This bill is funded for the current month."
                  : "No target. Assign what you have; leftover stays here."}
              </p>
            )}
          </div>
          {pane.fill01 !== null ? (
            <TargetProgressRing fill01={pane.fill01} pill={scan.pill} />
          ) : null}
        </div>
        {pane.showAssignCallout ? (
          <div className="mt-3 rounded border border-[var(--goal-unmet)] bg-[var(--goal-unmet)]/10 px-3 py-2">
            <p className="text-[0.8125rem] text-ink">
              Assign{" "}
              <span className="font-medium tabular">
                {formatUsd(pane.assignThisMonthCents)}
              </span>{" "}
              this month to stay on track
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => onAssignUnderfunded(row)}
              className="mt-2 min-h-tap w-full rounded bg-[var(--goal-unmet)] px-3 py-2 text-[0.8125rem] font-medium text-surface hover:opacity-90 disabled:opacity-50 md:min-h-0 md:py-1.5"
            >
              Assign
            </button>
          </div>
        ) : null}
        {pane.progress ? (
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[0.8125rem]">
            <dt className="text-ink-muted">{pane.progress.neededLabel}</dt>
            <dd className="tabular text-ink">{formatUsd(pane.progress.neededCents)}</dd>
            <dt className="text-ink-muted">Funded</dt>
            <dd className="tabular text-ink">{formatUsd(pane.progress.fundedCents)}</dd>
            <dt className="text-ink-muted">To Go</dt>
            <dd className="tabular text-ink">{formatUsd(pane.progress.toGoCents)}</dd>
          </dl>
        ) : null}
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

      {bill ? (
        <BillFields
          bill={bill}
          pending={pending}
          onPatchBill={onPatchBill}
          onEditPayees={onEditPayees}
        />
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
