/**
 * Persist a YNAB-style learned default from eligible Category history.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financePayees, financeTransactions } from "@/db/schema";
import { effectiveFlow } from "../analytics";
import { categoryAssignableIds } from "../categoryEligibility";
import { numericStringToCents } from "../money";
import {
  inferredDefault,
  nextLearnedDefault,
  type AutoCategoryMode,
  type CategoryChoice,
} from "./autoCategory";

async function latestEligibleChoices(
  userId: string,
  payeeId: string,
): Promise<CategoryChoice[]> {
  const rows = await db
    .select({
      id: financeTransactions.id,
      categoryId: financeTransactions.budgetCategoryId,
      accountId: financeTransactions.accountId,
      accountOffBudget: financeAccounts.offBudget,
      transactionDate: financeTransactions.transactionDate,
      transferGroupId: financeTransactions.transferGroupId,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      amount: financeTransactions.amount,
      createdAt: financeTransactions.createdAt,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.payeeId, payeeId),
        eq(financeAccounts.userId, userId),
      ),
    )
    .orderBy(
      desc(financeTransactions.transactionDate),
      desc(financeTransactions.createdAt),
      desc(financeTransactions.id),
    );

  const assignable = categoryAssignableIds(
    rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      transferGroupId: row.transferGroupId,
      effectiveFlow: effectiveFlow({
        derivedFlow: row.derivedFlow,
        flowOverride: row.flowOverride,
        amountCents: numericStringToCents(row.amount) ?? 0,
      }),
    })),
    new Set(rows.flatMap((row) => (row.accountOffBudget ? [row.accountId] : []))),
  );

  return rows
    .filter((row) => assignable.has(row.id))
    .map((row) => ({ id: row.id, categoryId: row.categoryId }));
}

async function loadPayeeAutoCategory(userId: string, payeeId: string) {
  const [payee] = await db
    .select({
      claimedBudgetCategoryId: financePayees.claimedBudgetCategoryId,
      defaultBudgetCategoryId: financePayees.defaultBudgetCategoryId,
      autoCategoryMode: financePayees.autoCategoryMode,
    })
    .from(financePayees)
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)))
    .limit(1);
  if (!payee) return null;
  return {
    claimedBudgetCategoryId: payee.claimedBudgetCategoryId,
    defaultBudgetCategoryId: payee.defaultBudgetCategoryId,
    autoCategoryMode: payee.autoCategoryMode as AutoCategoryMode,
  };
}

/** After a manual Category edit: maybe update the learned default. */
export async function learnFromCategoryEdit(
  userId: string,
  payeeId: string,
  editedId: string,
): Promise<string | void> {
  const payee = await loadPayeeAutoCategory(userId, payeeId);
  if (!payee) return;
  const latest = await latestEligibleChoices(userId, payeeId);
  const next = nextLearnedDefault(payee, editedId, latest);
  if (next === payee.defaultBudgetCategoryId) return;
  await db
    .update(financePayees)
    .set({ defaultBudgetCategoryId: next, updatedAt: new Date() })
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
}

/** After a merge into a learning-mode target, recompute from the combined history. */
export async function relearnPayeeDefault(
  userId: string,
  payeeId: string,
): Promise<void> {
  const payee = await loadPayeeAutoCategory(userId, payeeId);
  if (!payee || payee.autoCategoryMode !== "learn" || payee.claimedBudgetCategoryId) {
    return;
  }
  const latest = await latestEligibleChoices(userId, payeeId);
  const next = inferredDefault(latest);
  if (next === payee.defaultBudgetCategoryId) return;
  await db
    .update(financePayees)
    .set({ defaultBudgetCategoryId: next, updatedAt: new Date() })
    .where(and(eq(financePayees.userId, userId), eq(financePayees.id, payeeId)));
}
