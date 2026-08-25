/**
 * A payee claim is "this merchant's charges belong to this envelope."
 *
 * Track as bill, New bill…, Review, the payee picker, and the agent tool all end here.
 * Filing charges lives in this one place so those names cannot drift apart
 * (`agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D3).
 */

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financePayees, financeTransactions } from "@/db/schema";
import type { MonthKey } from "../budget/envelope";
import { categoryForNewTransaction } from "./autoCategory";
import type { AutoCategoryMode } from "./autoCategory";

/**
 * File claimed payees' on-budget charges into the envelope that claims them.
 *
 * Omitting `uncategorizedOnly` rewrites matching history — what Track as bill means by
 * "this payee." `uncategorizedOnly` is the ingest path: new rows only, never a later
 * manual correction. Off-budget accounts and internal transfers are never filed.
 */
export async function applyPayeeClaims(
  userId: string,
  options: {
    since?: MonthKey;
    createdSince?: Date;
    payeeIds?: readonly string[];
    uncategorizedOnly?: boolean;
  } = {},
): Promise<{ moved: number }> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      categoryId: financePayees.claimedBudgetCategoryId,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
        sql`${financeTransactions.derivedFlow} is distinct from 'internal_transfer'`,
        sql`${financePayees.claimedBudgetCategoryId} is not null`,
        sql`${financeTransactions.budgetCategoryId} is distinct from ${financePayees.claimedBudgetCategoryId}`,
        ...(options.uncategorizedOnly
          ? [isNull(financeTransactions.budgetCategoryId)]
          : []),
        ...(options.since
          ? [gte(financeTransactions.transactionDate, options.since)]
          : []),
        ...(options.createdSince
          ? [gte(financeTransactions.createdAt, options.createdSince)]
          : []),
        ...(options.payeeIds && options.payeeIds.length > 0
          ? [inArray(financePayees.id, [...options.payeeIds])]
          : []),
      ),
    );
  if (rows.length === 0) return { moved: 0 };

  const byCategory = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.categoryId) continue;
    const bucket = byCategory.get(row.categoryId) ?? [];
    bucket.push(row.id);
    byCategory.set(row.categoryId, bucket);
  }

  let moved = 0;
  await db.transaction(async (tx) => {
    for (const [categoryId, ids] of byCategory) {
      await tx
        .update(financeTransactions)
        .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, ids),
          ),
        );
      moved += ids.length;
    }
  });

  return { moved };
}

/**
 * After a claim is stored: file every on-budget eligible charge of those payees,
 * including history. Later manual corrections after this write stay put.
 */
export async function applyClaimedPayees(
  userId: string,
  _envelopeId: string,
  payeeIds: readonly string[],
): Promise<void> {
  if (payeeIds.length === 0) return;
  await applyPayeeClaims(userId, { payeeIds });
}

/**
 * Fill uncategorised eligible rows from claim, then from the payee's learned/fixed default.
 *
 * Never rewrites a Category that is already set.
 */
export async function applyPayeeAutoCategories(
  userId: string,
  options: { createdSince?: Date; payeeIds?: readonly string[] } = {},
): Promise<number> {
  const claimed = await applyPayeeClaims(userId, {
    ...options,
    uncategorizedOnly: true,
  });

  const rows = await db
    .select({
      id: financeTransactions.id,
      claimedBudgetCategoryId: financePayees.claimedBudgetCategoryId,
      defaultBudgetCategoryId: financePayees.defaultBudgetCategoryId,
      autoCategoryMode: financePayees.autoCategoryMode,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
        isNull(financeTransactions.budgetCategoryId),
        sql`${financeTransactions.derivedFlow} is distinct from 'internal_transfer'`,
        ...(options.createdSince
          ? [gte(financeTransactions.createdAt, options.createdSince)]
          : []),
        ...(options.payeeIds && options.payeeIds.length > 0
          ? [inArray(financePayees.id, [...options.payeeIds])]
          : []),
      ),
    );

  const byCategory = new Map<string, string[]>();
  for (const row of rows) {
    const categoryId = categoryForNewTransaction({
      claimedBudgetCategoryId: row.claimedBudgetCategoryId,
      defaultBudgetCategoryId: row.defaultBudgetCategoryId,
      autoCategoryMode: row.autoCategoryMode as AutoCategoryMode,
    });
    if (!categoryId) continue;
    const bucket = byCategory.get(categoryId) ?? [];
    bucket.push(row.id);
    byCategory.set(categoryId, bucket);
  }

  let filled = claimed.moved;
  if (byCategory.size === 0) return filled;

  await db.transaction(async (tx) => {
    for (const [categoryId, ids] of byCategory) {
      await tx
        .update(financeTransactions)
        .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, ids),
          ),
        );
      filled += ids.length;
    }
  });

  return filled;
}
