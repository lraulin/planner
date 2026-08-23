import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { upsertRecurringBill } from "@/lib/finances/mutations";
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

function monthly(accountId?: string): ScheduleCondition[] {
  const conditions: ScheduleCondition[] = [
    {
      field: "date",
      op: "isapprox",
      value: { frequency: "monthly", start: "2026-01-15" },
    },
    { field: "payee", op: "is", value: "NETFLIX" },
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

  beforeEach(async () => {
    userId = await makeUser();
    accountId = await seedAccount(userId);
  });

  it("creates a schedule the owner can read and a second user cannot", async () => {
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly() },
      TODAY,
    );
    expect(await getSchedule(userId, id)).toMatchObject({
      name: "Netflix",
      nextDate: "2026-09-15",
    });

    const other = await makeUser();
    expect(await getSchedule(other, id)).toBeNull();
    expect(await listSchedules(other, TODAY)).toEqual([]);
    await expect(
      updateSchedule(other, id, { name: "Hijacked" }, TODAY),
    ).rejects.toThrow("That schedule does not exist.");
    await expect(deleteSchedule(other, id)).rejects.toThrow(
      "That schedule does not exist.",
    );
    expect((await getSchedule(userId, id))?.name).toBe("Netflix");
  });

  it("skips the next date without writing a transaction", async () => {
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly() },
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
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly(accountId) },
      TODAY,
    );
    const transactionId = await postScheduleNow(userId, id);
    const [row] = await db
      .select()
      .from(financeTransactions)
      .where(eq(financeTransactions.id, transactionId));
    expect(row?.scheduleId).toBe(id);
    expect(row?.transactionDate).toBe("2026-09-15");
    expect((await getSchedule(userId, id))?.nextDate).toBe("2026-10-15");
  });

  it("refuses to post without an account condition", async () => {
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly() },
      TODAY,
    );
    await expect(postScheduleNow(userId, id)).rejects.toThrow(
      "Pick an account on the schedule first.",
    );
  });

  it("imports active bills once, then only new ones", async () => {
    await upsertRecurringBill(userId, {
      name: "Netflix",
      matchers: ["NETFLIX"],
      cadence: { unit: "month", n: 1 },
      expectedCents: 1599,
      anchorDate: "2026-01-15",
      dueDay: 15,
    });
    await upsertRecurringBill(userId, {
      name: "Paused Mag",
      matchers: ["MAG"],
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
    const id = await createSchedule(
      userId,
      { name: "Netflix", conditions: monthly(accountId) },
      TODAY,
    );
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-09-14",
      description: "NETFLIX",
      amount: "-15.99",
    });
    const result = await findMatches(userId);
    expect(result.linked).toBe(1);
    const [row] = await db
      .select()
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId));
    expect(row?.scheduleId).toBe(id);
    expect((await getSchedule(userId, id))?.nextDate).toBe("2026-10-15");
  });
});
