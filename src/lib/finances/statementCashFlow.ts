/**
 * Household position from official statement bookends, and the month-to-month
 * (or pay-period) change in that position.
 *
 * A statement close is the bank's claim about one day. Between closes we walk
 * imported transactions — the same rule as the register headline, applied at
 * every bucket end. Household change then matches transaction net when every
 * internal transfer has both legs and there is no hole.
 */

export type PositionStatement = {
  accountId: string;
  periodEnd: string;
  closingBalanceCents: number;
};

export type PositionTransaction = {
  accountId: string;
  transactionDate: string;
  amountCents: number;
};

export type PositionBucket = {
  key: string;
  startKey: string;
  endKey: string;
};

export type AccountPosition = {
  accountId: string;
  cents: number;
};

export type HouseholdPosition = {
  totalCents: number;
  byAccount: AccountPosition[];
};

export type StatementCashFlowPoint = {
  key: string;
  startKey: string;
  endKey: string;
  positionCents: number;
  /** Change from the previous bucket's position. Null only for the first bucket. */
  netCents: number | null;
};

function latestCloseOnOrBefore(
  statements: readonly PositionStatement[],
  accountId: string,
  asOf: string,
): PositionStatement | null {
  let latest: PositionStatement | null = null;
  for (const row of statements) {
    if (row.accountId !== accountId) continue;
    if (row.periodEnd > asOf) continue;
    if (!latest || row.periodEnd > latest.periodEnd) latest = row;
  }
  return latest;
}

/**
 * Official close on or before `asOf`, plus imported rows after that close through
 * `asOf`. No statement → the ledger sum through `asOf`.
 */
export function accountPosition(
  statements: readonly PositionStatement[],
  txs: readonly PositionTransaction[],
  accountId: string,
  asOf: string,
): number {
  const close = latestCloseOnOrBefore(statements, accountId, asOf);
  if (!close) {
    return txs
      .filter((row) => row.accountId === accountId && row.transactionDate <= asOf)
      .reduce((total, row) => total + row.amountCents, 0);
  }
  const later = txs
    .filter(
      (row) =>
        row.accountId === accountId &&
        row.transactionDate > close.periodEnd &&
        row.transactionDate <= asOf,
    )
    .reduce((total, row) => total + row.amountCents, 0);
  return close.closingBalanceCents + later;
}

export function householdPosition(
  statements: readonly PositionStatement[],
  txs: readonly PositionTransaction[],
  asOf: string,
): HouseholdPosition {
  const ids = new Set<string>();
  for (const row of statements) ids.add(row.accountId);
  for (const row of txs) ids.add(row.accountId);
  const byAccount = [...ids].sort().map((accountId) => ({
    accountId,
    cents: accountPosition(statements, txs, accountId, asOf),
  }));
  return {
    totalCents: byAccount.reduce((total, row) => total + row.cents, 0),
    byAccount,
  };
}

/**
 * Position at each bucket's `endKey`, and the change from the previous bucket.
 *
 * Callers who need a net on the first *visible* month should pass the full
 * history's buckets and slice afterward — the same pattern as `cashFlow`.
 */
export function statementCashFlow(
  statements: readonly PositionStatement[],
  txs: readonly PositionTransaction[],
  buckets: readonly PositionBucket[],
): StatementCashFlowPoint[] {
  return buckets.map((bucket, index) => {
    const positionCents = householdPosition(statements, txs, bucket.endKey).totalCents;
    const previous =
      index === 0
        ? null
        : householdPosition(statements, txs, buckets[index - 1].endKey).totalCents;
    return {
      key: bucket.key,
      startKey: bucket.startKey,
      endKey: bucket.endKey,
      positionCents,
      netCents: previous === null ? null : positionCents - previous,
    };
  });
}
