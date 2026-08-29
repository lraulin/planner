/**
 * Which feed owns which days.
 *
 * Two feeds describe this card: SimpleFIN (and the CSV/statement downloads) publish the
 * bank's **raw descriptor**, and the card's own web page publishes a **cleaned merchant
 * name**. Neither is derivable from the other — Capital One's expanded detail for
 * `PIZZA HUT 036874` says "Pizza Hut" and a street address, and the store number appears
 * nowhere in the DOM. So a matcher built on comparing the two descriptions is a heuristic
 * pretending to be an identity, and when it misses it creates a second copy of real money.
 *
 * The fix is to stop asking. The workflow already alternates the sources deliberately —
 * sync SimpleFIN, run the userscripts to reach the present, sync again — and that
 * alternation *is* a watermark. Per account, the **feed watermark** is the latest posted
 * day any non-browser feed holds. That feed owns everything at or before it; the browser
 * snapshot owns everything after it. An account with no feed rows has no watermark, and the
 * snapshot owns everything.
 *
 * The direction of error is chosen: a row this rule skips is **missing**, and shows up in
 * the Dashboard's comparison against the bank's own current balance and on the next sync. A
 * row it double-counts moves budget numbers and is caught by nobody.
 *
 * Spec: `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` D1, D2.
 */

import { and, eq, sql } from "drizzle-orm";
import { financeTransactions } from "@/db/schema";
import { isScrapeFeed } from "./bankSnapshot";
import type { FinanceExecutor } from "./dbExecutor";
import { bankRows } from "./splitRows";

/** The two date axes a stored or incoming row can be dated on. */
export type OwnershipDatedRow = { transactionDate: string; postedDate: string | null };

export type WatermarkCandidate = OwnershipDatedRow & {
  externalSource: string | null;
  pending: boolean;
};

/**
 * The day ownership is decided on: the bank's posting day where the source distinguishes
 * one, otherwise its only date.
 *
 * Both sides use the same axis on purpose. A watermark taken on posted dates and compared
 * against purchase dates would hand the browser rows SimpleFIN had already delivered.
 */
export function ownershipDateKey(row: OwnershipDatedRow): string {
  return row.postedDate ?? row.transactionDate;
}

/** True for the feeds that own history: SimpleFIN and every file download. */
export function isHistoryFeed(externalSource: string | null): boolean {
  return (
    externalSource !== null && externalSource !== "" && !isScrapeFeed(externalSource)
  );
}

/**
 * The latest posted day a non-browser feed holds, or null when it holds nothing.
 *
 * Pending rows are excluded deliberately: a hold is not a delivered day, and letting one
 * advance the watermark would suppress the browser rows for a day SimpleFIN has not
 * actually posted yet.
 */
export function feedWatermarkOf(rows: readonly WatermarkCandidate[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.pending || !isHistoryFeed(row.externalSource)) continue;
    const key = ownershipDateKey(row);
    if (latest === null || key > latest) latest = key;
  }
  return latest;
}

/** Is this row the other feed's to supply? */
export function coveredByFeed(
  row: OwnershipDatedRow,
  watermark: string | null,
): boolean {
  return watermark !== null && ownershipDateKey(row) <= watermark;
}

/** Split incoming rows into the ones the browser owns and the ones the feed covers. */
export function splitByWatermark<T extends OwnershipDatedRow>(
  rows: readonly T[],
  watermark: string | null,
): { owned: T[]; covered: T[] } {
  const owned: T[] = [];
  const covered: T[] = [];
  for (const row of rows) (coveredByFeed(row, watermark) ? covered : owned).push(row);
  return { owned, covered };
}

/** The stored feed watermark for one account. */
export async function feedWatermarkForAccount(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
): Promise<string | null> {
  const [row] = await executor
    .select({
      watermark: sql<
        string | null
      >`max(coalesce(${financeTransactions.postedDate}, ${financeTransactions.transactionDate}))`,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        bankRows,
        eq(financeTransactions.pending, false),
        sql`${financeTransactions.externalSource} is not null`,
        sql`${financeTransactions.externalSource} <> ''`,
        sql`${financeTransactions.externalSource} not in ('scrape:capitalone', 'scrape:chase')`,
      ),
    );
  return row?.watermark ?? null;
}
