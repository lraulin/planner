import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { seedBudget } from "../budget/mutations";
import { captureFinanceMoneyCheckpoint } from "./checkpoints";
import { writeFinanceAuditEvent } from "./writes";
import { listFinanceAuditEvents } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance audit queries");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `audit-${crypto.randomUUID()}@localhost`, name: "Audit Test" })
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

describeDb("listFinanceAuditEvents — headline impact", () => {
  it("measures Ready to Assign movement, not the unchanged bank pool", async () => {
    const userId = await makeUser();
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId,
        name: "Checking",
        kind: "checking",
        offBudget: false,
        externalSource: "test",
        externalKey: "checking",
      })
      .returning({ id: financeAccounts.id });
    await db.insert(financeTransactions).values({
      userId,
      accountId: account.id,
      transactionDate: "2026-07-01",
      description: "ROW",
      amount: "300.00",
    });
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const before = await captureFinanceMoneyCheckpoint(
      userId,
      { budgetMonths: [MONTH] },
      db,
    );
    // Assigning money moves nothing in any account — the pool is exactly what it was —
    // but it does move Ready to Assign. A headline column still keyed to the pool would
    // read $0.00 for this event, which is the Sep 14 failure mode this fixes.
    expect(before.accountPoolCents).toBe(30_000);
    expect(before.budgets[0]?.readyToAssignCents).toBe(30_000);

    const [savingsCategory] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.name, "Savings"),
        ),
      );
    if (!savingsCategory)
      throw new Error("expected a Savings envelope from the preset");

    await db.insert(financeBudgetAllocations).values({
      userId,
      month: MONTH,
      categoryId: savingsCategory.id,
      amountCents: 5_000,
    });

    const after = await captureFinanceMoneyCheckpoint(
      userId,
      { budgetMonths: [MONTH] },
      db,
    );
    expect(after.accountPoolCents).toBe(30_000);
    expect(after.budgets[0]?.readyToAssignCents).toBe(25_000);

    const { batchId } = await writeFinanceAuditEvent(db, userId, {
      kind: "budget_assignment",
      origin: "test",
      summary: "Assigned to Savings",
      scope: { budgetMonths: [MONTH] },
      beforeCheckpoint: before,
      afterCheckpoint: after,
    });

    const [event] = await listFinanceAuditEvents(userId);
    expect(event?.batchId).toBe(batchId);
    expect(event?.headlineImpactCents).toBe(-5_000);
  });

  it("does not let a second user's checkpoints leak into headline impact", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await seedBudget(ownerId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });
    await seedBudget(intruderId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });

    await writeFinanceAuditEvent(db, ownerId, {
      kind: "budget_assignment",
      origin: "test",
      summary: "Owner event",
      scope: {},
    });

    const ownerEvents = await listFinanceAuditEvents(ownerId);
    const intruderEvents = await listFinanceAuditEvents(intruderId);
    expect(ownerEvents.some((event) => event.summary === "Owner event")).toBe(true);
    expect(intruderEvents.some((event) => event.summary === "Owner event")).toBe(false);
  });
});
