/**
 * Report the `scrape:*` posted rows that are the same charge as a feed row, for a person
 * to delete by hand.
 *
 * Before D4 (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/`) stopped bank pages
 * from writing posted history on feed-covered accounts, a page capture and SimpleFIN could
 * both insert the same real-world charge — the Sep 13 Walmart −$195.56 pair, the Capital
 * One `Payment from CAPITAL ONE N.A.` / `CAPITAL ONE ONLINE PYMT` pair. D4 stops new ones;
 * this finds the ones already in the ledger. Matching is amount-and-date only, deliberately
 * not gated on description overlap the way `feedPairing.ts` gates a live pairing — the
 * whole reason these pairs exist is a page display name (`Amazon.com`) and a feed
 * descriptor (`AMAZON MKTPL*537NK9DZ2`) that share no substring, so a description gate
 * would hide exactly the duplicates this report exists to find. Read-only: nothing here
 * writes, and there is no `--apply` (`scripts/payee-merge-audit.ts` sets the precedent —
 * a plausible-looking automatic merge damaged real data before).
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { bankAccountLinks, financeAccounts, financeTransactions } from "@/db/schema";
import { dateDistance, DATE_TOLERANCE_DAYS, type DatedRow } from "./liveFeedMatch";
import { numericStringToCents } from "./money";

export type DuplicateCandidateRow = DatedRow & {
  id: string;
  accountId: string;
  amountCents: number;
  description: string;
  externalSource: string | null;
};

export type ScrapeDuplicateMatch = {
  accountId: string;
  scrapeId: string;
  scrapeDescription: string;
  scrapeSource: string;
  feedId: string;
  feedDescription: string;
  amountCents: number;
  transactionDate: string;
};

function isScrapeSource(source: string | null): boolean {
  return source !== null && source.startsWith("scrape:");
}

/**
 * Pair each `scrape:*` posted row against a feed-sourced posted row at the same amount,
 * within `DATE_TOLERANCE_DAYS`, on the same account. Occurrence-counted and greedy by
 * nearest date, same as `feedPairing.ts`'s `pairRows` — so one feed row cannot absorb two
 * scrape rows and read as though only one duplicate exists.
 */
export function findScrapeDuplicates(
  rows: readonly DuplicateCandidateRow[],
): ScrapeDuplicateMatch[] {
  const byAccount = new Map<string, DuplicateCandidateRow[]>();
  for (const row of rows) {
    const list = byAccount.get(row.accountId);
    if (list) list.push(row);
    else byAccount.set(row.accountId, [row]);
  }

  const matches: ScrapeDuplicateMatch[] = [];
  for (const accountRows of byAccount.values()) {
    const scrapeRows = accountRows.filter((row) => isScrapeSource(row.externalSource));
    const feedRows = accountRows.filter(
      (row) => row.externalSource !== null && !isScrapeSource(row.externalSource),
    );

    const candidates: {
      scrape: DuplicateCandidateRow;
      feed: DuplicateCandidateRow;
      distance: number;
    }[] = [];
    for (const scrape of scrapeRows) {
      for (const feed of feedRows) {
        if (scrape.amountCents !== feed.amountCents) continue;
        const distance = dateDistance(scrape, feed);
        if (distance > DATE_TOLERANCE_DAYS) continue;
        candidates.push({ scrape, feed, distance });
      }
    }

    candidates.sort(
      (left, right) =>
        left.distance - right.distance ||
        `${left.scrape.id}:${left.feed.id}`.localeCompare(
          `${right.scrape.id}:${right.feed.id}`,
        ),
    );

    const usedScrape = new Set<string>();
    const usedFeed = new Set<string>();
    for (const candidate of candidates) {
      if (usedScrape.has(candidate.scrape.id) || usedFeed.has(candidate.feed.id))
        continue;
      usedScrape.add(candidate.scrape.id);
      usedFeed.add(candidate.feed.id);
      matches.push({
        accountId: candidate.scrape.accountId,
        scrapeId: candidate.scrape.id,
        scrapeDescription: candidate.scrape.description,
        scrapeSource: candidate.scrape.externalSource ?? "",
        feedId: candidate.feed.id,
        feedDescription: candidate.feed.description,
        amountCents: candidate.scrape.amountCents,
        transactionDate: candidate.scrape.transactionDate,
      });
    }
  }

  matches.sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      left.scrapeId.localeCompare(right.scrapeId),
  );
  return matches;
}

/**
 * Load every posted, top-level transaction on this user's feed-covered accounts (D4: has a
 * `bank_account_links` row) and report the scrape/feed duplicates among them.
 */
export async function scrapeDuplicateReport(
  userId: string,
): Promise<(ScrapeDuplicateMatch & { accountName: string })[]> {
  const linkedAccounts = await db
    .selectDistinct({ id: financeAccounts.id, name: financeAccounts.name })
    .from(bankAccountLinks)
    .innerJoin(
      financeAccounts,
      and(
        eq(financeAccounts.id, bankAccountLinks.accountId),
        eq(financeAccounts.userId, userId),
      ),
    )
    .where(eq(bankAccountLinks.userId, userId));

  if (linkedAccounts.length === 0) return [];
  const accountNames = new Map(
    linkedAccounts.map((account) => [account.id, account.name]),
  );
  const accountIds = new Set(linkedAccounts.map((account) => account.id));

  const stored = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      externalSource: financeTransactions.externalSource,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.pending, false),
        isNull(financeTransactions.parentId),
      ),
    );

  const rows: DuplicateCandidateRow[] = stored
    .filter((row) => accountIds.has(row.accountId))
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      postedDate: row.postedDate,
      amountCents: numericStringToCents(row.amount) ?? 0,
      description: row.description,
      externalSource: row.externalSource,
    }));

  return findScrapeDuplicates(rows).map((match) => ({
    ...match,
    accountName: accountNames.get(match.accountId) ?? match.accountId,
  }));
}

function centsToDollars(cents: number): string {
  const negative = cents < 0;
  const dollars = (Math.abs(cents) / 100).toFixed(2);
  return `${negative ? "-" : ""}$${dollars}`;
}

/** The report itself. Pure, so what the script prints is what the tests read. */
export function formatScrapeDuplicateReport(
  matches: readonly (ScrapeDuplicateMatch & { accountName: string })[],
): string {
  const lines: string[] = [`Likely duplicates: ${matches.length}`];

  if (matches.length === 0) {
    lines.push("  none — no scrape:* posted row lines up with a feed row.");
  }

  for (const match of matches) {
    lines.push(
      `  ${match.transactionDate}  ${centsToDollars(match.amountCents)}  ${match.accountName}`,
      `      scrape (${match.scrapeSource}): "${match.scrapeDescription}"  [${match.scrapeId}]`,
      `      feed:                    "${match.feedDescription}"  [${match.feedId}]`,
    );
  }

  lines.push(
    "",
    "Nothing was written or deleted. Confirm each pair against the register, then delete",
    "the scrape row by hand — the feed row is the one D4 keeps writing history from.",
  );
  return lines.join("\n");
}
