/**
 * The database half of the feed handover — see `feedHandover.ts` for why it exists.
 *
 * Called from inside the transaction that advances an account's watermark (a SimpleFIN
 * sync, a CSV or statement import), never on its own: the browser rows must stop existing
 * in the same commit that makes the feed rows authoritative, or a crash between the two
 * leaves the register holding the same money twice.
 */

import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { financeTransactions } from "@/db/schema";
import type { FinanceAuditChange } from "./audit/types";
import type { FinanceExecutor } from "./dbExecutor";
import { feedWatermarkForAccount } from "./feedWatermark";
import {
  planFeedHandover,
  type ReplacementRow,
  type RetiringRow,
} from "./feedHandover";
import { DATE_TOLERANCE_DAYS } from "./liveFeedMatch";
import { numericStringToCents } from "./money";
import { bankRows } from "./splitRows";

export type FeedHandoverResult = {
  /** Browser rows deleted because the feed now covers their day. */
  retired: number;
  /** Retired rows whose envelope, notes or split moved onto the replacing feed row. */
  carried: number;
  warnings: string[];
  changes: FinanceAuditChange[];
};

const EMPTY: FeedHandoverResult = {
  retired: 0,
  carried: 0,
  warnings: [],
  changes: [],
};

function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Retire every `scrape:*` row on this account that the feed watermark now covers.
 *
 * Returns the audit changes rather than writing its own event, so the handover and the
 * write that caused it appear as one thing that happened.
 */
export async function retireCoveredScrapeRows(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
): Promise<FeedHandoverResult> {
  const watermark = await feedWatermarkForAccount(executor, userId, accountId);
  if (watermark === null) return EMPTY;

  const stored = await executor
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      pending: financeTransactions.pending,
      isParent: financeTransactions.isParent,
      externalSource: financeTransactions.externalSource,
      externalId: financeTransactions.externalId,
      budgetCategoryId: financeTransactions.budgetCategoryId,
      notes: financeTransactions.notes,
      flowOverride: financeTransactions.flowOverride,
      excludeFromBaseline: financeTransactions.excludeFromBaseline,
      eventLabel: financeTransactions.eventLabel,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        bankRows,
        inArray(financeTransactions.externalSource, [
          "scrape:capitalone",
          "scrape:chase",
        ]),
        // A pending browser hold whose day the feed has posted is covered too: the feed's
        // posted row is the settled truth for that charge.
        lte(
          sql`coalesce(${financeTransactions.postedDate}, ${financeTransactions.transactionDate})`,
          watermark,
        ),
      ),
    );
  if (stored.length === 0) return EMPTY;

  const retiring: RetiringRow[] = stored.map((row) => ({
    id: row.id,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    description: row.description,
    isParent: row.isParent,
    budgetCategoryId: row.budgetCategoryId,
    notes: row.notes,
    flowOverride: row.flowOverride,
    excludeFromBaseline: row.excludeFromBaseline,
    eventLabel: row.eventLabel,
  }));

  const dates = retiring.flatMap((row) => [
    row.transactionDate,
    ...(row.postedDate ? [row.postedDate] : []),
  ]);
  const from = shiftDateKey(
    dates.reduce((min, key) => (key < min ? key : min)),
    -DATE_TOLERANCE_DAYS,
  );
  const to = shiftDateKey(
    dates.reduce((max, key) => (key > max ? key : max)),
    DATE_TOLERANCE_DAYS,
  );

  const candidates = await executor
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      amount: financeTransactions.amount,
      isParent: financeTransactions.isParent,
      budgetCategoryId: financeTransactions.budgetCategoryId,
      notes: financeTransactions.notes,
      flowOverride: financeTransactions.flowOverride,
      excludeFromBaseline: financeTransactions.excludeFromBaseline,
      eventLabel: financeTransactions.eventLabel,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        bankRows,
        sql`${financeTransactions.externalSource} is not null`,
        sql`${financeTransactions.externalSource} not in ('scrape:capitalone', 'scrape:chase')`,
        // Either axis may fall in the window: the two feeds date one charge differently,
        // which is exactly why the browser copy has to be retired rather than matched.
        or(
          and(
            gte(financeTransactions.transactionDate, from),
            lte(financeTransactions.transactionDate, to),
          ),
          and(
            gte(financeTransactions.postedDate, from),
            lte(financeTransactions.postedDate, to),
          ),
        ),
      ),
    );

  const replacements: ReplacementRow[] = candidates.map((row) => ({
    id: row.id,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    isParent: row.isParent,
    budgetCategoryId: row.budgetCategoryId,
    notes: row.notes,
    flowOverride: row.flowOverride,
    excludeFromBaseline: row.excludeFromBaseline,
    eventLabel: row.eventLabel,
  }));

  const plan = planFeedHandover(retiring, replacements);
  const storedById = new Map(stored.map((row) => [row.id, row]));
  const changes: FinanceAuditChange[] = [];
  let carried = 0;

  for (const step of plan.steps) {
    const hasCarry = Object.keys(step.carry).length > 0;
    if (step.replacementId && (hasCarry || step.moveSplitTo)) {
      if (step.moveSplitTo) {
        const moved = await executor
          .update(financeTransactions)
          .set({ parentId: step.moveSplitTo, updatedAt: new Date() })
          .where(
            and(
              eq(financeTransactions.userId, userId),
              eq(financeTransactions.parentId, step.retiredId),
            ),
          )
          .returning({ id: financeTransactions.id });
        if (moved.length === 0) {
          throw new Error("A split parent lost its children during the feed handover.");
        }
      }
      const updated = await executor
        .update(financeTransactions)
        .set({
          ...step.carry,
          ...(step.moveSplitTo ? { isParent: true, budgetCategoryId: null } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.id, step.replacementId),
          ),
        )
        .returning({ id: financeTransactions.id });
      if (updated.length === 0) throw new Error("Handover target not found.");
      carried += 1;
      changes.push({
        entityType: "transaction",
        entityIdentity: step.replacementId,
        before: { carriedFrom: null },
        after: {
          carriedFrom: step.retiredId,
          ...step.carry,
          ...(step.moveSplitTo ? { isParent: true } : {}),
        },
      });
    }
    const before = storedById.get(step.retiredId);
    changes.push({
      entityType: "transaction",
      entityIdentity: step.retiredId,
      before: before
        ? {
            transactionDate: before.transactionDate,
            postedDate: before.postedDate,
            amountCents: numericStringToCents(before.amount) ?? 0,
            pending: before.pending,
            externalSource: before.externalSource,
            externalId: before.externalId,
            budgetCategoryId: before.budgetCategoryId,
          }
        : null,
      after: null,
    });
  }

  const deleted = await executor
    .delete(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        isNull(financeTransactions.parentId),
        inArray(
          financeTransactions.id,
          plan.steps.map((step) => step.retiredId),
        ),
      ),
    )
    .returning({ id: financeTransactions.id });

  return {
    retired: deleted.length,
    carried,
    warnings: plan.warnings,
    changes,
  };
}

/** Retire the covered browser tail on several accounts, folding the results together. */
export async function retireCoveredScrapeRowsForAccounts(
  executor: FinanceExecutor,
  userId: string,
  accountIds: readonly string[],
): Promise<FeedHandoverResult> {
  let result = EMPTY;
  for (const accountId of [...new Set(accountIds)]) {
    const one = await retireCoveredScrapeRows(executor, userId, accountId);
    result = {
      retired: result.retired + one.retired,
      carried: result.carried + one.carried,
      warnings: [...result.warnings, ...one.warnings],
      changes: [...result.changes, ...one.changes],
    };
  }
  return result;
}
