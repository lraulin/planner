"use server";

import {
  clearScrapedPending,
  replaceScrapedPending,
  type ReplaceScrapedPendingResult,
} from "@/lib/finances/scrapePending";
import {
  addMatchersToCommitment,
  deleteAccount,
  deleteCommitment,
  deleteRecurringBill,
  deleteRecurringSpend,
  deleteTransaction,
  reclassifyTransactions,
  renameRecurringBill,
  renameRecurringSpend,
  setOneOff,
  setSubscriptionStatus,
  updateAccount,
  updateTransaction,
  upsertRecurringBill,
  upsertRecurringSpend,
  type AccountEdit,
  type RecurringBillEdit,
  type RecurringSpendEdit,
  type ReclassifySummary,
  type TransactionEdit,
} from "@/lib/finances/mutations";
import {
  autoMapBudgetCategories,
  createBudgetCategory,
  createCategoryGroup,
  deleteBudgetCategory,
  deleteCategoryGroup,
  performBudgetOperation,
  renameCategoryGroup,
  seedBudget,
  setCarryover,
  setTransactionBudgetCategory,
  updateBudgetCategory,
  type BudgetCategoryEdit,
  type BudgetOperation,
  type SeedResult,
} from "@/lib/finances/budget/mutations";
import type { BudgetPreset } from "@/lib/finances/budget/presets";
import type { CommitmentStatus } from "@/db/schema";
import { getTransaction, listAccounts, listTransactions } from "@/lib/finances/queries";
import type {
  FinanceAccountRow,
  TransactionFilter,
  TransactionListRow,
} from "@/lib/finances/types";
import {
  run,
  runQuery,
  runWithData,
  type ActionResult,
  type DataActionResult,
  type QueryResult,
} from "../actionResult";

export async function updateTransactionAction(
  transactionId: string,
  edit: TransactionEdit,
): Promise<ActionResult> {
  return run((userId) => updateTransaction(userId, transactionId, edit));
}

export async function deleteTransactionAction(
  transactionId: string,
): Promise<ActionResult> {
  return run((userId) => deleteTransaction(userId, transactionId));
}

export async function updateAccountAction(
  accountId: string,
  edit: AccountEdit,
): Promise<ActionResult> {
  return run((userId) => updateAccount(userId, accountId, edit));
}

export async function deleteAccountAction(accountId: string): Promise<ActionResult> {
  return run((userId) => deleteAccount(userId, accountId));
}

export async function listTransactionsAction(
  filter?: TransactionFilter,
): Promise<QueryResult<TransactionListRow[]>> {
  return runQuery((userId) => listTransactions(userId, filter));
}

export async function listAccountsAction(): Promise<QueryResult<FinanceAccountRow[]>> {
  return runQuery(listAccounts);
}

export async function reclassifyAction(): Promise<DataActionResult<ReclassifySummary>> {
  return runWithData(reclassifyTransactions);
}

export async function setOneOffAction(
  transactionIds: readonly string[],
  edit: { excludeFromBaseline: boolean; eventLabel?: string },
): Promise<ActionResult> {
  return run((userId) => setOneOff(userId, transactionIds, edit));
}

export async function setRecurringBillAction(
  edit: RecurringBillEdit,
): Promise<ActionResult> {
  return run((userId) => upsertRecurringBill(userId, edit));
}

export async function deleteRecurringBillAction(
  merchant: string,
): Promise<ActionResult> {
  return run((userId) => deleteRecurringBill(userId, merchant));
}

export async function setRecurringSpendAction(
  edit: RecurringSpendEdit,
): Promise<ActionResult> {
  return run((userId) => upsertRecurringSpend(userId, edit));
}

/** Fold another bank spelling into a commitment that already exists, on either tier. */
export async function addCommitmentMatchersAction(input: {
  kind: "bill" | "spend";
  name: string;
  matchers: readonly string[];
}): Promise<ActionResult> {
  return run((userId) => addMatchersToCommitment(userId, input));
}

