"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  pasteBankSnapshotAction,
  setSubscriptionStatusAction,
} from "@/app/finances/actions";
import { syncAction } from "@/app/settings/bankSyncActions";
import type { BankConnectionRow } from "@/lib/banksync/queries";
import { accountPoolBreakdown } from "@/lib/finances/accountPool";
import { nextPayday, type BillCharge } from "@/lib/finances/available";
import {
  accountBalanceTooltip,
  accountBalanceView,
  type PendingRow,
} from "@/lib/finances/workingBalance";
import type { Payday } from "@/lib/finances/classify/income";
import {
  staleSubscriptions,
  type CommitmentCharge,
  type StoredBillRow,
  type UpcomingBillRow,
} from "@/lib/finances/commitments";
import { ACCOUNT_KIND_LABELS } from "@/lib/finances/accountKind";
import { formatUsd } from "@/lib/finances/money";
import type { BankSnapshotApplyResult } from "@/lib/finances/bankSnapshotApply";
import type { FinanceAccountRow } from "@/lib/finances/types";
import { localDateKey } from "@/lib/schedule/geometry";
import { parsePayday, serializePayday } from "@/lib/settings/finances";
import { PAYDAY_SCOPE } from "@/lib/settings/scopes";
import { useToday } from "@/components/grid/useToday";
import {
  useDateFormatter,
  useSetting,
  type SettingCodec,
} from "@/components/settings/SettingsProvider";
import { Panel, PanelEmpty, StatRow, StatTile } from "../insights/Panel";

/**
 * The Finances dashboard: current position, and what is left to spend before the next paycheck.
 *
 * **Every number here is computed in `src/lib/finances/accountPool.ts` and
 * `workingBalance.ts`**, in one `useMemo`. That
 * is not a style preference — the arithmetic is where the reasoning lives and where a wrong
 * answer looks plausible, and a component is the one place in this codebase with no test
 * covering it. This file arranges and formats; it decides nothing.
 *
 * `today` is the reader's local day and is null until hydration, so the day count renders as a
 * dash rather than flashing a wrong one (`agent-os/standards/development/dates.md`).
 */

const PAYDAY_CODEC: SettingCodec<{
  anchorDate: string | null;
  cadenceDays: number | null;
}> = {
  parse: parsePayday,
  serialize: serializePayday,
};

