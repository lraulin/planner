/**
 * A file import can be hours ahead of SimpleFIN. The live headline is the aggregator's
 * posted number, so new CSV rows would otherwise show up as income without cash — Ready
 * to Assign rises, then account reconciliation swallows it.
 *
 * What this module answers is **what posted figure the file implies and what day it was
 * true**. Whether that figure outranks the other sources is not its business: it reports
 * the file's own stamp and `sourceAuthority.ts` ranks it. Its previous
 * `running.asOfDate >= asOfDate` gate was a second, weaker copy of that comparison.
 */

export type LinkedPostedHeadline = {
  balanceCents: number | null;
  /** `YYYY-MM-DD` of the provider timestamp, or null if this account has never synced. */
  asOfDate: string | null;
};

export type ImportedPostedHeadline = {
  cents: number;
  /** The newest data day the figure is true as of. Files carry no instant. */
  asOfDay: string;
  source: "running-balance" | "inserted-delta";
};

/** A row dated on both axes, carrying its signed amount. */
export type PostedActivityRow = {
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
};

export type RunningBalanceRow = PostedActivityRow & {
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

/**
 * The posted figure this file reports, and the day it is true as of.
 *
 * Two ways a file can say what the bank's balance is:
 *
 * - A **running-balance** column states it outright, as of the file's newest data day.
 * - Otherwise the file only implies it: take the feed's last posted figure and add the
 *   rows this import inserted on or after the feed's own as-of day, which the feed has
 *   not folded in yet. That derivation needs the feed's figure, so it is only available on
 *   a linked, synced account — and it is true as of the newest day it added.
 *
 * Null when the file says nothing new. Whether the result outranks the other sources is
 * decided by `sourceAuthority.ts`, not here.
 */
export function importedPostedHeadline(input: {
  linked: LinkedPostedHeadline | null;
  running: { asOfDate: string; cents: number } | null;
  inserted: readonly PostedActivityRow[];
}): ImportedPostedHeadline | null {
  if (input.running !== null) {
    return {
      cents: input.running.cents,
      asOfDay: input.running.asOfDate,
      source: "running-balance",
    };
  }
  if (input.linked === null) return null;
  const { balanceCents, asOfDate } = input.linked;
  if (balanceCents === null || asOfDate === null) return null;

  const added = input.inserted.filter((row) => postedActivityDate(row) >= asOfDate);
  if (added.length === 0) return null;
  const cents = added.reduce((total, row) => total + row.amountCents, balanceCents);
  if (cents === balanceCents) return null;
  const asOfDay = added.reduce(
    (latest, row) =>
      postedActivityDate(row) > latest ? postedActivityDate(row) : latest,
    asOfDate,
  );
  return { cents, asOfDay, source: "inserted-delta" };
}
