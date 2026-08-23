/**
 * Discover recurring payments from register history.
 *
 * Ranking and matching from Actual's `find-schedules.ts` (MIT, © James Long):
 * `getRank = 1 / (daysOff + 1)`; a candidate needs a match in every sampled occurrence;
 * transfers and already-scheduled transactions are excluded from the pool.
 */

import { daysBetweenKeys } from "@/lib/schedule/geometry";
import { approxThreshold } from "./conditions";
import type { RecurConfig } from "./recur";
import { occurrences } from "./recur";

export type DiscoverTx = {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  merchant: string;
  scheduleId: string | null;
  transferGroupId: string | null;
};

export type DiscoverProposal = {
  rank: number;
  accountId: string;
  merchant: string;
  amountCents: number;
  date: RecurConfig;
  exactDate: boolean;
  exactAmount: boolean;
};

export function getRank(day1: string, day2: string): number {
  return 1 / (Math.abs(daysBetweenKeys(day1, day2)) + 1);
}

export function isDiscoverable(row: DiscoverTx): boolean {
  return row.scheduleId == null && row.transferGroupId == null && row.merchant !== "";
}

/**
 * Transactions within ±2 days of `date`, discoverable only.
 */
export function aroundDate(
  rows: readonly DiscoverTx[],
  date: string,
  accountId: string,
): DiscoverTx[] {
  return rows.filter((row) => {
    if (row.accountId !== accountId || !isDiscoverable(row)) return false;
    const off = Math.abs(daysBetweenKeys(row.date, date));
    return off <= 2;
  });
}

/**
 * Actual's `matchSchedules`: given 3 sampled occurrences and the transactions near each,
 * emit a proposal for every base transaction that has a same-merchant, within-threshold
 * match in every later occurrence.
 */
export function matchSchedules(
  sampled: readonly { date: string; transactions: readonly DiscoverTx[] }[],
  config: RecurConfig,
): DiscoverProposal[] {
  if (sampled.length === 0) return [];
  const reversed = [...sampled].reverse();
  const base = reversed[0];
  const later = reversed.slice(1);
  const proposals: DiscoverProposal[] = [];

  for (const trans of base.transactions) {
    const threshold = approxThreshold(trans.amountCents);
    const found = later.map((occur) => {
      const matched = occur.transactions.find(
        (row) =>
          row.merchant === trans.merchant &&
          row.amountCents >= trans.amountCents - threshold &&
          row.amountCents <= trans.amountCents + threshold,
      );
      return matched
        ? { trans: matched, rank: getRank(occur.date, matched.date) }
        : null;
    });
    if (found.some((entry) => entry == null)) continue;

    const rank = found.reduce(
      (total, match) => total + (match?.rank ?? 0),
      getRank(base.date, trans.date),
    );
    const exactAmount = found.every(
      (match) => match?.trans.amountCents === trans.amountCents,
    );
    proposals.push({
      rank,
      amountCents: trans.amountCents,
      accountId: trans.accountId,
      merchant: trans.merchant,
      date: config,
      exactDate: rank === sampled.length,
      exactAmount,
    });
  }
  return proposals;
}

/**
 * Sample the first `take` occurrences of `config` and match them against `rows`.
 */
export function proposalsForConfig(
  config: RecurConfig,
  rows: readonly DiscoverTx[],
  accountId: string,
  take = 3,
): DiscoverProposal[] {
  const dates = occurrences(config, config.start, take);
  if (dates.length < take) return [];
  const sampled = dates.map((date) => ({
    date,
    transactions: aroundDate(rows, date, accountId),
  }));
  return matchSchedules(sampled, config);
}