export function DashboardView({
  accounts,
  pending,
  withheldBrowserPendingAccountIds,
  bills,
  paydays,
  billCharges,
  connections,
  readyToAssignCents,
  budgetConfigured,
  underfundedBills,
  upcoming,
}: {
  accounts: readonly FinanceAccountRow[];
  pending: readonly PendingRow[];
  /** Accounts whose expired browser capture is still holding pending rows out of the money. */
  withheldBrowserPendingAccountIds: readonly string[];
  bills: readonly StoredBillRow[];
  paydays: readonly Payday[];
  billCharges: readonly BillCharge[];
  connections: readonly BankConnectionRow[];
  /** This month's Ready to Assign, from the envelope budget. Zero when unconfigured. */
  readyToAssignCents: number;
  budgetConfigured: boolean;
  /** Bill envelopes whose Balance has not yet reached their expected cost. */
  underfundedBills: readonly {
    name: string;
    balanceCents: number;
    expectedCents: number;
  }[];
  /** Bill occurrences due within the horizon — not held-back money, just a heads-up. */
  upcoming: readonly UpcomingBillRow[];
}) {
  const today = useToday();
  const formatDate = useDateFormatter();
  const { value: override } = useSetting(PAYDAY_SCOPE, PAYDAY_CODEC);
  const router = useRouter();
  const [statusPending, startStatus] = useTransition();

  const analysis = useMemo(() => {
    const position = accountPoolBreakdown(accounts, pending);
    const payday = today
      ? nextPayday(paydays, override, today)
      : { dateKey: null, daysAway: null, source: "unknown" as const };

    const chargesByName = new Map<string, CommitmentCharge[]>();
    for (const charge of billCharges) {
      const list = chargesByName.get(charge.name) ?? [];
      list.push({ dateKey: charge.dateKey, costCents: 0 });
      chargesByName.set(charge.name, list);
    }
    const stale = today ? staleSubscriptions(bills, chargesByName, today) : [];

    return { position, payday, stale };
  }, [accounts, pending, bills, paydays, billCharges, override, today]);

  const unpricedBillCount = bills.filter(
    (bill) => bill.status === "active" && (bill.expectedCents ?? 0) <= 0,
  ).length;
  const { position, payday, stale } = analysis;
  const openAccounts = accounts.filter((account) => account.closedAt === null);
  // Only a capture that still holds rows out of the money is worth asking about. Expiry
  // alone never clears, so keying the ask to the timestamp nagged forever on a card whose
  // pending SimpleFIN already reports — including a card with no pending activity at all.
  const withheldIds = new Set(withheldBrowserPendingAccountIds);
  const staleSnapshotAccountNames = accounts
    .filter((account) => withheldIds.has(account.id))
    .map((account) => account.name);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <Panel
        title="Ready to assign"
        subtitle={
          payday.dateKey === null
            ? "No pay cadence detected yet — set one in Settings."
            : `${dayCountLabel(payday.daysAway)} until ${formatDate(payday.dateKey)} · ${
                payday.source === "override" ? "your setting" : "detected from deposits"
              }`
        }
        actions={
          <Link
            href="/finances/budget"
            className="text-[0.75rem] text-ink-muted hover:text-ink"
          >
            Open Budget
          </Link>
        }
      >
        {budgetConfigured ? (
          <div
            className={`tabular text-[2.25rem] leading-none font-medium ${
              readyToAssignCents < 0 ? "text-[var(--chart-spend)]" : "text-ink"
            }`}
          >
            {formatUsd(readyToAssignCents)}
          </div>
        ) : (
          <p className="text-[0.8125rem] text-ink-muted">
            No budget set up yet. <Link href="/finances/budget">Start one</Link> to see
            what is left to assign.
          </p>
        )}

        {underfundedBills.length > 0 && (
          <dl className="mt-3 flex flex-col gap-1 border-t border-rule pt-2">
            {underfundedBills.map((row) => (
              <div key={row.name} className="flex items-baseline justify-between gap-3">
                <dt className="text-[0.8125rem] text-ink-muted">{row.name}</dt>
                <dd className="tabular text-[0.8125rem] text-ink">
                  {formatUsd(row.balanceCents)} / {formatUsd(row.expectedCents)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {upcoming.length > 0 && (
          <div className="mt-3 border-t border-rule pt-2">
            <p className="text-[0.75rem] font-medium uppercase tracking-wider text-ink-muted">
              Due soon
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {upcoming.map((row) => (
                <li
                  key={`${row.name}:${row.dateKey}`}
                  className="flex items-baseline justify-between gap-3 text-[0.8125rem]"
                >
                  <span className="text-ink">
                    {row.name} · {formatDate(row.dateKey)}
                  </span>
                  <span className="tabular text-ink-muted">
                    {formatUsd(row.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <StatRow>
        <StatTile
          label="Checking & cash"
          value={formatUsd(position.checkingCashCents)}
        />
        <StatTile label="Savings" value={formatUsd(position.savingsCents)} />
        <StatTile
          label="Card debt"
          value={formatUsd(position.cardDebtCents)}
          tone={position.cardDebtCents < 0 ? "spend" : "neutral"}
        />
        <StatTile
          label="Account pool"
          value={formatUsd(position.accountPoolCents)}
          detail="On-budget working balances"
        />
      </StatRow>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Accounts"
          subtitle="Working balance, and how fresh the posted figure is"
          actions={connections.length > 0 ? <RefreshBanksButton /> : undefined}
        >
          {openAccounts.length === 0 ? (
            <PanelEmpty>
              No accounts yet. <Link href="/finances/register">Import a file</Link> or
              connect a bank in Settings.
            </PanelEmpty>
          ) : (
            <ul className="flex flex-col gap-1">
              {openAccounts.map((account) => (
                <AccountBalanceRow
                  key={account.id}
                  account={account}
                  pending={pending}
                  formatDate={formatDate}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Still active?" subtitle="Expected charges that never arrived">
          {stale.length === 0 ? (
            <PanelEmpty>Every scheduled bill has posted on time.</PanelEmpty>
          ) : (
            <ul className="flex flex-col gap-2">
              {stale.map((entry) => (
                <li
                  key={entry.billId}
                  className="border-b border-rule pb-2 last:border-b-0"
                >
                  <div className="text-[0.8125rem] text-ink">
                    {entry.name}: expected{" "}
                    {entry.expectedCents !== null
                      ? formatUsd(entry.expectedCents)
                      : "a charge"}{" "}
                    on {formatDate(entry.expectedOn)} — nothing posted.
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={statusPending || today === null}
                      onClick={() => {
                        if (today === null) return;
                        startStatus(async () => {
                          await setSubscriptionStatusAction(entry.name, "active", {
                            reanchorOn: today,
                          });
                          router.refresh();
                        });
                      }}
                      className="min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
                    >
                      Still active
                    </button>
                    <button
                      type="button"
                      disabled={statusPending}
                      onClick={() => {
                        startStatus(async () => {
                          await setSubscriptionStatusAction(entry.name, "cancelled");
                          router.refresh();
                        });
                      }}
                      className="min-h-tap rounded border border-rule px-2 text-[0.75rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
                    >
                      Cancelled
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="What this cannot see"
        subtitle="Every figure above is only as complete as what follows"
      >
        <ul className="flex flex-col gap-1 text-[0.8125rem] text-ink-muted">
          {connections.length === 0 ? (
            <li>
              No bank connected, so every balance is a statement close plus imported
              rows. Connect one in <Link href="/settings">Settings</Link>.
            </li>
          ) : (
            connections.map((connection) => (
              <li key={connection.id}>
                {connection.label || "Bank sync"} ·{" "}
                {connection.lastSyncedAt
                  ? `last read ${formatDate(localDateKey(connection.lastSyncedAt))}`
                  : "never synced"}
                {connection.reauthRequiredAt && " · needs reconnecting"}
                {connection.unmatchedAccountCount > 0 &&
                  ` · ${connection.unmatchedAccountCount} account(s) not matched to the register`}
              </li>
            ))
          )}
          {unlinkedCount(openAccounts) > 0 && (
            <li>
              {unlinkedCount(openAccounts)} account(s) have no live feed — their balance
              is the last statement close plus whatever has been imported since.
            </li>
          )}
          {unpricedBillCount > 0 && (
            <li>
              {unpricedBillCount} active bill(s) have no amount, so nothing funds them
              on the budget. Give them a cost on{" "}
              <Link href="/finances/budget">Budget</Link>.
            </li>
          )}
          {/* SimpleFIN refreshes on its own roughly daily cadence and offers nothing that
              forces a bank to hand over something newer. Saying so beats a button that
              implies otherwise. */}
          <li>
            Refreshing re-reads what the bank has already published; it cannot make it
            newer.
          </li>
        </ul>
      </Panel>

      <BankSnapshotPaste staleAccountNames={staleSnapshotAccountNames} />
    </div>
  );
}

function AccountBalanceRow({
  account,
  pending,
  formatDate,
}: {
  account: FinanceAccountRow;
  pending: readonly PendingRow[];
  formatDate: (key: string) => string;
}) {
  const view = accountBalanceView(account, pending);
  const showPosted = account.kind === "credit_card" && view.pendingCents !== 0;
  const primary = showPosted ? view.workingCents : view.postedCents;

  return (
    <li
      className="flex items-baseline justify-between gap-3 border-b border-rule py-1 last:border-b-0"
      title={accountBalanceTooltip(view)}
    >
      <div className="min-w-0">
        <AccountName account={account} />
        <div className="text-[0.75rem] text-ink-muted">
          {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind} ·{" "}
          {freshness(account, formatDate)}
        </div>
      </div>
      <div
        className={`tabular flex-none text-right text-[0.875rem] ${
          primary < 0 ? "text-[var(--chart-spend)]" : "text-ink"
        }`}
      >
        {formatUsd(primary)}
        {showPosted && (
          <span className="mt-0.5 block text-[0.75rem] font-normal text-ink-muted">
            ({formatUsd(view.postedCents)} posted)
          </span>
        )}
      </div>
    </li>
  );
}

function AccountName({ account }: { account: FinanceAccountRow }) {
  const className =
    "truncate text-[0.8125rem] text-ink underline-offset-2 hover:underline";
  if (account.url === "") {
    return <div className={className}>{account.name}</div>;
  }
  return (
    <a
      href={account.url}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
    >
      {account.name}
    </a>
  );
}

function RefreshBanksButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [auditBatchId, setAuditBatchId] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        title="Re-read what SimpleFIN currently holds. It cannot make a bank hand over something newer."
        onClick={() => {
          setNotice(null);
          setAuditBatchId(null);
          startTransition(async () => {
            const result = await syncAction();
            setNotice(result.ok ? "Re-read the bank feed." : result.error);
            if (result.ok) setAuditBatchId(result.data?.auditBatchId ?? null);
            router.refresh();
          });
        }}
        className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
      >
        {pending ? "Working…" : "Refresh now"}
      </button>
      {notice && (
        <span className="text-[0.75rem] text-ink-muted">
          {notice}
          {auditBatchId && (
            <>
              {" · "}
              <Link
                href={`/finances/activity?batch=${auditBatchId}`}
                className="underline decoration-rule underline-offset-2 hover:text-ink"
              >
                Activity
              </Link>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * The Tampermonkey scripts copy the complete current-cycle card view. This paste reconciles
 * posted transitions and makes the page's pending section authoritative for 36 hours.
 */
function BankSnapshotPaste({ staleAccountNames }: { staleAccountNames: string[] }) {
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<BankSnapshotApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(value: string) {
    const payload = value.trim() === "" ? (areaRef.current?.value ?? "") : value;
    if (payload.trim() === "") return;
    setError(null);
    setReceipt(null);
    startTransition(async () => {
      const outcome = await pasteBankSnapshotAction(payload);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const data = outcome.data;
      if (data) setReceipt(data);
      if (areaRef.current) areaRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <Panel
      title="Bank snapshot"
      subtitle="Copy a complete current-cycle snapshot on the Chase or Capital One card page, then paste it here. Planner reconciles posted and pending together."
    >
      {staleAccountNames.length > 0 && (
        <p role="status" className="mb-2 text-[0.8125rem] text-[var(--chart-spend)]">
          Capture a fresh snapshot for {staleAccountNames.join(", ")}. Its browser
          pending is stale, so SimpleFIN pending is active until you refresh it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            void navigator.clipboard.readText().then(
              (value) => {
                if (areaRef.current) areaRef.current.value = value;
                apply(value);
              },
              () => {
                setError("Could not read the clipboard. Paste into the box instead.");
              },
            );
          }}
          className="min-h-tap rounded border border-rule bg-surface-raised px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Paste from clipboard
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(areaRef.current?.value ?? "")}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Apply text
        </button>
      </div>
      {receipt && (
        <div className="mt-2 text-[0.8125rem] text-ink">
          <p>{describeBankSnapshotWrite(receipt)}</p>
          <p className="mt-1 text-ink-muted">
            Working {formatSignedDelta(receipt.checkpointDelta.workingBalanceCents)} ·
            Budget pool {formatSignedDelta(receipt.checkpointDelta.accountPoolCents)} ·
            Ready to Assign{" "}
            {formatSignedDelta(receipt.checkpointDelta.readyToAssignCents)}
            {" · "}
            <Link
              href={`/finances/activity?event=${receipt.auditEventId}`}
              className="text-ink-muted underline decoration-rule underline-offset-2 hover:text-ink"
            >
              View Activity
            </Link>
          </p>
          {receipt.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[var(--chart-spend)]">
              {receipt.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-[var(--chart-spend)]">
          {error}
        </p>
      )}
      <textarea
        ref={areaRef}
        spellCheck={false}
        rows={3}
        aria-label="Bank snapshot paste"
        placeholder="# planner-bank-snapshot v1"
        className="mt-2 w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.75rem] text-ink"
      />
    </Panel>
  );
}

function describeBankSnapshotWrite(data: BankSnapshotApplyResult): string {
  const transitions = data.posted.transitioned + data.posted.replaced;
  return (
    `${data.accountName}: ${transitions} posted transition${transitions === 1 ? "" : "s"}, ` +
    `${data.posted.inserted} new posted, ${data.pending.received} pending` +
    (data.posted.duplicates > 0 ? ` · ${data.posted.duplicates} already present` : "") +
    (data.posted.coveredByFeed > 0
      ? ` · ${data.posted.coveredByFeed} already covered by the bank feed`
      : "") +
    "."
  );
}

function formatSignedDelta(cents: number): string {
  if (cents === 0) return "$0.00";
  return `${cents > 0 ? "+" : "−"}${formatUsd(Math.abs(cents))}`;
}

/** "5 days" / "1 day" / "Today", or a dash before hydration knows the reader's day. */
function dayCountLabel(daysAway: number | null): string {
  if (daysAway === null) return "—";
  if (daysAway === 0) return "Today";
  return `${daysAway} ${daysAway === 1 ? "day" : "days"}`;
}

function unlinkedCount(accounts: readonly FinanceAccountRow[]): number {
  return accounts.filter((account) => account.syncedBalanceAsOf === null).length;
}

function freshness(
  account: FinanceAccountRow,
  formatDate: (key: string) => string,
): string {
  if (account.syncedBalanceAsOf !== null) {
    return `from the bank, ${formatDate(localDateKey(account.syncedBalanceAsOf))}`;
  }
  if (account.statementPeriodEnd !== null) {
    return `statement close ${formatDate(account.statementPeriodEnd)}, plus later rows`;
  }
  return "sum of imported rows";
}
