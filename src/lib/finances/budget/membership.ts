/**
 * One-time opening rebase when an account enters or leaves the budget pool.
 *
 * Changing membership without rebasing `openingCents` corrupts every later month. All
 * boundary changes go through this module: account creation after the budget started,
 * a flexible-kind toggle, a kind edit that forces a core account on-budget, and the
 * one-shot savings cutover.
 *
 * Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/` D5.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, userSettings, type FinanceAccountKind } from "@/db/schema";
import { isCoreBudgetKind, resolvedOffBudget } from "../accountKind";
import { serializeBudget } from "@/lib/settings/finances";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { monthKeyOf } from "./envelope";
import { findMonth } from "./envelope";
import { loadBudget, openingPositionFor } from "./queries";
import type { FinanceExecutor } from "../dbExecutor";

export type PoolSnapshot = {
  openingCents: number;
  accountPoolCents: number;
  readyToAssignCents: number;
  totalEnvelopeBalanceCents: number;
  heldForNextMonthCents: number;
  assignedInFutureMonthsCents: number;
  uncategorizedActivityCents: number;
  accountReconciliationCents: number;
};

export type AccountTransition = {
  accountId: string;
  name: string;
  kind: FinanceAccountKind;
  positionCents: number;
  offBudgetBefore: boolean;
  offBudgetAfter: boolean;
};

export type MembershipReceipt = {
  transitions: AccountTransition[];
  before: PoolSnapshot;
  after: PoolSnapshot;
};

class DryRunRollback extends Error {
  constructor(public receipt: MembershipReceipt) {
    super("dry run");
  }
}

function assertIntegerCents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

function snapshotOf(data: Awaited<ReturnType<typeof loadBudget>>): PoolSnapshot {
  const current =
    findMonth(data.months, monthKeyOf(data.todayKey)) ??
    data.months.find((month) => month.month === data.month) ??
    null;
  return {
    openingCents: data.settings.openingCents,
    accountPoolCents: data.accountPoolCents,
    readyToAssignCents: current?.readyToAssignCents ?? 0,
    totalEnvelopeBalanceCents: current?.totalBalanceCents ?? 0,
    heldForNextMonthCents: current?.bufferedCents ?? 0,
    assignedInFutureMonthsCents: current?.assignedInFutureMonthsCents ?? 0,
    uncategorizedActivityCents: current?.uncategorizedActivityCents ?? 0,
    accountReconciliationCents: current?.accountReconciliationCents ?? 0,
  };
}

function assertPoolIdentity(snapshot: PoolSnapshot): void {
  const rhs =
    snapshot.readyToAssignCents +
    snapshot.totalEnvelopeBalanceCents +
    snapshot.heldForNextMonthCents +
    snapshot.assignedInFutureMonthsCents;
  if (rhs !== snapshot.accountPoolCents) {
    throw new Error(
      `Account pool identity failed: pool ${snapshot.accountPoolCents} !== Ready to Assign ${snapshot.readyToAssignCents} + envelopes ${snapshot.totalEnvelopeBalanceCents} + held ${snapshot.heldForNextMonthCents} + future assigned ${snapshot.assignedInFutureMonthsCents}.`,
    );
  }
}

async function requireOwnedAccount(
  userId: string,
  accountId: string,
  executor: FinanceExecutor = db,
): Promise<{
  id: string;
  name: string;
  kind: FinanceAccountKind;
  offBudget: boolean;
}> {
  const [row] = await executor
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      kind: financeAccounts.kind,
      offBudget: financeAccounts.offBudget,
    })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Account not found.");
  return row;
}

async function writeOpeningCents(
  executor: FinanceExecutor,
  userId: string,
  startMonth: string,
  openingCents: number,
): Promise<void> {
  const value = serializeBudget({ startMonth, openingCents });
  await executor
    .insert(userSettings)
    .values({ userId, scope: BUDGET_SCOPE, value })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.scope],
      set: { value, updatedAt: new Date() },
    });
}

async function applyTransitions(
  executor: FinanceExecutor,
  userId: string,
  transitions: readonly AccountTransition[],
  startMonth: string | null,
  nextOpeningCents: number,
): Promise<void> {
  for (const transition of transitions) {
    const [updated] = await executor
      .update(financeAccounts)
      .set({ offBudget: transition.offBudgetAfter, updatedAt: new Date() })
      .where(
        and(
          eq(financeAccounts.id, transition.accountId),
          eq(financeAccounts.userId, userId),
        ),
      )
      .returning({ id: financeAccounts.id });
    if (!updated) throw new Error("Account not found.");
  }
  if (startMonth !== null && transitions.length > 0) {
    await writeOpeningCents(executor, userId, startMonth, nextOpeningCents);
  }
}

/**
 * Flip `offBudget` and rebase opening by the account's signed position immediately
 * before the budget start month. No-op when membership is already the target.
 *
 * Core kinds cannot leave. A second call with the same target reports no transition.
 */
