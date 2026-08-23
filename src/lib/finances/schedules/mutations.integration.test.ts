import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { upsertRecurringBill } from "@/lib/finances/mutations";
import { createPayee } from "@/lib/finances/payees/mutations";
import {
  createSchedule,
  deleteSchedule,
  findMatches,
  importSchedulesFromBills,
  postScheduleNow,
  skipSchedule,
  updateSchedule,
} from "./mutations";
import { getSchedule, listSchedules } from "./queries";
import type { ScheduleCondition } from "./conditions";
import { seedBudget } from "../budget/mutations";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("schedule mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `schedules-${crypto.randomUUID()}@localhost`,
      name: "Schedule Test",
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

async function seedAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

function monthly(payeeId: string, accountId?: string): ScheduleCondition[] {
  const conditions: ScheduleCondition[] = [
    {
      field: "date",
      op: "isapprox",
      value: { frequency: "monthly", start: "2026-01-15" },
    },
    { field: "payee", op: "is", value: payeeId },
    { field: "amount", op: "isapprox", value: -1599 },
  ];
  if (accountId) {
    conditions.push({ field: "account", op: "is", value: accountId });
  }
  return conditions;
}

describeDb("schedule mutations", () => {
  let userId: string;
  let accountId: string;
  let payeeId: string;

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await seedAccount(userId);
    payeeId = await createPayee(userId, { name: "Netflix", aliases: ["NETFLIX"] });
  });

  it("creates a schedule the owner can read and a second user cannot", async () => {
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly(payeeId) },
      TODAY,
    );
    expect(await getSchedule(userId, id)).toMatchObject({
      name: "Netflix",
      nextDate: "2026-09-15",
    });

    const other = await makeUser();
    await seedAccount(other);
    await seedBudget(other, {
      preset: "minimal",
      startMonth: "2026-08-01",
      todayKey: TODAY,
    });
    const otherPayeeId = await createPayee(other, { name: "Other Netflix" });
    const [foreignEnvelope] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, other))
      .limit(1);
    expect(await getSchedule(other, id)).toBeNull();
    expect(await listSchedules(other, TODAY)).toEqual([]);
    await expect(
      updateSchedule(other, id, { name: "Hijacked" }, TODAY),
    ).rejects.toThrow("That schedule does not exist.");
    await expect(deleteSchedule(other, id)).rejects.toThrow(
      "That schedule does not exist.",
    );
    expect((await getSchedule(userId, id))?.name).toBe("Netflix");
    await expect(
      createSchedule(
        userId,
        { name: "Foreign payee", conditions: monthly(otherPayeeId) },
        TODAY,
      ),
    ).rejects.toThrow("One or more payees do not exist.");
    await expect(
      updateSchedule(userId, id, { conditions: monthly(otherPayeeId) }, TODAY),
    ).rejects.toThrow("One or more payees do not exist.");
    await expect(
      createSchedule(
        userId,
        {
          name: "Foreign envelope",
          conditions: monthly(payeeId),
          budgetCategoryId: foreignEnvelope.id,
        },
        TODAY,
      ),
    ).rejects.toThrow("That envelope does not exist.");
    await expect(
      updateSchedule(userId, id, { budgetCategoryId: foreignEnvelope.id }, TODAY),
    ).rejects.toThrow("That envelope does not exist.");
  });

  it("names a duplicate schedule rather than leaking the failed statement", async () => {
    await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly(payeeId) },
      TODAY,
    );

    // This message had never once been reachable: drizzle wraps the PostgresError, so the
    // old `error.code === "23505"` check on the outer error never matched and the raw SQL
    // plus its parameters travelled instead (`src/lib/db/constraints.ts`).
    await expect(
      createSchedule(userId, { name: "Netflix", conditions: monthly(payeeId) }, TODAY),
    ).rejects.toThrow('A schedule named "Netflix" already exists.');
  });

  it("skips the next date without writing a transaction", async () => {
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly(payeeId) },
      TODAY,
    );
    await skipSchedule(userId, id);
    expect((await getSchedule(userId, id))?.nextDate).toBe("2026-10-15");
    expect(
      await db
        .select()
        .from(financeTransactions)
        .where(eq(financeTransactions.userId, userId)),
    ).toEqual([]);
  });

  it("posts one linked transaction and advances the cursor", async () => {
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-08-01",
      todayKey: TODAY,
    });
    const [envelope] = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId))
      .limit(1);
    const id = await createSchedule(
      userId,
      {
        name: "Netflix",
        conditions: monthly(payeeId, accountId),
        budgetCategoryId: envelope.id,
      },
      TODAY,
    );
    const transactionId = await postScheduleNow(userId, id);
    const [row] = await db
      .select()
      .from(financeTransactions)
      .where(eq(financeTransactions.id, transactionId));
    expect(row?.scheduleId).toBe(id);
    expect(row?.budgetCategoryId).toBe(envelope.id);
    expect(row?.payeeId).toBe(payeeId);
    expect(row?.description).toBe("Netflix");
    expect(row?.transactionDate).toBe("2026-09-15");
    expect((await getSchedule(userId, id))?.nextDate).toBe("2026-10-15");
  });

  it("refuses to post without an account condition", async () => {
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly(payeeId) },
      TODAY,
    );
    await expect(postScheduleNow(userId, id)).rejects.toThrow(
      "Pick an account on the schedule first.",
    );
  });

  it("imports active bills once, then only new ones", async () => {
    await upsertRecurringBill(userId, {
      name: "Netflix",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1599,
      anchorDate: "2026-01-15",
      dueDay: 15,
    });
    await upsertRecurringBill(userId, {
      name: "Paused Mag",
      cadence: { unit: "month", n: 1 },
      expectedCents: 500,
      status: "paused",
    });

    const first = await importSchedulesFromBills(userId, TODAY);
    expect(first).toEqual({ created: 1, skippedExisting: 0, skippedInactive: 1 });
    const second = await importSchedulesFromBills(userId, TODAY);
    expect(second).toEqual({ created: 0, skippedExisting: 1, skippedInactive: 1 });
  });

  it("links a matching imported charge and advances the schedule", async () => {
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-08-01",
      todayKey: TODAY,
    });
    const envelopeRows = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId));
    const id = await createSchedule(
      userId,
      {
        name: "Netflix",
        conditions: monthly(payeeId, accountId),
        budgetCategoryId: envelopeRows[0].id,
      },
      TODAY,
    );
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-09-14",
      description: "NETFLIX",
      payeeId,
      amount: "-15.99",
    });
    const result = await findMatches(userId);
    expect(result.linked).toBe(1);
    const [row] = await db
      .select()
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(row?.scheduleId).toBe(id);
    expect(row?.budgetCategoryId).toBe(envelopeRows[0].id);
    expect((await getSchedule(userId, id))?.nextDate).toBe("2026-10-15");
  });

  it("keeps a transaction's explicit envelope when schedule matching links it", async () => {
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-08-01",
      todayKey: TODAY,
    });
    const envelopeRows = await db
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.userId, userId));
    await createSchedule(
      userId,
      {
        name: "Netflix",
        conditions: monthly(payeeId, accountId),
        budgetCategoryId: envelopeRows[0].id,
      },
      TODAY,
    );
    const [transaction] = await db
      .insert(financeTransactions)
      .values({
        userId,
        accountId,
        transactionDate: "2026-09-14",
        description: "NETFLIX",
        payeeId,
        amount: "-15.99",
        budgetCategoryId: envelopeRows[1].id,
      })
      .returning({ id: financeTransactions.id });

    expect((await findMatches(userId)).linked).toBe(1);
    const [row] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, transaction.id));
    expect(row?.budgetCategoryId).toBe(envelopeRows[1].id);
  });
});
