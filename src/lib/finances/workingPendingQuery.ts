/**
 * Load the pending rows the working-balance rule is allowed to add on top of a headline.
 *
 * Shared by Dashboard and Budget so they cannot select different pending sets for the same
 * accounts. Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/` D2.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { FinanceExecutor } from "./dbExecutor";
import { financeTransactions } from "@/db/schema";
import { numericStringToCents } from "./money";
import type { PendingRow } from "./workingBalance";
import {
  selectWorkingPending,
  withheldBrowserPendingAccountIds,
  type WorkingPendingAccount,
} from "./workingPending";

export async function loadSelectedWorkingPending(
  userId: string,
  accounts: readonly WorkingPendingAccount[],
  executor: FinanceExecutor = db,
): Promise<PendingRow[]> {
  return (await loadWorkingPendingSelection(userId, accounts, executor)).rows;
}

export type WorkingPendingSelection = {
  /** Pending money that belongs in current financial totals. */
  rows: PendingRow[];
  /** Stale feed rows kept in the Register for sync reconciliation, not Budget money. */
  supersededTransactionIds: string[];
  /** Accounts whose expired browser capture still holds pending rows out of the money. */
  withheldBrowserPendingAccountIds: string[];
};

/**
 * Load both halves of the pending decision once.
 *
 * The Register intentionally retains stale SimpleFIN pending while a bank scrape is
 * authoritative. Money readers must exclude those retained rows or the same purchase lands in
 * both envelope activity and the live account position. Returning the rejected transaction ids
 * alongside the selected money lets aggregate SQL use exactly the same decision as the account
 * pool instead of reimplementing the source preference.
 */
export async function loadWorkingPendingSelection(
  userId: string,
  accounts: readonly WorkingPendingAccount[],
  executor: FinanceExecutor = db,
): Promise<WorkingPendingSelection> {
  const pendingRows = await executor
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      amount: financeTransactions.amount,
      source: financeTransactions.externalSource,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.pending, true),
      ),
    );

  const candidates = pendingRows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    amountCents: numericStringToCents(row.amount) ?? 0,
    source: row.source ?? "",
  }));
  const selected = selectWorkingPending(candidates, accounts);
  const selectedIds = new Set(selected.map((row) => row.id));

  return {
    rows: selected.map((row) => ({
      accountId: row.accountId,
      amountCents: row.amountCents,
    })),
    supersededTransactionIds: candidates
      .filter((row) => !selectedIds.has(row.id))
      .map((row) => row.id),
    withheldBrowserPendingAccountIds: withheldBrowserPendingAccountIds(
      candidates,
      accounts,
    ),
  };
}
