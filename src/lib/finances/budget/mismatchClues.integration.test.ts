import { expect, it } from "vitest";
import { db } from "@/db";
import { financeAccounts, financeTransactions } from "@/db/schema";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import type { FinanceMoneyCheckpoint } from "../audit/types";
import { writeFinanceAuditEvent } from "../audit/writes";
import { loadBudgetMismatch } from "./accountDrift";
import { loadMismatchClues } from "./mismatchClues";
import { seedBudget } from "./mutations";

const describeDb = await describeWithDatabase("budget mismatch clues");

const makeUser = testUsers("mismatch-clues");

const TODAY = "2026-08-22";
const MONTH = "2026-08-01";

async function addAccount(userId: string) {
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

async function addTx(userId: string, accountId: string, date: string, amount: string) {
  const [row] = await db
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      transactionDate: date,
      postedDate: date,
      description: `ROW ${amount}`,
      amount,
    })
    .returning({ id: financeTransactions.id });
  return row.id;
}

/** A seeded account whose register then gains a $12.34 row dated before the start month. */
async function driftedUser() {
  const userId = await makeUser();
  const accountId = await addAccount(userId);
  await addTx(userId, accountId, "2026-07-01", "50.00");
  await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
  const lateRowId = await addTx(userId, accountId, "2026-06-15", "12.34");
  return { userId, accountId, lateRowId };
}

function checkpointWithMismatch(cents: number): FinanceMoneyCheckpoint {
  return {
    accounts: [],
    selectedPendingCents: 0,
    accountPoolCents: 0,
    budgets: [
      {
        month: MONTH,
        readyToAssignCents: 0,
        accountPoolCents: 0,
        mismatchTotalCents: cents,
        uncategorizedCount: 0,
        uncategorizedActivityCents: 0,
        envelopes: [],
      },
    ],
  };
}

async function clues(userId: string) {
  const mismatch = await loadBudgetMismatch(userId, MONTH);
  return { mismatch, clues: await loadMismatchClues(userId, MONTH, mismatch, []) };
}

describeDb("loadMismatchClues", () => {
  it("shows the mismatch's terms and the pre-start row that accounts for it", async () => {
    const { userId, accountId, lateRowId } = await driftedUser();
    // A same-size row since start is the sibling of a missing row, not this gap's cause.
    await addTx(userId, accountId, "2026-08-10", "12.34");

    const result = await clues(userId);
    const account = result.mismatch.accounts[0];
    expect(account?.mismatchCents).toBe(1_234);
    expect(
      (account?.workingCents ?? 0) -
        (account?.openingCents ?? 0) -
        (account?.sinceStartCents ?? 0),
    ).toBe(1_234);
    expect(result.clues?.candidatesByAccount[accountId]).toEqual([
      expect.objectContaining({
        transactionId: lateRowId,
        amountCents: 1_234,
        reading: "dated-before-start",
      }),
    ]);
  });

  it("reports the newest audited write that moved the mismatch total", async () => {
    const { userId } = await driftedUser();
    await writeFinanceAuditEvent(db, userId, {
      kind: "finance_import",
      origin: "test",
      occurredAt: new Date("2026-08-20T12:00:00Z"),
      summary: "Older import",
      beforeCheckpoint: checkpointWithMismatch(0),
      afterCheckpoint: checkpointWithMismatch(500),
    });
    const { eventId } = await writeFinanceAuditEvent(db, userId, {
      kind: "finance_import",
      origin: "test",
      occurredAt: new Date("2026-08-21T12:00:00Z"),
      summary: "Imported June",
      beforeCheckpoint: checkpointWithMismatch(500),
      afterCheckpoint: checkpointWithMismatch(1_234),
    });
    // Newer, but it left the total where it was.
    await writeFinanceAuditEvent(db, userId, {
      kind: "budget_assignment",
      origin: "test",
      occurredAt: new Date("2026-08-22T12:00:00Z"),
      summary: "Assigned",
      beforeCheckpoint: checkpointWithMismatch(1_234),
      afterCheckpoint: checkpointWithMismatch(1_234),
    });

    const { clues: result } = await clues(userId);
    expect(result?.lastChange).toMatchObject({
      eventId,
      summary: "Imported June",
      beforeCents: 500,
      afterCents: 1_234,
    });
  });

  it("reads nothing when every account matches", async () => {
    const userId = await makeUser();
    const accountId = await addAccount(userId);
    await addTx(userId, accountId, "2026-07-01", "50.00");
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    expect((await clues(userId)).clues).toBeNull();
  });

  it("never shows a second user's rows or audit history", async () => {
    const { userId: ownerId, accountId } = await driftedUser();
    const intruder = await driftedUser();
    await writeFinanceAuditEvent(db, intruder.userId, {
      kind: "finance_import",
      origin: "test",
      summary: "Intruder's import",
      beforeCheckpoint: checkpointWithMismatch(0),
      afterCheckpoint: checkpointWithMismatch(1_234),
    });

    // The owner's mismatch, asked for under the intruder's id, finds nothing of the owner's.
    const ownerMismatch = await loadBudgetMismatch(ownerId, MONTH);
    const asIntruder = await loadMismatchClues(
      intruder.userId,
      MONTH,
      ownerMismatch,
      [],
    );
    expect(asIntruder?.candidatesByAccount[accountId]).toEqual([]);

    const { clues: ownerClues } = await clues(ownerId);
    expect(ownerClues?.lastChange).toBeNull();
    expect(
      ownerClues?.candidatesByAccount[accountId]?.map((row) => row.transactionId),
    ).not.toContain(intruder.lateRowId);
  });
});
