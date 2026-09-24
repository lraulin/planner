/**
 * Load the pending rows the working-balance rule is allowed to add on top of a headline.
 *
 * Shared by Dashboard and Budget so they cannot select different pending sets for the same
 * accounts. Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/` D2.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import type { FinanceExecutor } from "./dbExecutor";
import { financeTransactions } from "@/db/schema";
import { numericStringToCents } from "./money";
import type { PendingRow } from "./workingBalance";
import { selectWorkingPending, type WorkingPendingAccount } from "./workingPending";

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
  /** The other source's holds, kept in the Register but not Budget money. */
  supersededTransactionIds: string[];
};

/**
 * Load both halves of the pending decision once.
 *
 * The Register can still hold the other source's holds (SimpleFIN's on a card now sourced
 * from the bank page, say). Money readers must exclude them or the same purchase lands in
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
        // D4: a hold the page has confirmed posted at the bank is already inside the
        // headline balance that same page reported (`recordSourceState`) — counting it here
        // too would double it. It stays pending for the register (envelope, split, backlog
        // math all keep counting it via the ordinary money-rows sum); only the
        // headline-plus-pending arithmetic here has to leave it out.
        isNull(financeTransactions.postedAtBank),
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
  };
}
