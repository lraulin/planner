import { describe, expect, it } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeTransactions,
} from "@/db/schema";
import { linkAccount, saveBalance, saveConnection } from "@/lib/banksync/mutations";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { findMonth } from "./envelope";
import { seedBudget } from "./mutations";
import { loadBudget, loadBudgetMismatch } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("budget queries — mismatch");

const makeUser = testUsers("mismatch");

const TODAY = "2026-08-22";
const MONTH = "2026-08-01";

async function addAccount(
  userId: string,
  values: { name: string; kind?: "checking" | "savings"; key?: string },
) {
  const [row] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: values.name,
      kind: values.kind ?? "checking",
      offBudget: false,
      externalSource: "test",
      externalKey: values.key ?? `acc-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return row.id;
}

async function addTx(
  userId: string,
  accountId: string,
  date: string,
  amount: string,
  extra: { flowOverride?: "internal_transfer"; transferGroupId?: string | null } = {},
) {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: date,
      description: "ROW",
      amount,
      flowOverride: extra.flowOverride,
      transferGroupId: extra.transferGroupId ?? null,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

describeDb("loadBudgetMismatch", () => {
  it("reports no mismatch for a seeded account whose register hasn't changed since setup", async () => {
    const userId = await makeUser();
    const checkingId = await addAccount(userId, { name: "Checking" });
    await addTx(userId, checkingId, "2026-07-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const mismatch = await loadBudgetMismatch(userId, MONTH);
    expect(mismatch.accounts).toHaveLength(1);
    expect(mismatch.accounts[0]).toMatchObject({
      accountId: checkingId,
      mismatchCents: 0,
    });
    expect(mismatch.unmatchedTransferCents).toBe(0);
  });

  it("surfaces drift from a pre-start row added after the opening was recorded", async () => {
    const userId = await makeUser();
    const checkingId = await addAccount(userId, { name: "Checking" });
    await addTx(userId, checkingId, "2026-07-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    // A missed old transaction, imported after the opening was already recorded: it moves
    // today's working balance but not "rows since start", so the two disagree — exactly
    // the class of error D1's incidents were about.
    await addTx(userId, checkingId, "2026-06-15", "12.34");

    const mismatch = await loadBudgetMismatch(userId, MONTH);
    expect(mismatch.accounts[0]?.mismatchCents).toBe(1_234);
  });

  it("nets a fully paired transfer to zero and leaves an unpaired leg visible", async () => {
    const userId = await makeUser();
    const checkingId = await addAccount(userId, { name: "Checking" });
    const savingsId = await addAccount(userId, { name: "Savings", kind: "savings" });
    await addTx(userId, checkingId, "2026-07-01", "500.00");
    await addTx(userId, savingsId, "2026-07-01", "0.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const groupId = crypto.randomUUID();
    await addTx(userId, checkingId, "2026-08-05", "-100.00", {
      flowOverride: "internal_transfer",
      transferGroupId: groupId,
    });
    await addTx(userId, savingsId, "2026-08-05", "100.00", {
      flowOverride: "internal_transfer",
      transferGroupId: groupId,
    });

    const paired = await loadBudgetMismatch(userId, MONTH);
    expect(paired.unmatchedTransferCents).toBe(0);

    // The withdrawal side of a transfer whose deposit has not posted yet — a real,
    // temporarily one-sided movement, not spending.
    await addTx(userId, checkingId, "2026-08-10", "-40.00", {
      flowOverride: "internal_transfer",
    });

    const withStray = await loadBudgetMismatch(userId, MONTH);
    expect(withStray.unmatchedTransferCents).toBe(-4_000);
  });

  it("returns nothing before the budget is set up", async () => {
    const userId = await makeUser();
    const mismatch = await loadBudgetMismatch(userId, null);
    expect(mismatch).toEqual({ accounts: [], unmatchedTransferCents: 0 });
  });

  it("does not let a second user's accounts or transfers leak into the first user's mismatch", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    const ownerAccountId = await addAccount(ownerId, { name: "Checking" });
    await addTx(ownerId, ownerAccountId, "2026-07-01", "50.00");
    await seedBudget(ownerId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });

    const intruderAccountId = await addAccount(intruderId, { name: "Checking" });
    await addTx(intruderId, intruderAccountId, "2026-07-01", "999.00");
    await addTx(intruderId, intruderAccountId, "2026-08-05", "-10.00", {
      flowOverride: "internal_transfer",
    });
    await seedBudget(intruderId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });

    const ownerMismatch = await loadBudgetMismatch(ownerId, MONTH);
    expect(ownerMismatch.accounts).toHaveLength(1);
    expect(ownerMismatch.accounts[0]?.accountId).toBe(ownerAccountId);
    expect(ownerMismatch.unmatchedTransferCents).toBe(0);
  });
});

/**
 * D1's promise, end to end through `loadBudget`: bad data shows up where it belongs — an
 * overspent envelope, a mismatch — and never as a different Ready to Assign.
 */
describeDb("Ready to Assign is ledger-derived", () => {
  async function syncBalance(userId: string, accountId: string) {
    const connectionId = await saveConnection(userId, {
      accessUrl: "https://test:test@example.invalid/simplefin",
    });
    const linkId = await linkAccount(userId, {
      connectionId,
      externalAccountId: `ext-${crypto.randomUUID()}`,
      accountId,
      institution: "Test Bank",
    });
    return async (balanceCents: number, asOf: string) =>
      saveBalance(userId, {
        linkId,
        balanceCents,
        availableCents: null,
        asOf: new Date(asOf),
      });
  }

  async function budgetedChecking() {
    const userId = await makeUser();
    const checkingId = await addAccount(userId, { name: "Checking" });
    await addTx(userId, checkingId, "2026-07-01", "500.00");
    const setBalance = await syncBalance(userId, checkingId);
    await setBalance(46_000, "2026-08-21T12:00:00Z");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const [category] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          ne(financeBudgetCategories.kind, "income"),
        ),
      )
      .limit(1);
    await db
      .insert(financeBudgetAllocations)
      .values({ userId, month: MONTH, categoryId: category.id, amountCents: 5_000 });
    const charge = {
      userId,
      accountId: checkingId,
      transactionDate: "2026-08-10",
      description: "GROCER",
      amount: "-40.00",
      budgetCategoryId: category.id,
    };
    await db.insert(financeTransactions).values(charge);
    return { userId, checkingId, categoryId: category.id, charge, setBalance };
  }

  async function current(userId: string) {
    const data = await loadBudget(userId, MONTH, db, {
      todayKey: TODAY,
      includeMovementEvents: false,
    });
    const month = findMonth(data.months, MONTH);
    if (!month) throw new Error("no current month");
    return { data, month };
  }

  it("lets a duplicate categorized charge overspend its envelope without moving Ready to Assign", async () => {
    const { userId, categoryId, charge } = await budgetedChecking();
    const before = await current(userId);
    expect(before.month.categories[categoryId]?.balanceCents).toBe(1_000);

    // The same charge written into the ledger a second time, as a duplicate import would.
    await db.insert(financeTransactions).values(charge);

    const after = await current(userId);
    expect(after.month.categories[categoryId]?.balanceCents).toBe(-3_000);
    expect(after.month.readyToAssignCents).toBe(before.month.readyToAssignCents);
  });

  it("does not move Ready to Assign when only the bank headline changes", async () => {
    const { userId, checkingId, setBalance } = await budgetedChecking();
    const before = await current(userId);

    await setBalance(46_000 + 12_345, "2026-08-22T12:00:00Z");

    const after = await current(userId);
    expect(after.data.accountPoolCents - before.data.accountPoolCents).toBe(12_345);
    expect(after.month.readyToAssignCents).toBe(before.month.readyToAssignCents);
    const mismatchOf = (data: typeof before.data) =>
      data.mismatch.accounts.find((row) => row.accountId === checkingId)?.mismatchCents;
    expect((mismatchOf(after.data) ?? 0) - (mismatchOf(before.data) ?? 0)).toBe(12_345);
  });
});
