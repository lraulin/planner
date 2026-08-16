"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pasteScrapedPendingAction } from "@/app/finances/actions";
import type { BankConnectionRow } from "@/lib/banksync/queries";
import {
  accountBalanceView,
  availableToSpend,
  cashPosition,
  nextPayday,
  setAsideHeld,
  type BillCharge,
  type PendingRow,
  type SetAside,
} from "@/lib/finances/available";
import type { Payday } from "@/lib/finances/classify/income";
import { formatUsd } from "@/lib/finances/money";
import type { StoredBill } from "@/lib/finances/recurringBills";
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
 * **Every number here is computed in `src/lib/finances/available.ts`**, in one `useMemo`. That
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

const KIND_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  investment: "Investment",
  loan: "Loan",
  other: "Other",
};

export function DashboardView({
  accounts,
  pending,
  bills,
  paydays,
  billCharges,
  connections,
}: {
  accounts: readonly FinanceAccountRow[];
  pending: readonly PendingRow[];
  bills: readonly StoredBill[];
  paydays: readonly Payday[];
  billCharges: readonly BillCharge[];
  connections: readonly BankConnectionRow[];
}) {
  const today = useToday();
  const formatDate = useDateFormatter();
  const { value: override } = useSetting(PAYDAY_SCOPE, PAYDAY_CODEC);

  const analysis = useMemo(() => {
    const position = cashPosition(accounts);
    const payday = today
      ? nextPayday(paydays, override, today)
      : { dateKey: null, daysAway: null, source: "unknown" as const };

    const setAsides: SetAside[] = today
      ? bills
          .map((bill) => setAsideHeld(bill, paydays, billCharges, today))
          .filter((entry): entry is SetAside => entry !== null)
      : [];

    return {
      position,
      payday,
      setAsides,
      available: availableToSpend(accounts, pending, setAsides),
    };
  }, [accounts, pending, bills, paydays, billCharges, override, today]);

  const { available, position, payday, setAsides } = analysis;
  const openAccounts = accounts.filter((account) => account.closedAt === null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <Panel
        title="Available to spend"
        subtitle={
          payday.dateKey === null
            ? "No pay cadence detected yet — set one in Settings."
            : `${dayCountLabel(payday.daysAway)} until ${formatDate(payday.dateKey)} · ${
                payday.source === "override" ? "your setting" : "detected from deposits"
              }`
        }
      >
        <div
          className={`tabular text-[2.25rem] leading-none font-medium ${
            available.totalCents < 0 ? "text-[var(--chart-spend)]" : "text-ink"
          }`}
        >
          {formatUsd(available.totalCents)}
        </div>

        {/* The arithmetic, not a restatement of it: these terms come back from the same call
            that produced the headline, so a breakdown cannot disagree with its own total. */}
        <dl className="mt-3 flex flex-col gap-1 border-t border-rule pt-2">
          {available.terms.map((term) => (
            <div key={term.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[0.8125rem] text-ink-muted">{term.label}</dt>
              <dd className="tabular text-[0.8125rem] text-ink">
                {formatUsd(term.cents)}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">
          Card balances come out in full: a card charge does not leave checking until
          the statement is paid. Savings is not counted here.
        </p>
      </Panel>

      <StatRow>
        <StatTile label="Checking & cash" value={formatUsd(position.spendableCents)} />
        <StatTile label="Savings" value={formatUsd(position.savingsCents)} />
        <StatTile
          label="Card debt"
          value={formatUsd(position.cardDebtCents)}
          tone={position.cardDebtCents < 0 ? "spend" : "neutral"}
        />
        <StatTile
          label="Cash position"
          value={formatUsd(position.netCents)}
          detail="Checking + savings − cards"
        />
      </StatRow>

      <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel
          title="Accounts"
          subtitle="Working balance, and how fresh the posted figure is"
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

        <Panel
          title="Set aside"
          subtitle="Held back out of each paycheck until the bill is paid"
        >
          {setAsides.length === 0 ? (
            <PanelEmpty>
              Nothing set aside. Declare a bill on{" "}
              <Link href="/finances/insights">Insights</Link> and mark it a set-aside.
            </PanelEmpty>
          ) : (
            <ul className="flex flex-col gap-2">
              {setAsides.map((entry) => (
                <li
                  key={entry.merchant}
                  className="border-b border-rule pb-2 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[0.8125rem] text-ink">
                      {entry.merchant}
                    </span>
                    <span className="tabular flex-none text-[0.875rem] text-ink">
                      {formatUsd(entry.heldCents)}
                    </span>
                  </div>
                  <div className="text-[0.75rem] text-ink-muted">
                    {formatUsd(entry.perPaycheckCents)} per paycheck of{" "}
                    {formatUsd(entry.expectedCents)} · due{" "}
                    {formatDate(entry.nextDueKey)}
                    {entry.fullyFunded && " · fully set aside"}
                    {/* A paid bill re-anchors on its own charge, so its next due date is a
                        cadence in the future. A due date still in the past means it was
                        missed. */}
                    {today !== null && entry.nextDueKey < today && " · overdue"}
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
          <li>
            {setAsides.length} of {bills.length} declared bill(s) are set aside. The
            rest are not held back from the figure above.
          </li>
          {/* SimpleFIN refreshes on its own roughly daily cadence and offers nothing that
              forces a bank to hand over something newer. Saying so beats a button that
              implies otherwise. */}
          <li>
            Refreshing re-reads what the bank has already published; it cannot make it
            newer.
          </li>
        </ul>
      </Panel>

      <CapOnePendingPaste />
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
    <li className="flex items-baseline justify-between gap-3 border-b border-rule py-1 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-[0.8125rem] text-ink">{account.name}</div>
        <div className="text-[0.75rem] text-ink-muted">
          {KIND_LABELS[account.kind] ?? account.kind} · {freshness(account, formatDate)}
        </div>
      </div>
      <div
        className={`tabular flex-none text-right text-[0.875rem] ${
          primary < 0 ? "text-[var(--chart-spend)]" : "text-ink"
        }`}
        title={
          showPosted
            ? `${formatUsd(view.workingCents)} includes pending. ${formatUsd(view.postedCents)} is what the bank shows as posted.`
            : undefined
        }
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

/**
 * Capital One does not send pending rows through SimpleFIN. The Tampermonkey script copies
 * the bank page's pending table; this is the paste that writes them.
 */
function CapOnePendingPaste() {
  const today = useToday();
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function apply(value: string) {
    const payload = value.trim() === "" ? (areaRef.current?.value ?? "") : value;
    if (today === null || payload.trim() === "") return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const outcome = await pasteScrapedPendingAction(payload, today);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const data = outcome.data;
      setMessage(
        data
          ? `Wrote ${data.inserted} pending on ${data.accountName}` +
              (data.skippedPosted > 0
                ? ` · ${data.skippedPosted} already posted`
                : "") +
              "."
          : "Updated.",
      );
      if (areaRef.current) areaRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <Panel
      title="Capital One pending"
      subtitle="SimpleFIN does not send these. Copy on the bank page, then paste here."
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || today === null}
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
          disabled={pending || today === null}
          onClick={() => apply(areaRef.current?.value ?? "")}
          className="min-h-tap rounded border border-rule px-2 text-[0.8125rem] text-ink disabled:opacity-50 md:min-h-0 md:py-1"
        >
          Apply text
        </button>
      </div>
      {message && <p className="mt-2 text-[0.8125rem] text-ink">{message}</p>}
      {error && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-[var(--chart-spend)]">
          {error}
        </p>
      )}
      <textarea
        ref={areaRef}
        spellCheck={false}
        rows={3}
        aria-label="Capital One pending paste"
        placeholder="# planner-pending v1"
        className="mt-2 w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.75rem] text-ink"
      />
    </Panel>
  );
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
