/**
 * The signed on-budget account pool.
 *
 * Positive asset balances add and negative credit-card/debt balances subtract by
 * construction — the sign convention is "positive is money into the account" for every
 * kind, so callers must not apply `abs` or invert by kind.
 *
 * Working balances (posted + selected pending on a synced headline) are the input, the
 * same figures the Dashboard shows per account.
 *
 * Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/` D2.
 */

import type { FinanceAccountKind } from "@/db/schema";
import {
  accountBalanceView,
  type DashboardAccount,
  type PendingRow,
} from "./workingBalance";

export type PoolAccount = DashboardAccount & {
  offBudget: boolean;
};

export type AccountPoolBreakdown = {
  checkingCashCents: number;
  savingsCents: number;
  cardDebtCents: number;
  otherOnBudgetCents: number;
  /** Signed sum of every on-budget working balance. */
  accountPoolCents: number;
};

function addWorking(account: PoolAccount, pending: readonly PendingRow[]): number {
  return accountBalanceView(account, pending).workingCents;
}

function kindBucket(
  kind: FinanceAccountKind,
): keyof Omit<AccountPoolBreakdown, "accountPoolCents"> {
  if (kind === "checking" || kind === "cash") return "checkingCashCents";
  if (kind === "savings") return "savingsCents";
  if (kind === "credit_card") return "cardDebtCents";
  return "otherOnBudgetCents";
}

/**
 * Signed sum of on-budget working balances. Off-budget accounts do not contribute, even
 * when they have a large headline.
 */
export function accountPoolCents(
  accounts: readonly PoolAccount[],
  pending: readonly PendingRow[] = [],
): number {
  let total = 0;
  for (const account of accounts) {
    if (account.offBudget) continue;
    total += addWorking(account, pending);
  }
  return total;
}

/**
 * The pool, and a kind breakdown of the same working balances. The parts sum to
 * `accountPoolCents`; they exist so the Dashboard can name checking, savings and cards
 * without a second, divergent total.
 */
export function accountPoolBreakdown(
  accounts: readonly PoolAccount[],
  pending: readonly PendingRow[] = [],
): AccountPoolBreakdown {
  const breakdown: AccountPoolBreakdown = {
    checkingCashCents: 0,
    savingsCents: 0,
    cardDebtCents: 0,
    otherOnBudgetCents: 0,
    accountPoolCents: 0,
  };
  for (const account of accounts) {
    if (account.offBudget) continue;
    const working = addWorking(account, pending);
    breakdown[kindBucket(account.kind)] += working;
    breakdown.accountPoolCents += working;
  }
  return breakdown;
}
