/**
 * Compare official statement bookends to the register.
 *
 * A statement is not a money movement. It is the bank's claim that
 * `opening + activity = closing` for one period. The register is our claim about
 * the same days. This module is the comparison — integer cents, no database.
 *
 * Headline current balance is statement-anchored: latest closing plus every
 * transaction dated after that period. The ledger sum of every row stays the
 * diagnostic. A disagreement is a warning, never a reason to rewrite `amount`.
 */

import { shiftDateKey } from "@/lib/schedule/geometry";
import type { FinanceFlowKind } from "@/db/schema";

export type ReconcileTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  amountCents: number;
  derivedFlow?: FinanceFlowKind | null;
  flowOverride?: FinanceFlowKind | null;
  transferGroupId?: string | null;
};

export type ReconcileStatement = {
  id: string;
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
};

export type StatementReconcile = {
  statementId: string;
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  registerSumCents: number;
  /** `opening + registerSum − closing`. Zero means the period matches. */
  registerDeltaCents: number;
  rowCount: number;
  rowIds: string[];
};

export type CoverageHole = {
  accountId: string;
  accountName: string;
  afterPeriodEnd: string;
  beforePeriodStart: string;
  previousClosingCents: number;
  nextOpeningCents: number;
  /** `nextOpening − previousClosing`. The net the register cannot see. */
  discontinuityCents: number;
};

export type AccountReconcile = {
  accountId: string;
  accountName: string;
  ledgerBalanceCents: number;
  /** Latest close + later txs, or the ledger when there is no statement. */
  anchoredBalanceCents: number;
  latestStatement: { periodEnd: string; closingBalanceCents: number } | null;
  postStatementCount: number;
  postStatementCents: number;
  /** `ledger − anchored`. Zero when there is no statement. */
  mismatchCents: number;
};

export type UnpairedTransfer = {
  id: string;
  accountId: string;
  accountName: string;
  transactionDate: string;
  amountCents: number;
};

export type ReconcileReport = {
  accounts: AccountReconcile[];
  statements: StatementReconcile[];
  holes: CoverageHole[];
  unpairedTransfers: UnpairedTransfer[];
};

function inPeriod(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}

function isUnpairedTransfer(row: ReconcileTransaction): boolean {
  const flow = row.flowOverride ?? row.derivedFlow;
  return flow === "internal_transfer" && !row.transferGroupId;
}

function accountNameOf(
  accountId: string,
  statements: readonly ReconcileStatement[],
  transactions: readonly ReconcileTransaction[],
): string {
  const fromStatement = statements.find((row) => row.accountId === accountId);
  if (fromStatement) return fromStatement.accountName;
  const fromTx = transactions.find((row) => row.accountId === accountId);
  return fromTx?.accountName ?? accountId;
}

/**
 * Official bookends vs the register, per account and per stored period.
 *
 * Post-statement activity is expected mid-cycle: it changes the headline and
 * is not an error. A calendar or opening/closing break between consecutive
 * statements is a hole.
 */
export function reconcileAccounts(
  statements: readonly ReconcileStatement[],
  transactions: readonly ReconcileTransaction[],
): ReconcileReport {
  const accountIds = new Set<string>();
  for (const row of statements) accountIds.add(row.accountId);
  for (const row of transactions) accountIds.add(row.accountId);

  const byAccountTxs = new Map<string, ReconcileTransaction[]>();
  for (const row of transactions) {
    const list = byAccountTxs.get(row.accountId) ?? [];
    list.push(row);
    byAccountTxs.set(row.accountId, list);
  }

  const byAccountStatements = new Map<string, ReconcileStatement[]>();
  for (const row of statements) {
    const list = byAccountStatements.get(row.accountId) ?? [];
    list.push(row);
    byAccountStatements.set(row.accountId, list);
  }

  const statementRows: StatementReconcile[] = [];
  const holes: CoverageHole[] = [];
  const accounts: AccountReconcile[] = [];

  for (const accountId of [...accountIds].sort()) {
    const name = accountNameOf(accountId, statements, transactions);
    const txs = byAccountTxs.get(accountId) ?? [];
    const snaps = [...(byAccountStatements.get(accountId) ?? [])].sort((left, right) =>
      left.periodStart.localeCompare(right.periodStart),
    );

    for (const snap of snaps) {
      const inRange = txs.filter((row) =>
        inPeriod(row.transactionDate, snap.periodStart, snap.periodEnd),
      );
      const registerSumCents = inRange.reduce(
        (total, row) => total + row.amountCents,
        0,
      );
      statementRows.push({
        statementId: snap.id,
        accountId,
        accountName: snap.accountName,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
        openingBalanceCents: snap.openingBalanceCents,
        closingBalanceCents: snap.closingBalanceCents,
        registerSumCents,
        registerDeltaCents:
          snap.openingBalanceCents + registerSumCents - snap.closingBalanceCents,
        rowCount: inRange.length,
        rowIds: inRange.map((row) => row.id),
      });
    }

    for (let i = 0; i < snaps.length - 1; i += 1) {
      const current = snaps[i];
      const next = snaps[i + 1];
      const expectedStart = shiftDateKey(current.periodEnd, 1);
      const calendarGap = next.periodStart !== expectedStart;
      const balanceGap = current.closingBalanceCents !== next.openingBalanceCents;
      if (!calendarGap && !balanceGap) continue;
      holes.push({
        accountId,
        accountName: current.accountName,
        afterPeriodEnd: current.periodEnd,
        beforePeriodStart: next.periodStart,
        previousClosingCents: current.closingBalanceCents,
        nextOpeningCents: next.openingBalanceCents,
        discontinuityCents: next.openingBalanceCents - current.closingBalanceCents,
      });
    }

    const ledgerBalanceCents = txs.reduce((total, row) => total + row.amountCents, 0);
    const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
    const later = latest
      ? txs.filter((row) => row.transactionDate > latest.periodEnd)
      : [];
    const postStatementCents = later.reduce((total, row) => total + row.amountCents, 0);
    const anchoredBalanceCents = latest
      ? latest.closingBalanceCents + postStatementCents
      : ledgerBalanceCents;

    accounts.push({
      accountId,
      accountName: name,
      ledgerBalanceCents,
      anchoredBalanceCents,
      latestStatement: latest
        ? {
            periodEnd: latest.periodEnd,
            closingBalanceCents: latest.closingBalanceCents,
          }
        : null,
      postStatementCount: later.length,
      postStatementCents,
      mismatchCents: latest ? ledgerBalanceCents - anchoredBalanceCents : 0,
    });
  }

  const unpairedTransfers = transactions.filter(isUnpairedTransfer).map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountName: row.accountName,
    transactionDate: row.transactionDate,
    amountCents: row.amountCents,
  }));

  return {
    accounts,
    statements: statementRows,
    holes,
    unpairedTransfers,
  };
}

/** True when `dateKey` falls strictly between two statement bookends. */
export function dateFallsInHole(dateKey: string, hole: CoverageHole): boolean {
  return dateKey > hole.afterPeriodEnd && dateKey < hole.beforePeriodStart;
}
