"use client";

import { useId } from "react";
import { Drawer, DrawerHeader } from "@/components/detail/Drawer";
import { Section } from "@/components/detail/fields";
import type {
  FinanceAuditChange,
  FinanceAuditEvent,
  FinanceMoneyCheckpoint,
} from "@/lib/finances/audit/types";
import { formatUsd } from "@/lib/finances/money";
import { financeAuditActionLabel } from "./activityColumns";

function moneyChange(before: number, after: number): string {
  return `${formatUsd(before)} → ${formatUsd(after)}`;
}

function CheckpointRail({
  before,
  after,
}: {
  before: FinanceMoneyCheckpoint | null;
  after: FinanceMoneyCheckpoint | null;
}) {
  if (!before || !after) {
    return (
      <p className="text-[0.8125rem] text-ink-muted">No checkpoint was recorded.</p>
    );
  }
  const beforeAccounts = new Map(before.accounts.map((row) => [row.accountId, row]));
  const afterAccounts = new Map(after.accounts.map((row) => [row.accountId, row]));
  const beforeBudgets = new Map(before.budgets.map((row) => [row.month, row]));
  const afterBudgets = new Map(after.budgets.map((row) => [row.month, row]));
  const accountIds = [...new Set([...beforeAccounts.keys(), ...afterAccounts.keys()])];
  const budgetMonths = [...new Set([...beforeBudgets.keys(), ...afterBudgets.keys()])];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(8rem,1fr)_auto] gap-x-4 gap-y-1 rounded border border-rule bg-surface-raised px-3 py-2 text-[0.8125rem]">
        <span className="text-ink-muted">Account pool</span>
        <span className="tabular text-right text-ink">
          {moneyChange(before.accountPoolCents, after.accountPoolCents)}
        </span>
        <span className="text-ink-muted">Selected pending</span>
        <span className="tabular text-right text-ink">
          {moneyChange(before.selectedPendingCents, after.selectedPendingCents)}
        </span>
      </div>

      {accountIds.map((accountId) => {
        const prior = beforeAccounts.get(accountId);
        const account = afterAccounts.get(accountId);
        const display = account ?? prior!;
        return (
          <div key={accountId}>
            <h4 className="mb-1 text-[0.8125rem] font-medium text-ink">
              {display.accountName}
            </h4>
            <div className="grid grid-cols-[minmax(8rem,1fr)_auto] gap-x-4 gap-y-1 text-[0.8125rem]">
              <span className="text-ink-muted">Working balance</span>
              <span className="tabular text-right text-ink">
                {prior && account
                  ? moneyChange(prior.workingCents, account.workingCents)
                  : account
                    ? `Added at ${formatUsd(account.workingCents)}`
                    : `Removed at ${formatUsd(prior!.workingCents)}`}
              </span>
              <span className="text-ink-muted">Selected pending</span>
              <span className="tabular text-right text-ink">
                {prior && account
                  ? moneyChange(
                      prior.selectedPendingCents,
                      account.selectedPendingCents,
                    )
                  : "—"}
              </span>
              <span className="text-ink-muted">Reconciliation</span>
              <span className="tabular text-right text-ink">
                {prior && account
                  ? moneyChange(prior.reconciliationCents, account.reconciliationCents)
                  : "—"}
              </span>
            </div>
          </div>
        );
      })}

      {budgetMonths.map((month) => {
        const prior = beforeBudgets.get(month);
        const budget = afterBudgets.get(month);
        const display = budget ?? prior!;
        const beforeEnvelopes = new Map(
          (prior?.envelopes ?? []).map((envelope) => [envelope.envelopeId, envelope]),
        );
        const afterEnvelopes = new Map(
          (budget?.envelopes ?? []).map((envelope) => [envelope.envelopeId, envelope]),
        );
        const envelopeIds = [
          ...new Set([...beforeEnvelopes.keys(), ...afterEnvelopes.keys()]),
        ];
        return (
          <div key={month} className="border-t border-rule pt-3">
            <h4 className="mb-1 text-[0.8125rem] font-medium text-ink">
              Budget {month.slice(0, 7)}
            </h4>
            <div className="grid grid-cols-[minmax(8rem,1fr)_auto] gap-x-4 gap-y-1 text-[0.8125rem]">
              <span className="text-ink-muted">Ready to Assign</span>
              <span className="tabular text-right text-ink">
                {prior && budget
                  ? moneyChange(prior.readyToAssignCents, budget.readyToAssignCents)
                  : formatUsd(display.readyToAssignCents)}
              </span>
              <span className="text-ink-muted">Reconciliation</span>
              <span className="tabular text-right text-ink">
                {prior && budget
                  ? moneyChange(
                      prior.accountReconciliationCents,
                      budget.accountReconciliationCents,
                    )
                  : formatUsd(display.accountReconciliationCents)}
              </span>
              <span className="text-ink-muted">Uncategorized activity</span>
              <span className="tabular text-right text-ink">
                {prior && budget
                  ? moneyChange(
                      prior.uncategorizedActivityCents,
                      budget.uncategorizedActivityCents,
                    )
                  : formatUsd(display.uncategorizedActivityCents)}
              </span>
            </div>
            <details className="mt-2 text-[0.8125rem]">
              <summary className="min-h-tap cursor-pointer text-ink-muted md:min-h-0">
                {envelopeIds.length} envelope checkpoints
              </summary>
              <div className="mt-2 flex flex-col gap-2 pl-3">
                {envelopeIds.map((envelopeId) => {
                  const old = beforeEnvelopes.get(envelopeId);
                  const envelope = afterEnvelopes.get(envelopeId);
                  const envelopeDisplay = envelope ?? old!;
                  return (
                    <div key={envelopeId}>
                      <p className="font-medium text-ink">
                        {envelopeDisplay.envelopeName}
                      </p>
                      <p className="tabular text-ink-muted">
                        {old && envelope
                          ? `Assigned ${moneyChange(old.assignedCents, envelope.assignedCents)} · Activity ${moneyChange(old.activityCents, envelope.activityCents)} · Available ${moneyChange(old.availableCents, envelope.availableCents)}`
                          : envelope
                            ? `Added · Available ${formatUsd(envelope.availableCents)}`
                            : `Removed · Available ${formatUsd(old!.availableCents)}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function Changes({ changes }: { changes: FinanceAuditChange[] }) {
  if (changes.length === 0) {
    return <p className="text-[0.8125rem] text-ink-muted">Successful no-op.</p>;
  }
  return (
    <ol className="flex list-decimal flex-col gap-3 pl-5 text-[0.8125rem]">
      {changes.map((change, index) => (
        <li key={`${change.entityIdentity}:${index}`}>
          <p className="font-medium text-ink">
            {change.entityType} · {change.entityIdentity}
          </p>
          <div className="mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <pre className="overflow-auto rounded border border-rule bg-surface-raised p-2 text-[0.6875rem] text-ink-muted">
              {JSON.stringify(change.before, null, 2)}
            </pre>
            <pre className="overflow-auto rounded border border-rule bg-surface-raised p-2 text-[0.6875rem] text-ink">
              {JSON.stringify(change.after, null, 2)}
            </pre>
          </div>
        </li>
      ))}
    </ol>
  );
}

function exactBankSnapshots(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(exactBankSnapshots);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own =
    record.format === "planner-bank-snapshot-v1" && typeof record.rawText === "string"
      ? [record.rawText]
      : [];
  return [
    ...own,
    ...Object.values(record).flatMap((child) => exactBankSnapshots(child)),
  ];
}

function SourceEvidence({ event }: { event: FinanceAuditEvent }) {
  const snapshots = exactBankSnapshots(event.sourceEvidence);
  return (
    <div className="flex flex-col gap-3">
      {snapshots.map((snapshot, index) => (
        <pre
          key={index}
          className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded border border-rule bg-surface-raised p-3 text-[0.6875rem] text-ink"
        >
          {snapshot}
        </pre>
      ))}
      <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded border border-rule bg-surface-raised p-3 text-[0.6875rem] text-ink-muted">
        {JSON.stringify(event.sourceEvidence, null, 2)}
      </pre>
    </div>
  );
}

export function ActivityDrawer({
  event,
  loading,
  error,
  onClose,
}: {
  event: FinanceAuditEvent | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  if (!loading && !event && !error) return null;

  return (
    <Drawer open onClose={onClose} labelledBy={titleId}>
      <DrawerHeader
        titleId={titleId}
        eyebrow={event ? financeAuditActionLabel(event.kind) : "Finance activity"}
        title={event?.summary ?? (loading ? "Loading evidence…" : "Could not open")}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-5 py-4">
        {error ? (
          <p role="alert" className="text-[0.875rem] text-priority-a">
            {error}
          </p>
        ) : event ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-muted">
              <span>{new Date(event.occurredAt).toLocaleString()}</span>
              <span>{event.origin}</span>
              <span>Batch {event.batchId}</span>
            </div>
            {event.warnings.length > 0 && (
              <Section title="Warnings & decisions">
                <ul className="list-disc pl-5 text-[0.8125rem] text-priority-a">
                  {event.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title="Money checkpoints">
              <CheckpointRail
                before={event.beforeCheckpoint}
                after={event.afterCheckpoint}
              />
            </Section>
            <Section title="Normalized changes">
              <Changes changes={event.changes} />
            </Section>
            <Section
              title="Source evidence"
              collapsible
              defaultOpen={false}
              summary="Stored exactly as received"
            >
              <SourceEvidence event={event} />
            </Section>
          </>
        ) : (
          <p className="text-[0.875rem] text-ink-muted">Loading…</p>
        )}
      </div>
    </Drawer>
  );
}
