/**
 * A file import can be hours ahead of SimpleFIN. The live headline is the aggregator's
 * posted number, so new CSV rows would otherwise show up as income without cash — Ready
 * to Assign rises, then account reconciliation swallows it.
 *
 * Same hold as a browser scrape: write the posted figure onto the link and keep it until
 * SimpleFIN reports the same cents or 36 hours pass (`scrapeBalance.ts`).
 */

export type LinkedPostedHeadline = {
  balanceCents: number | null;
  /** `YYYY-MM-DD` of the provider timestamp, or null if this account has never synced. */
  asOfDate: string | null;
};

export type ImportedPostedHeadline = {
  cents: number;
  source: "running-balance" | "inserted-delta";
};

export type RunningBalanceRow = {
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
  balanceAfterCents: number | null;
};

/** Posting day when the feed has one; otherwise the only date it reported. */
export function postedActivityDate(row: {
  transactionDate: string;
  postedDate: string | null;
}): string {
  return row.postedDate ?? row.transactionDate;
}

/**
 * The bank's current posted figure, when the file carries a running-balance column.
 *
 * Newest day wins. Several rows on that day are chained (each row's previous balance is
 * this balance minus its amount); the unique head of that chain is the current number.
 * Two heads on the same day means the file does not say which came last, so we refuse
 * rather than guess.
 */
export function latestRunningBalance(
  rows: readonly RunningBalanceRow[],
): { asOfDate: string; cents: number } | null {
  const withBal = rows.filter(
    (row): row is RunningBalanceRow & { balanceAfterCents: number } =>
      row.balanceAfterCents !== null,
  );
  if (withBal.length === 0) return null;

  let latestDate = postedActivityDate(withBal[0]);
  for (const row of withBal) {
    const date = postedActivityDate(row);
    if (date > latestDate) latestDate = date;
  }
  const onLatest = withBal.filter((row) => postedActivityDate(row) === latestDate);
  if (onLatest.length === 1) {
    return { asOfDate: latestDate, cents: onLatest[0].balanceAfterCents };
  }

  const predecessors = new Set(
    onLatest.map((row) => row.balanceAfterCents - row.amountCents),
  );
  const heads = onLatest.filter((row) => !predecessors.has(row.balanceAfterCents));
  if (heads.length !== 1) return null;
  return { asOfDate: latestDate, cents: heads[0].balanceAfterCents };
}

/** Newly inserted posted amounts the aggregator has not yet folded into its snapshot. */
export function insertedCentsOnOrAfter(
  rows: readonly {
    transactionDate: string;
    postedDate: string | null;
    amountCents: number;
  }[],
  asOfDate: string,
): number {
  let total = 0;
  for (const row of rows) {
    if (postedActivityDate(row) >= asOfDate) total += row.amountCents;
  }
  return total;
}

/**
 * The posted headline a file import should write onto a SimpleFIN-linked account, or
 * null when the live snapshot is already the authority (unlinked, never synced, or the
 * file is older than the snapshot).
 */
export function importedPostedHeadline(input: {
  linked: LinkedPostedHeadline | null;
  running: { asOfDate: string; cents: number } | null;
  insertedCentsOnOrAfterAsOf: number;
}): ImportedPostedHeadline | null {
  if (input.linked === null) return null;
  const { balanceCents, asOfDate } = input.linked;
  if (balanceCents === null || asOfDate === null) return null;

  if (input.running !== null && input.running.asOfDate >= asOfDate) {
    if (input.running.cents === balanceCents) return null;
    return { cents: input.running.cents, source: "running-balance" };
  }
  if (input.insertedCentsOnOrAfterAsOf === 0) return null;
  return {
    cents: balanceCents + input.insertedCentsOnOrAfterAsOf,
    source: "inserted-delta",
  };
}
