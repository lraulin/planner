/**
 * Agent writes to individual ledger rows
 * (`agent-os/specs/2026-10-01-1040-mcp-transaction-delete-and-payee-aliases/`).
 */

import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { financeAccounts, financeBudgetCategories } from "@/db/schema";
import { formatUsd, numericStringToCents } from "@/lib/finances/money";
import {
  deleteTransactions,
  TransactionDeleteRefused,
  type DeletedTransaction,
} from "@/lib/finances/mutations";
import { feedLabel } from "@/lib/finances/types";
import type { inputSchemas } from "./contracts";
import { AgentError } from "./errors";

type DeleteArgs = z.output<typeof inputSchemas.delete_transaction>;

/** The `history_source` value a feed writes under. */
function historySourceOf(
  feed: string | null,
): "simplefin" | "bank_page" | "files" | null {
  if (feed === null) return null;
  if (feed === "api:simplefin") return "simplefin";
  if (feed.startsWith("scrape:")) return "bank_page";
  if (feed.startsWith("csv:")) return "files";
  return null;
}

/**
 * Rows carry no tombstone, so a feed that still writes the account can deliver a deleted
 * row again — without the category it had. Say so rather than refuse: deleting a stale twin
 * is exactly the case this tool exists for, and its feed will not resend it.
 */
function reimportWarning(
  row: DeletedTransaction,
  account: { name: string; historySource: string } | undefined,
): string | null {
  if (!account) return null;
  if (historySourceOf(row.externalSource) !== account.historySource) return null;
  const cents = numericStringToCents(row.amount) ?? 0;
  return (
    `${row.description} ${formatUsd(cents)} on ${row.transactionDate}: ` +
    `${feedLabel(row.externalSource)} still writes ${account.name}, so it can bring this row ` +
    "back, uncategorized, if it delivers it again."
  );
}

export async function deleteTransactionTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const input = args as DeleteArgs;
  let result;
  try {
    result = await deleteTransactions(userId, input.ids, {
      auditOrigin: "Agent",
      reason: input.reason,
      requireAll: true,
      dryRun: input.dryRun,
    });
  } catch (error) {
    if (error instanceof TransactionDeleteRefused) {
      throw new AgentError(
        error.reason === "not_found" ? "not_found" : "validation",
        error.message,
      );
    }
    throw error;
  }

  const accountIds = [...new Set(result.deleted.map((row) => row.accountId))];
  const categoryIds = [
    ...new Set(
      result.deleted.flatMap((row) =>
        row.budgetCategoryId ? [row.budgetCategoryId] : [],
      ),
    ),
  ];
  const [accounts, categories] = await Promise.all([
    accountIds.length === 0
      ? []
      : db
          .select({
            id: financeAccounts.id,
            name: financeAccounts.name,
            historySource: financeAccounts.historySource,
          })
          .from(financeAccounts)
          .where(
            and(
              eq(financeAccounts.userId, userId),
              inArray(financeAccounts.id, accountIds),
            ),
          ),
    categoryIds.length === 0
      ? []
      : db
          .select({
            id: financeBudgetCategories.id,
            name: financeBudgetCategories.name,
          })
          .from(financeBudgetCategories)
          .where(
            and(
              eq(financeBudgetCategories.userId, userId),
              inArray(financeBudgetCategories.id, categoryIds),
            ),
          ),
  ]);
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const categoryById = new Map(categories.map((row) => [row.id, row.name]));

  return {
    deleted: !input.dryRun,
    transactions: result.deleted.map((row) => ({
      id: row.id,
      accountName: accountById.get(row.accountId)?.name ?? "",
      transactionDate: row.transactionDate,
      description: row.description,
      amountCents: numericStringToCents(row.amount) ?? 0,
      pending: row.pending,
      source: row.externalSource,
      sourceLabel: feedLabel(row.externalSource),
      category: row.budgetCategoryId
        ? (categoryById.get(row.budgetCategoryId) ?? null)
        : null,
      splitChildren: row.splitChildren.length,
    })),
    readyToAssignDeltaCents: result.readyToAssignDeltaCents,
    auditEventId: result.auditEventId,
    warnings: result.deleted.flatMap((row) => {
      const warning = reimportWarning(row, accountById.get(row.accountId));
      return warning ? [warning] : [];
    }),
  };
}