export async function deleteRecurringSpendAction(name: string): Promise<ActionResult> {
  return run((userId) => deleteRecurringSpend(userId, name));
}

export async function renameRecurringBillAction(
  from: string,
  to: string,
): Promise<ActionResult> {
  return run((userId) => renameRecurringBill(userId, from, to));
}

export async function renameRecurringSpendAction(
  from: string,
  to: string,
): Promise<ActionResult> {
  return run((userId) => renameRecurringSpend(userId, from, to));
}

export async function setSubscriptionStatusAction(
  name: string,
  status: CommitmentStatus,
  options: { reanchorOn?: string; cancelledOn?: string | null } = {},
): Promise<ActionResult> {
  return run((userId) => setSubscriptionStatus(userId, name, status, options));
}

export async function deleteCommitmentAction(target: {
  kind: "bill" | "spend";
  name: string;
}): Promise<ActionResult> {
  return run((userId) => deleteCommitment(userId, target));
}

export async function pasteScrapedPendingAction(
  text: string,
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData((userId) => replaceScrapedPending(userId, text, todayKey));
}

export async function clearScrapedPendingAction(
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData((userId) => clearScrapedPending(userId, todayKey));
}

export async function getTransactionAction(
  transactionId: string,
): Promise<QueryResult<TransactionListRow | null>> {
  return runQuery((userId) => getTransaction(userId, transactionId));
}

// ─────────────────────────── Envelope budget ───────────────────────────

export async function seedBudgetAction(
  preset: BudgetPreset,
  todayKey: string,
): Promise<DataActionResult<SeedResult>> {
  return runWithData(async (userId) => {
    const result = await seedBudget(userId, { preset, todayKey });
    // Setup is only finished when the grid has numbers in it, so the two run together
    // rather than leaving the user on an empty budget wondering what to do next.
    await autoMapBudgetCategories(userId, result.startMonth);
    return result;
  });
}

export async function autoMapBudgetAction(
  since: string,
): Promise<DataActionResult<{ placed: number; remaining: number }>> {
  return runWithData((userId) => autoMapBudgetCategories(userId, since));
}

export async function budgetOperationAction(
  operation: BudgetOperation,
): Promise<ActionResult> {
  return run((userId) => performBudgetOperation(userId, operation));
}

export async function setCarryoverAction(
  month: string,
  categoryId: string,
  carryover: boolean,
): Promise<ActionResult> {
  return run((userId) => setCarryover(userId, { month, categoryId, carryover }));
}

export async function createCategoryGroupAction(
  name: string,
  isIncome: boolean,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createCategoryGroup(userId, { name, isIncome }));
}

export async function renameCategoryGroupAction(
  groupId: string,
  name: string,
): Promise<ActionResult> {
  return run((userId) => renameCategoryGroup(userId, groupId, name));
}

export async function deleteCategoryGroupAction(
  groupId: string,
): Promise<ActionResult> {
  return run((userId) => deleteCategoryGroup(userId, groupId));
}

export async function createBudgetCategoryAction(
  groupId: string,
  name: string,
): Promise<DataActionResult<string>> {
  return runWithData((userId) => createBudgetCategory(userId, { groupId, name }));
}

export async function updateBudgetCategoryAction(
  categoryId: string,
  edit: BudgetCategoryEdit,
): Promise<ActionResult> {
  return run((userId) => updateBudgetCategory(userId, categoryId, edit));
}

export async function deleteBudgetCategoryAction(
  categoryId: string,
): Promise<ActionResult> {
  return run((userId) => deleteBudgetCategory(userId, categoryId));
}

export async function setTransactionBudgetCategoryAction(
  transactionId: string,
  categoryId: string | null,
): Promise<ActionResult> {
  return run((userId) =>
    setTransactionBudgetCategory(userId, transactionId, categoryId),
  );
}
