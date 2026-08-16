"use server";

import {
  replaceScrapedPending,
  type ReplaceScrapedPendingResult,
} from "@/lib/finances/scrapePending";
import {
  deleteAccount,
  deleteRecurringBill,
  deleteTransaction,
  reclassifyTransactions,
  setOneOff,
  updateAccount,
  updateTransaction,
  upsertRecurringBill,
  type AccountEdit,
  type RecurringBillEdit,
  type ReclassifySummary,
  type TransactionEdit,
} from "@/lib/finances/mutations";
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

export async function pasteScrapedPendingAction(
  text: string,
  todayKey: string,
): Promise<DataActionResult<ReplaceScrapedPendingResult>> {
  return runWithData((userId) => replaceScrapedPending(userId, text, todayKey));
}

export async function getTransactionAction(
  transactionId: string,
): Promise<QueryResult<TransactionListRow | null>> {
  return runQuery((userId) => getTransaction(userId, transactionId));
}