export async function rebaseAccountMembership(
  userId: string,
  accountId: string,
  nextOffBudget: boolean,
  options: { dryRun?: boolean } = {},
): Promise<MembershipReceipt> {
  const account = await requireOwnedAccount(userId, accountId);
  const offBudgetAfter = resolvedOffBudget(account.kind, nextOffBudget);
  if (isCoreBudgetKind(account.kind) && nextOffBudget) {
    throw new Error(
      "Checking, savings, cash, and credit-card accounts are always on budget.",
    );
  }
  if (account.offBudget === offBudgetAfter) {
    const data = await loadBudget(userId, null);
    const snapshot = snapshotOf(data);
    if (data.configured) assertPoolIdentity(snapshot);
    return { transitions: [], before: snapshot, after: snapshot };
  }

  try {
    return await db.transaction(async (tx) => {
      const owned = await requireOwnedAccount(userId, accountId, tx);
      if (owned.offBudget === offBudgetAfter) {
        const data = await loadBudget(userId, null, tx);
        const snapshot = snapshotOf(data);
        if (data.configured) assertPoolIdentity(snapshot);
        const receipt = { transitions: [], before: snapshot, after: snapshot };
        if (options.dryRun) throw new DryRunRollback(receipt);
        return receipt;
      }

      const beforeData = await loadBudget(userId, null, tx);
      const before = snapshotOf(beforeData);
      const startMonth = beforeData.settings.startMonth;
      const positionCents = startMonth
        ? assertIntegerCents(
            await openingPositionFor(userId, startMonth, [accountId], tx),
            "account position",
          )
        : 0;

      const delta = offBudgetAfter ? -positionCents : positionCents;
      const nextOpeningCents = assertIntegerCents(
        before.openingCents + delta,
        "opening position",
      );

      const transition: AccountTransition = {
        accountId,
        name: owned.name,
        kind: owned.kind,
        positionCents,
        offBudgetBefore: owned.offBudget,
        offBudgetAfter,
      };

      await applyTransitions(tx, userId, [transition], startMonth, nextOpeningCents);

      const afterData = await loadBudget(userId, null, tx);
      const after = snapshotOf(afterData);
      if (afterData.configured) assertPoolIdentity(after);

      const receipt = { transitions: [transition], before, after };
      if (options.dryRun) throw new DryRunRollback(receipt);
      return receipt;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.receipt;
    throw error;
  }
}

/**
 * Include a newly created on-budget account in the opening figure, once.
 *
 * Called after the imported ledger is present. Re-imports pass `created: false` and
 * must not call this.
 */
export async function includeNewOnBudgetAccount(
  userId: string,
  accountId: string,
): Promise<MembershipReceipt> {
  const account = await requireOwnedAccount(userId, accountId);
  if (account.offBudget) {
    const data = await loadBudget(userId, null);
    const snapshot = snapshotOf(data);
    return { transitions: [], before: snapshot, after: snapshot };
  }
  const data = await loadBudget(userId, null);
  if (!data.settings.startMonth) {
    const snapshot = snapshotOf(data);
    return { transitions: [], before: snapshot, after: snapshot };
  }
  // Already on-budget: treat "enter" as adding its pre-start position without flipping.
  return await db.transaction(async (tx) => {
    const beforeData = await loadBudget(userId, null, tx);
    const before = snapshotOf(beforeData);
    const startMonth = beforeData.settings.startMonth;
    if (!startMonth) {
      const receipt = { transitions: [], before, after: before };
      return receipt;
    }
    const positionCents = assertIntegerCents(
      await openingPositionFor(userId, startMonth, [accountId], tx),
      "account position",
    );
    const nextOpeningCents = assertIntegerCents(
      before.openingCents + positionCents,
      "opening position",
    );
    await writeOpeningCents(tx, userId, startMonth, nextOpeningCents);
    const afterData = await loadBudget(userId, null, tx);
    const after = snapshotOf(afterData);
    if (afterData.configured) assertPoolIdentity(after);
    return {
      transitions: [
        {
          accountId,
          name: account.name,
          kind: account.kind,
          positionCents,
          offBudgetBefore: false,
          offBudgetAfter: false,
        },
      ],
      before,
      after,
    };
  });
}

/**
 * User-scoped cutover: every off-budget core account (savings in particular) joins the
 * pool, its pre-start position is added to opening, and nothing else is rewritten.
 *
 * Idempotent. Dry-run runs the same transaction and rolls it back.
 */
export async function applySinglePoolCutover(
  userId: string,
  options: { dryRun?: boolean } = {},
): Promise<MembershipReceipt> {
  try {
    return await db.transaction(async (tx) => {
      const beforeData = await loadBudget(userId, null, tx);
      const before = snapshotOf(beforeData);
      const startMonth = beforeData.settings.startMonth;

      const coreOffBudget = await tx
        .select({
          id: financeAccounts.id,
          name: financeAccounts.name,
          kind: financeAccounts.kind,
          offBudget: financeAccounts.offBudget,
        })
        .from(financeAccounts)
        .where(
          and(eq(financeAccounts.userId, userId), eq(financeAccounts.offBudget, true)),
        );

      const targets = coreOffBudget.filter((row) => isCoreBudgetKind(row.kind));
      if (targets.length === 0) {
        if (beforeData.configured) assertPoolIdentity(before);
        const receipt = { transitions: [], before, after: before };
        if (options.dryRun) throw new DryRunRollback(receipt);
        return receipt;
      }

      const transitions: AccountTransition[] = [];
      let delta = 0;
      for (const account of targets) {
        const positionCents = startMonth
          ? assertIntegerCents(
              await openingPositionFor(userId, startMonth, [account.id], tx),
              "account position",
            )
          : 0;
        delta += positionCents;
        transitions.push({
          accountId: account.id,
          name: account.name,
          kind: account.kind,
          positionCents,
          offBudgetBefore: true,
          offBudgetAfter: false,
        });
      }

      const nextOpeningCents = assertIntegerCents(
        before.openingCents + delta,
        "opening position",
      );
      await applyTransitions(tx, userId, transitions, startMonth, nextOpeningCents);

      const afterData = await loadBudget(userId, null, tx);
      const after = snapshotOf(afterData);
      if (afterData.configured) assertPoolIdentity(after);

      const receipt = { transitions, before, after };
      if (options.dryRun) throw new DryRunRollback(receipt);
      return receipt;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.receipt;
    throw error;
  }
}
