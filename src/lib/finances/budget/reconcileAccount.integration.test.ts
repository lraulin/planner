import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { linkAccount, saveBalance, saveConnection } from "@/lib/banksync/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { seedBudget, reconcileAccount } from "./mutations";
import { loadBudget, loadBudgetMismatch } from "./queries";
import { loadFinanceAuditEvent, listFinanceAuditEvents } from "../audit/queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("reconcile account");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `reconcile-${crypto.randomUUID()}@localhost`,
      name: "Reconcile Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

const TODAY = "2026-09-14";
const MONTH = "2026-09-01";

async function addAccount(userId: string, name = "Checking"): Promise<string> {
  const [row] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name,
      kind: "checking",
      offBudget: false,
      externalSource: "test",
      externalKey: `acc-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return row.id;
}

async function addTx(userId: string, accountId: string, date: string, amount: string) {
  await db.insert(financeTransactions).values({
    userId,
    accountId,
    transactionDate: date,
    description: "ROW",
    amount,
  });
}

/**
 * Give the account a live synced balance, independent of the ledger — the only balance
 * source `accountBalanceView` does not recompute from stored rows on every read, and so the
 * only one a mismatch (and Reconcile closing it) can mean anything against. A statement or
 * the ledger sum both move in lockstep with any row this test inserts, which is why they
 * cannot exercise D3/D5 at all.
 */
async function syncBalance(userId: string, accountId: string, balanceCents: number) {
  const connectionId = await saveConnection(userId, {
    accessUrl: "https://test:test@example.invalid/simplefin",
  });
  const linkId = await linkAccount(userId, {
    connectionId,
    externalAccountId: `ext-${crypto.randomUUID()}`,
    accountId,
    institution: "Test Bank",
  });
  await saveBalance(userId, {
    linkId,
    balanceCents,
    availableCents: null,
    asOf: new Date(`${TODAY}T12:00:00Z`),
  });
}

describeDb("reconcileAccount", () => {
  it("writes exactly the current difference, dated today, and audits it", async () => {
    const userId = await makeUser();
    const accountId = await addAccount(userId);
    await addTx(userId, accountId, "2026-08-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    // The bank has $12.34 the register never recorded — a deposit that never made it in,
    // the unrecoverable gap D5 exists for once there is no row left to fix.
    await syncBalance(userId, accountId, 6_234);

    const before = await loadBudgetMismatch(userId, MONTH);
    expect(before.accounts[0]?.mismatchCents).toBe(1_234);

    const receipt = await reconcileAccount(userId, accountId);
    expect(receipt).toMatchObject({
      accountId,
      applied: true,
      differenceCents: 1_234,
    });
    expect(receipt.transactionId).not.toBeNull();

    const [row] = await db
      .select({
        transactionDate: financeTransactions.transactionDate,
        amount: financeTransactions.amount,
        externalSource: financeTransactions.externalSource,
        flowOverride: financeTransactions.flowOverride,
        budgetCategoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, receipt.transactionId!));
    expect(row).toMatchObject({
      transactionDate: TODAY,
      amount: "12.34",
      externalSource: "reconcile",
      flowOverride: "income",
      budgetCategoryId: null,
    });

    const after = await loadBudgetMismatch(userId, MONTH);
    expect(after.accounts[0]?.mismatchCents).toBe(0);

    const events = await listFinanceAuditEvents(userId);
    const event = events.find((row) => row.kind === "reconciliation_adjustment");
    expect(event).toBeDefined();
    const full = await loadFinanceAuditEvent(userId, event!.id);
    expect(full?.changes).toHaveLength(1);
  });

  it("moves Ready to Assign by exactly the confirmed difference", async () => {
    const userId = await makeUser();
    const accountId = await addAccount(userId);
    await addTx(userId, accountId, "2026-08-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await syncBalance(userId, accountId, 6_234);

    const before = await loadBudget(userId, MONTH, db, { todayKey: TODAY });
    const beforeMonth = before.months.find((month) => month.month === MONTH)!;

    await reconcileAccount(userId, accountId);

    const after = await loadBudget(userId, MONTH, db, { todayKey: TODAY });
    const afterMonth = after.months.find((month) => month.month === MONTH)!;
    expect(afterMonth.readyToAssignCents - beforeMonth.readyToAssignCents).toBe(1_234);
  });

  it("does not nag Lee to categorize its own adjustment, but still counts its money", async () => {
    const userId = await makeUser();
    const accountId = await addAccount(userId);
    await addTx(userId, accountId, "2026-08-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await syncBalance(userId, accountId, 6_234);

    const before = await loadBudget(userId, MONTH, db, { todayKey: TODAY });
    expect(before.uncategorizedCount).toBe(0);

    await reconcileAccount(userId, accountId);

    const after = await loadBudget(userId, MONTH, db, { todayKey: TODAY });
    expect(after.uncategorizedCount).toBe(0);
    expect(after.uncategorizedCents).toBe(1_234);
  });

  it("is a no-op, not an error, when the difference has already closed", async () => {
    const userId = await makeUser();
    const accountId = await addAccount(userId);
    await addTx(userId, accountId, "2026-08-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const receipt = await reconcileAccount(userId, accountId);
    expect(receipt).toMatchObject({
      accountId,
      applied: false,
      differenceCents: 0,
      transactionId: null,
    });
    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.accountId, accountId));
    expect(rows).toHaveLength(1);
  });

  it("does not let a second user reconcile or inspect the owner's account", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    const accountId = await addAccount(ownerId);
    await addTx(ownerId, accountId, "2026-08-01", "50.00");
    await seedBudget(ownerId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });
    await syncBalance(ownerId, accountId, 6_234);

    await expect(reconcileAccount(intruderId, accountId)).rejects.toThrow(
      /Account not found/,
    );

    const rows = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(eq(financeTransactions.accountId, accountId));
    expect(rows).toHaveLength(1); // the original row only — no adjustment landed
    expect(await listFinanceAuditEvents(intruderId)).toEqual([]);
  });
});
