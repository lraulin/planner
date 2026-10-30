import { describe, expect, it } from "vitest";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeTransactions,
  reminderOccurrences,
} from "@/db/schema";
import { seedBudget } from "@/lib/finances/budget/mutations";
import { upsertBillEnvelope } from "@/lib/finances/mutations";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { READER_TIME_ZONE, readerTodayKey } from "@/lib/schedule/readerZone";
import { zonedWallTime } from "@/lib/schedule/zonedTime";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { checkReadyToAssign, fireOccurrence } from "./arm";
import { listFiredReminders } from "./queries";

/**
 * The two finance reminders against real Postgres: a bill alerts on its expected day only
 * while no charge has paid it, and Ready to Assign going negative notifies once and resolves
 * itself on recovery.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("finance reminders");

const makeUser = testUsers("test");

async function checking(userId: string): Promise<string> {
  const [row] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      offBudget: false,
      externalSource: "test",
      externalKey: `acc-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return row.id;
}

async function occurrencesOf(userId: string, sourceId: string) {
  return db
    .select()
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.sourceId, sourceId),
      ),
    );
}

describeDb("bill reminders", () => {
  it("arms at the morning time on the expected day, and a charge that lands first cancels it", async () => {
    const userId = await makeUser();
    const accountId = await checking(userId);
    const expectedKey = shiftDateKey(readerTodayKey(), 2);

    // Saving the bill is itself a writer: it re-arms its reminder.
    const billId = await upsertBillEnvelope(userId, {
      name: "Rent",
      cadence: { unit: "month", n: 1 },
      expectedCents: 150_000,
      anchorDate: expectedKey,
    });

    const [armed] = await occurrencesOf(userId, billId);
    expect(armed.state).toBe("scheduled");
    expect(armed.fireAt.toISOString()).toBe(
      zonedWallTime(expectedKey, 9 * 60, READER_TIME_ZONE).toISOString(),
    );

    // Autopay posts a day early. Nothing re-arms on a charge; the firing check notices.
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: shiftDateKey(expectedKey, -1),
      description: "RENT AUTOPAY",
      amount: "-1500.00",
      budgetCategoryId: billId,
    });

    expect(await fireOccurrence(armed.id, armed.fireAt)).toBe("superseded");
    expect(await listFiredReminders(userId)).toEqual([]);
  });

  it("fires on the expected day when nothing has been charged", async () => {
    const userId = await makeUser();
    const expectedKey = shiftDateKey(readerTodayKey(), 2);
    const billId = await upsertBillEnvelope(userId, {
      name: "Rent",
      cadence: { unit: "month", n: 1 },
      expectedCents: 150_000,
      anchorDate: expectedKey,
    });
    const [armed] = await occurrencesOf(userId, billId);

    expect(await fireOccurrence(armed.id, armed.fireAt)).toBe("fired");
    expect((await listFiredReminders(userId)).map((r) => r.title)).toEqual([
      "Rent hasn't been charged",
    ]);
  });
});

describeDb("Ready to Assign", () => {
  const TODAY = "2026-08-22";
  const MONTH = "2026-08-01";
  // Mid-afternoon Eastern on TODAY, so the reader's day and the budget's month agree.
  const NOW = new Date(`${TODAY}T18:00:00.000Z`);

  it("notifies once when it goes negative, and resolves when it recovers", async () => {
    const userId = await makeUser();
    const accountId = await checking(userId);
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-07-01",
      description: "PAYCHECK",
      amount: "500.00",
    });
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    expect(await checkReadyToAssign(userId, NOW)).toBe("unchanged");

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
    await db.insert(financeBudgetAllocations).values({
      userId,
      month: MONTH,
      categoryId: category.id,
      amountCents: 1_000_000,
    });

    expect(await checkReadyToAssign(userId, NOW)).toBe("notified");
    // Still negative after the next import: one notice per episode, not one per write.
    expect(await checkReadyToAssign(userId, NOW)).toBe("unchanged");
    expect((await listFiredReminders(userId)).map((r) => r.sourceKind)).toEqual([
      "ready_to_assign",
    ]);

    await db
      .delete(financeBudgetAllocations)
      .where(eq(financeBudgetAllocations.userId, userId));
    expect(await checkReadyToAssign(userId, NOW)).toBe("resolved");
    expect(await listFiredReminders(userId)).toEqual([]);
  });
});
