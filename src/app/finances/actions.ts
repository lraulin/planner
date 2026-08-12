"use server";

import {
  deleteAccount,
  deleteTransaction,
  updateAccount,
  updateTransaction,
  type AccountEdit,
  type TransactionEdit,
} from "@/lib/finances/mutations";
import { getTransaction, listAccounts, listTransactions } from "@/lib/finances/queries";
import type {
  FinanceAccountRow,
  TransactionFilter,
  TransactionListRow,
} from "@/lib/finances/types";
import { run, runQuery, type ActionResult, type QueryResult } from "../actionResult";

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

export async function getTransactionAction(
  transactionId: string,
): Promise<QueryResult<TransactionListRow | null>> {
  return runQuery((userId) => getTransaction(userId, transactionId));
}
