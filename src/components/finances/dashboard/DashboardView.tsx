"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { BankConnectionRow } from "@/lib/banksync/queries";
import {
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
    <div className="flex min-w-0 flex-col gap-3 p-3">
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
        <Panel title="Accounts" subtitle="Headline balance, and how fresh it is">
          {openAccounts.length === 0 ? (
            <PanelEmpty>
              No accounts yet. <Link href="/finances/register">Import a file</Link> or
              connect a bank in Settings.
            </PanelEmpty>
          ) : (
            <ul className="flex flex-col gap-1">
              {openAccounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-baseline justify-between gap-3 border-b border-rule py-1 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[0.8125rem] text-ink">
                      {account.name}
                    </div>
                    <div className="text-[0.75rem] text-ink-muted">
                      {KIND_LABELS[account.kind] ?? account.kind} ·{" "}
                      {freshness(account, formatDate)}
                    </div>
                  </div>
                  <div
                    className={`tabular flex-none text-[0.875rem] ${
                      account.balanceCents < 0
                        ? "text-[var(--chart-spend)]"
                        : "text-ink"
                    }`}
                  >
                    {formatUsd(account.balanceCents)}
                  </div>
                </li>
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
    </div>
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
