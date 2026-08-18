/**
 * Write path for scraped Capital One pending rows.
 *
 * Not `import.ts`: that path inserts or skips and never deletes. These rows are a snapshot
 * of what the bank page currently calls pending, so a second paste that omits Walmart has
 * to remove Walmart. Not `applySync` either: that deletes only `api:simplefin` ids, and a
 * scrape id must never be treated as one that vanished from a SimpleFIN window.
 */

import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { bankAccountLinks, financeAccounts, financeTransactions } from "@/db/schema";
import { normalizeMerchant } from "./classify/merchant";
import {
  CHASE_SCRAPE_FEED,
  parsePlannerPending,
  SCRAPE_FEED,
  type ScrapedPendingPayload,
  type ScrapedPendingRow,
} from "./capitalOnePending";
import { centsToNumericString, numericStringToCents } from "./money";

const scrapeSource = like(financeTransactions.externalSource, "scrape:%");

export type ReplaceScrapedPendingResult = {
  accountId: string;
  accountName: string;
  inserted: number;
  /** Rows already covered by a posted charge, so they were not written. */
  skippedPosted: number;
  /** Previous scrape-pending rows removed by the snapshot replace. */
  replaced: number;
  /** Synced headline was rewritten from the scrape's current balance. */
  balanceUpdated: boolean;
};

export async function replaceScrapedPending(
  userId: string,
  text: string,
  todayKey: string,
): Promise<ReplaceScrapedPendingResult> {
  const parsed = parsePlannerPending(text, todayKey);
  if (!parsed.ok) throw new Error(parsed.error);
  return writeScrapedPending(userId, parsed.payload);
}

export async function writeScrapedPending(
  userId: string,
  payload: ScrapedPendingPayload,
): Promise<ReplaceScrapedPendingResult> {
  const account = await resolveCardByLast4(userId, payload.last4);

  return db.transaction(async (tx) => {
    const posted = await tx
      .select({
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        transactionDate: financeTransactions.transactionDate,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.accountId, account.id),
          eq(financeTransactions.pending, false),
        ),
      );

    const postedRows = posted.map((row) => ({
      description: row.description,
      amountCents: numericStringToCents(row.amount) ?? 0,
      dateKey: row.transactionDate,
    }));

    const fresh: ScrapedPendingRow[] = [];
    let skippedPosted = 0;
    for (const row of payload.rows) {
      if (postedRows.some((postedRow) => pendingMatchesPosted(row, postedRow))) {
        skippedPosted++;
        continue;
      }
      fresh.push(row);
    }

    const removed = await tx
      .delete(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.accountId, account.id),
          scrapeSource,
          eq(financeTransactions.pending, true),
        ),
      )
      .returning({ id: financeTransactions.id });

    if (fresh.length > 0) {
      await tx.insert(financeTransactions).values(
        fresh.map((row) => ({
          userId,
          accountId: account.id,
          transactionDate: row.dateKey,
          postedDate: null,
          pending: true,
          description: row.description,
          amount: centsToNumericString(row.amountCents),
          sourceCategory: row.sourceCategory,
          externalSource: payload.feed,
          externalId: row.externalId,
        })),
      );
    }

    // Capital One's current includes pending, so it is only safe once the table is empty.
    // Chase's current is posted-only, so it is the headline even while pending remains.
    let balanceUpdated = false;
    const applyCurrent =
      payload.currentCents !== undefined &&
      (fresh.length === 0 || payload.feed === CHASE_SCRAPE_FEED);
    if (applyCurrent) {
      const now = new Date();
      const updated = await tx
        .update(bankAccountLinks)
        .set({
          balanceCents: payload.currentCents,
          balanceAsOf: now,
          scrapeBalanceAsOf: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(bankAccountLinks.userId, userId),
            eq(bankAccountLinks.accountId, account.id),
          ),
        )
        .returning({ id: bankAccountLinks.id });
      balanceUpdated = updated.length > 0;
    }

    return {
      accountId: account.id,
      accountName: account.name,
      inserted: fresh.length,
      skippedPosted,
      replaced: removed.length,
      balanceUpdated,
    };
  });
}

/**
 * Clear leftover scrape-pending without a paste. The working figure (posted + those
 * rows) becomes the new current, because that is what the bank is showing once pending
 * is gone and SimpleFIN has not caught up.
 */
