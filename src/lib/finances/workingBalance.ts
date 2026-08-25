/**
 * Posted headline versus working balance for one account.
 *
 * Pending is added only on a synced headline. A statement or ledger balance already
 * contains every pending row, so adding them there would double-count. Dashboard and
 * Budget share this so they cannot disagree about one wallet.
 *
 * Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/` D2.
 */

import type { FinanceAccountKind } from "@/db/schema";
import { formatUsd } from "./money";

/**
 * What the arithmetic needs from an account. A structural subset of `FinanceAccountRow`, so
 * the query layer's own type satisfies it and this module still imports nothing from the
 * database.
 */
export type DashboardAccount = {
  id: string;
  name: string;
  kind: FinanceAccountKind;
  /** The headline balance: synced > statement-anchored > ledger sum. */
  balanceCents: number;
  /** When a live feed last reported this balance, or null for an account with no bank link. */
  syncedBalanceAsOf: Date | null;
};

/** A pending row, as the working balance needs it. Signed in module convention. */
export type PendingRow = {
  accountId: string;
  amountCents: number;
};

export type AccountBalanceView = {
  /** Posted headline plus pending, when pending sits on top of a synced balance. */
  workingCents: number;
  /** The headline: synced posted, or statement/ledger (already includes pending). */
  postedCents: number;
  pendingCents: number;
};

/**
 * What one account should show: the working figure, and the posted figure when they differ.
 *
 * Pending is added only on a synced headline. A statement or ledger balance already contains
 * every pending row.
 */
export function accountBalanceView(
  account: DashboardAccount,
  pending: readonly PendingRow[],
): AccountBalanceView {
  const postedCents = account.balanceCents;
  const pendingCents =
    account.syncedBalanceAsOf === null
      ? 0
      : pending
          .filter((row) => row.accountId === account.id)
          .reduce((total, row) => total + row.amountCents, 0);
  return {
    workingCents: postedCents + pendingCents,
    postedCents,
    pendingCents,
  };
}

/** Hover text for an account row: the current figure, and the posted split when they differ. */
export function accountBalanceTooltip(view: AccountBalanceView): string {
  if (view.pendingCents === 0) {
    return `Current balance ${formatUsd(view.workingCents)}`;
  }
  return `Current balance ${formatUsd(view.workingCents)} (${formatUsd(view.postedCents)} posted + ${formatUsd(view.pendingCents)} pending)`;
}
