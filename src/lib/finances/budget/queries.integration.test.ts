import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { seedBudget } from "./mutations";
import { loadBudgetMismatch } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("budget queries — mismatch");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `mismatch-${crypto.randomUUID()}@localhost`,
      name: "Mismatch Test",
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