export async function clearScrapedPending(
  userId: string,
  todayKey: string,
): Promise<ReplaceScrapedPendingResult> {
  const pending = await db
    .select({
      accountId: financeTransactions.accountId,
      amount: financeTransactions.amount,
      externalSource: financeTransactions.externalSource,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        scrapeSource,
        eq(financeTransactions.pending, true),
      ),
    );
  if (pending.length === 0) {
    throw new Error("There are no scraped pending rows to clear.");
  }

  const accountIds = [...new Set(pending.map((row) => row.accountId))];
  if (accountIds.length !== 1) {
    throw new Error("Scraped pending is on more than one account.");
  }

  const [account] = await db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      externalKey: financeAccounts.externalKey,
    })
    .from(financeAccounts)
    .where(
      and(eq(financeAccounts.id, accountIds[0]), eq(financeAccounts.userId, userId)),
    );
  if (!account) throw new Error("Account not found.");

  const last4 = account.externalKey.replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) {
    throw new Error(
      "The card's last four is missing, so this paste cannot be targeted.",
    );
  }

  const [link] = await db
    .select({ balanceCents: bankAccountLinks.balanceCents })
    .from(bankAccountLinks)
    .where(
      and(
        eq(bankAccountLinks.userId, userId),
        eq(bankAccountLinks.accountId, account.id),
      ),
    );

  const pendingCents = pending.reduce(
    (total, row) => total + (numericStringToCents(row.amount) ?? 0),
    0,
  );
  const currentCents =
    link?.balanceCents !== null && link?.balanceCents !== undefined
      ? link.balanceCents + pendingCents
      : undefined;

  return writeScrapedPending(userId, {
    last4,
    scrapedOn: todayKey,
    rows: [],
    currentCents,
    feed:
      pending[0].externalSource === CHASE_SCRAPE_FEED ? CHASE_SCRAPE_FEED : SCRAPE_FEED,
  });
}

/**
 * Drop scrape-pending rows that now have a posted counterpart on the same account.
 *
 * Called after a SimpleFIN sync. Date is ignored: scrape dates are either the purchase
 * day or the scrape day, and the aggregator dates the authorisation, so a 2-day window
 * is the wrong tool.
 */
export async function resolveScrapedPending(
  userId: string,
  accountIds: readonly string[],
): Promise<number> {
  if (accountIds.length === 0) return 0;

  const pending = await db
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      transactionDate: financeTransactions.transactionDate,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.accountId, [...accountIds]),
        scrapeSource,
        eq(financeTransactions.pending, true),
      ),
    );
  if (pending.length === 0) return 0;

  const posted = await db
    .select({
      accountId: financeTransactions.accountId,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      transactionDate: financeTransactions.transactionDate,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.accountId, [...accountIds]),
        eq(financeTransactions.pending, false),
      ),
    );

  const postedByAccount = new Map<
    string,
    { description: string; amountCents: number; dateKey: string }[]
  >();
  for (const row of posted) {
    const bucket = postedByAccount.get(row.accountId) ?? [];
    bucket.push({
      description: row.description,
      amountCents: numericStringToCents(row.amount) ?? 0,
      dateKey: row.transactionDate,
    });
    postedByAccount.set(row.accountId, bucket);
  }

  const consumed = new Map<string, Set<number>>();
  const toDelete: string[] = [];
  for (const row of pending) {
    const candidates = postedByAccount.get(row.accountId) ?? [];
    const used = consumed.get(row.accountId) ?? new Set<number>();
    const amountCents = numericStringToCents(row.amount) ?? 0;
    const matchAt = candidates.findIndex(
      (candidate, index) =>
        !used.has(index) &&
        pendingMatchesPosted(
          {
            description: row.description,
            amountCents,
            dateKey: row.transactionDate,
          },
          candidate,
        ),
    );
    if (matchAt < 0) continue;
    used.add(matchAt);
    consumed.set(row.accountId, used);
    toDelete.push(row.id);
  }

  if (toDelete.length === 0) return 0;

  const deleted = await db
    .delete(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        scrapeSource,
        eq(financeTransactions.pending, true),
        inArray(financeTransactions.id, toDelete),
      ),
    )
    .returning({ id: financeTransactions.id });
  return deleted.length;
}

/** Pending rarely lasts longer than this; a monthly bill's previous charge is further. */
export const PENDING_MATCH_DAYS = 14;

export function pendingMatchesPosted(
  pending: { description: string; amountCents: number; dateKey?: string },
  posted: { description: string; amountCents: number; dateKey?: string },
): boolean {
  if (pending.amountCents !== posted.amountCents) return false;
  if (
    pending.dateKey &&
    posted.dateKey &&
    daysApart(pending.dateKey, posted.dateKey) > PENDING_MATCH_DAYS
  ) {
    return false;
  }
  const left = normalizeMerchant(pending.description);
  const right = normalizeMerchant(posted.description);
  if (left === "" || right === "") return false;
  return left === right || left.includes(right) || right.includes(left);
}

function daysApart(left: string, right: string): number {
  return (
    Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) /
    86_400_000
  );
}

async function resolveCardByLast4(
  userId: string,
  last4: string,
): Promise<{ id: string; name: string }> {
  const rows = await db
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      kind: financeAccounts.kind,
      externalKey: financeAccounts.externalKey,
      closedAt: financeAccounts.closedAt,
    })
    .from(financeAccounts)
    .where(eq(financeAccounts.userId, userId));

  const matches = rows.filter(
    (row) =>
      row.closedAt === null &&
      row.kind === "credit_card" &&
      row.externalKey.trim().endsWith(last4),
  );
  if (matches.length === 0) {
    throw new Error(`No open credit card ending in ${last4}.`);
  }
  if (matches.length > 1) {
    throw new Error(`More than one credit card ends in ${last4}.`);
  }
  return matches[0];
}
