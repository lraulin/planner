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
import { refusedBillClaims } from "./billClaimGate";
import { numericStringToCents } from "../money";
import type { FinanceExecutor } from "../dbExecutor";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import { writeFinanceAuditEvent } from "../audit/writes";
import { monthKeyOf } from "../budget/envelope";

/**
 * File claimed payees' on-budget charges into the envelope that claims them.
 *
 * Omitting `uncategorizedOnly` rewrites matching history — what Track as bill means by
 * "this payee." `uncategorizedOnly` is the ingest path: new rows only, never a later
 * manual correction. Off-budget accounts and internal transfers are never filed.
 *
 * A claim on a **bill** envelope files only that bill's own charge — the amount and cadence
 * it declares (`billClaimMatch.ts`). A claim on any other envelope still means every charge.
 */
export async function applyPayeeClaims(
  userId: string,
  options: {
    since?: MonthKey;
    createdSince?: Date;
    payeeIds?: readonly string[];
    uncategorizedOnly?: boolean;
  } = {},
  executor?: FinanceExecutor,
): Promise<{ moved: number }> {
  if (!executor) {
    return db.transaction((tx) => applyPayeeClaims(userId, options, tx));
  }

  const rows = await executor
    .select({
      id: financeTransactions.id,
      categoryId: financePayees.claimedBudgetCategoryId,
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
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

  const refused = await refusedBillClaims(
    executor,
    userId,
    rows.flatMap((row) =>
      row.categoryId
        ? [
            {
              id: row.id,
              transactionDate: row.transactionDate,
              amountCents: numericStringToCents(row.amount) ?? 0,
              claimedBudgetCategoryId: row.categoryId,
            },
          ]
        : [],
    ),
  );

  const byCategory = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.categoryId || refused.has(row.id)) continue;
    const bucket = byCategory.get(row.categoryId) ?? [];
    bucket.push(row.id);
    byCategory.set(row.categoryId, bucket);
  }

  let moved = 0;
  for (const [categoryId, ids] of byCategory) {
    await executor
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

  return { moved };
}

/**
 * After a claim is stored: file every on-budget eligible charge of those payees,
 * including history. Later manual corrections after this write stay put.
 */
export async function applyClaimedPayees(
  userId: string,
  envelopeId: string,
  payeeIds: readonly string[],
): Promise<void> {
  if (payeeIds.length === 0) return;
  await db.transaction(async (tx) => {
    const candidates = await tx
      .select({
        id: financeTransactions.id,
        accountId: financeTransactions.accountId,
        transactionDate: financeTransactions.transactionDate,
        budgetCategoryId: financeTransactions.budgetCategoryId,
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
          inArray(financePayees.id, [...payeeIds]),
        ),
      );
    if (candidates.length === 0) return;

    const scope = {
      accountIds: [...new Set(candidates.map((row) => row.accountId))],
      budgetMonths: [
        ...new Set(candidates.map((row) => monthKeyOf(row.transactionDate))),
      ],
      envelopeIds: [
        ...new Set([
          envelopeId,
          ...candidates.flatMap((row) =>
            row.budgetCategoryId ? [row.budgetCategoryId] : [],
          ),
        ]),
      ],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await applyPayeeClaims(userId, { payeeIds }, tx);
    const afterRows = await tx
      .select({
        id: financeTransactions.id,
        budgetCategoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          inArray(
            financeTransactions.id,
            candidates.map((row) => row.id),
          ),
        ),
      );
    const beforeById = new Map(candidates.map((row) => [row.id, row]));
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_classification",
      origin: "Payee claim",
      summary: `Filed ${afterRows.length} transaction${afterRows.length === 1 ? "" : "s"} from a payee claim.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: afterRows.map((row) => ({
        entityType: "transaction",
        entityIdentity: row.id,
        before: {
          budgetCategoryId: beforeById.get(row.id)?.budgetCategoryId ?? null,
        },
        after: { budgetCategoryId: row.budgetCategoryId },
      })),
    });
  });
}

/**
 * Fill uncategorised eligible rows from claim, then from the payee's learned/fixed default.
 *
 * Never rewrites a Category that is already set.
 */
export async function applyPayeeAutoCategories(
  userId: string,
  options: {
    createdSince?: Date;
    payeeIds?: readonly string[];
    auditBatchId?: string;
    auditOrigin?: string;
  } = {},
): Promise<number> {
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({
        id: financeTransactions.id,
        accountId: financeTransactions.accountId,
        transactionDate: financeTransactions.transactionDate,
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
    const scope = {
      accountIds: [...new Set(candidates.map((row) => row.accountId))],
      budgetMonths: [
        ...new Set(candidates.map((row) => monthKeyOf(row.transactionDate))),
      ],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const claimed = await applyPayeeClaims(
      userId,
      {
        createdSince: options.createdSince,
        payeeIds: options.payeeIds,
        uncategorizedOnly: true,
      },
      tx,
    );

    const rows = await tx
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
      // Anything still uncategorised here has already been offered to its claim by the call
      // above, so a claim that survives to this point is one a bill refused: the row falls
      // through to the payee's own default rather than being filed by the claim again.
      const categoryId = categoryForNewTransaction(
        {
          claimedBudgetCategoryId: row.claimedBudgetCategoryId,
          defaultBudgetCategoryId: row.defaultBudgetCategoryId,
          autoCategoryMode: row.autoCategoryMode as AutoCategoryMode,
        },
        { claimApplies: false },
      );
      if (!categoryId) continue;
      const bucket = byCategory.get(categoryId) ?? [];
      bucket.push(row.id);
      byCategory.set(categoryId, bucket);
    }

    let filled = claimed.moved;
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
    const afterRows =
      candidates.length === 0
        ? []
        : await tx
            .select({
              id: financeTransactions.id,
              budgetCategoryId: financeTransactions.budgetCategoryId,
            })
            .from(financeTransactions)
            .where(
              and(
                eq(financeTransactions.userId, userId),
                inArray(
                  financeTransactions.id,
                  candidates.map((row) => row.id),
                ),
              ),
            );
    const changed = afterRows.filter((row) => row.budgetCategoryId !== null);
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_classification",
      origin: options.auditOrigin ?? "Automatic filing",
      batchId: options.auditBatchId,
      summary: `Automatically filed ${changed.length} transaction${changed.length === 1 ? "" : "s"}.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: changed.map((row) => ({
        entityType: "transaction",
        entityIdentity: row.id,
        before: { budgetCategoryId: null },
        after: { budgetCategoryId: row.budgetCategoryId },
      })),
    });

    return filled;
  });
}
