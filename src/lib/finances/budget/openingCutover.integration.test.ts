import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditEvents,
  financeStatements,
  financeTransactions,
  users,
} from "@/db/schema";
import { linkAccount, saveBalance, saveConnection } from "@/lib/banksync/mutations";
import { readSetting } from "@/lib/settings/queries";
import { parseBudget, serializeBudget } from "@/lib/settings/finances";
import { BUDGET_SCOPE } from "@/lib/settings/scopes";
import { userSettings } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { seedBudget } from "./mutations";
import { loadBudget } from "./queries";
import { applyLedgerOpeningCutover } from "./openingCutover";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("ledger opening cutover");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `opening-cutover-${crypto.randomUUID()}@localhost`,
      name: "Opening Cutover Test",
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
const MONTH = "2026-08-01";

async function addAccount(
  userId: string,
  name: string,
  kind: "checking" | "savings" | "credit_card",
): Promise<string> {
  const [row] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name,
      kind,
      offBudget: false,
      externalSource: "test",
      externalKey: `acc-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  return row.id;
}

async function addTx(
  userId: string,
  accountId: string,
  date: string,
  amount: string,
  postedDate: string | null = null,
) {
  await db.insert(financeTransactions).values({
    userId,
    accountId,
    transactionDate: date,
    postedDate,
    description: "ROW",
    amount,
  });
}

async function addStatement(
  userId: string,
  accountId: string,
  periodStart: string,
  periodEnd: string,
  closingBalance: string,
) {
  await db.insert(financeStatements).values({
    userId,
    accountId,
    periodStart,
    periodEnd,
    openingBalance: "0.00",
    closingBalance,
  });
}

/** A live bank balance, independent of the register (see `reconcileAccount.integration.test.ts`). */
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

/**
 * Production's shape before Task 8: openings never recorded per account, and a legacy total
 * that disagrees with the true positions by `legacyErrorCents`.
 */
async function toPreCutoverState(userId: string, legacyErrorCents: number) {
  const settings = parseBudget(await readSetting(userId, BUDGET_SCOPE));
  await db
    .update(financeAccounts)
    .set({ budgetOpeningCents: null })
    .where(eq(financeAccounts.userId, userId));
  await db
    .update(userSettings)
    .set({
      value: serializeBudget({
        startMonth: settings.startMonth,
        openingCents: settings.openingCents + legacyErrorCents,
      }),
    })
    .where(and(eq(userSettings.userId, userId), eq(userSettings.scope, BUDGET_SCOPE)));
}

/**
 * Three accounts, one per seed path:
 * - Checking: a statement closing on Jul 31, and a pre-budget register row the bank never had
 *   (the duplicate-autopay shape) — the statement must win over the register.
 * - Card: a statement closing Aug 18, walked back across rows that post on either side of it.
 * - Savings: no statement, no bank feed — seeded from the live recomputation.
 */
async function threeAccounts(userId: string) {
  const checkingId = await addAccount(userId, "Checking", "checking");
  await addTx(userId, checkingId, "2026-07-10", "1000.00", "2026-07-10");
  await addTx(userId, checkingId, "2026-06-15", "-50.00");
  await addStatement(userId, checkingId, "2026-07-01", "2026-07-31", "1000.00");
  await addTx(userId, checkingId, "2026-08-05", "200.00", "2026-08-05");
  await syncBalance(userId, checkingId, 120_000);

  const cardId = await addAccount(userId, "Card", "credit_card");
  await addTx(userId, cardId, "2026-07-30", "-20.00", "2026-08-01");
  await addTx(userId, cardId, "2026-08-05", "-70.00", "2026-08-06");
  await addTx(userId, cardId, "2026-08-10", "300.00");
  await addTx(userId, cardId, "2026-08-18", "-40.00", "2026-08-19");
  await addStatement(userId, cardId, "2026-07-19", "2026-08-18", "-500.00");
  // True Jul 31 position −730.00, plus +190.00 dated since.
  await syncBalance(userId, cardId, -54_000);

  const savingsId = await addAccount(userId, "Savings", "savings");
  await addTx(userId, savingsId, "2026-07-01", "1098.98");

  return { checkingId, cardId, savingsId };
}

function load(userId: string) {
  return loadBudget(userId, null, db, {
    todayKey: TODAY,
    includeMovementEvents: false,
  });
}

async function openingsOf(userId: string) {
  const rows = await db
    .select({ id: financeAccounts.id, opening: financeAccounts.budgetOpeningCents })
    .from(financeAccounts)
    .where(eq(financeAccounts.userId, userId));
  return new Map(rows.map((row) => [row.id, row.opening]));
}

async function cutoverEvents(userId: string) {
  return db
    .select({ id: financeAuditEvents.id })
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        eq(financeAuditEvents.kind, "budget_opening_cutover"),
      ),
    );
}

describeDb("applyLedgerOpeningCutover", () => {
  it("reports each account's opening and where it came from, and a dry run writes nothing", async () => {
    const userId = await makeUser();
    const { checkingId, cardId, savingsId } = await threeAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(userId, 12_209);
    const beforeData = await load(userId);

    const receipt = await applyLedgerOpeningCutover(userId, {
      dryRun: true,
      todayKey: TODAY,
    });

    expect(receipt.dayKey).toBe("2026-07-31");
    expect(receipt.seededCount).toBe(3);
    const byId = new Map(receipt.accounts.map((row) => [row.accountId, row]));
    expect(byId.get(checkingId)).toMatchObject({
      openingCents: 100_000,
      seed: { source: "statement", statementDateKey: "2026-07-31", crossingCents: 0 },
      registerImpliedCents: 100_000,
      mismatchCents: 0,
    });
    expect(byId.get(cardId)).toMatchObject({
      openingCents: -73_000,
      seed: {
        source: "statement",
        statementDateKey: "2026-08-18",
        crossingCents: -23_000,
      },
      statementPeriod: { start: "2026-07-19", end: "2026-08-18" },
      mismatchCents: 0,
    });
    expect(
      byId.get(cardId)?.crossingRows.map((row) => [row.amountCents, row.sign]),
    ).toEqual(
      expect.arrayContaining([
        [-7_000, -1],
        [30_000, -1],
      ]),
    );
    expect(byId.get(savingsId)).toMatchObject({
      openingCents: 109_898,
      seed: { source: "bank-headline" },
    });

    expect(receipt.before.openingCents).toBe(receipt.legacyOpeningCents);
    expect(receipt.after.openingCents).toBe(100_000 - 73_000 + 109_898);
    expect(receipt.before.readyToAssignCents - receipt.after.readyToAssignCents).toBe(
      12_209,
    );

    // Rolled back: no opening, no legacy change, no audit event, RTA as it was.
    expect([...(await openingsOf(userId)).values()]).toEqual([null, null, null]);
    const afterData = await load(userId);
    expect(afterData.settings.openingCents).toBe(beforeData.settings.openingCents);
    expect(afterData.openingCents).toBe(beforeData.openingCents);
    expect(await cutoverEvents(userId)).toHaveLength(0);
  });

  it("applies exactly what the dry run showed, audits it, and seeds nothing the second time", async () => {
    const userId = await makeUser();
    await threeAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(userId, 12_209);

    const dry = await applyLedgerOpeningCutover(userId, {
      dryRun: true,
      todayKey: TODAY,
    });
    const applied = await applyLedgerOpeningCutover(userId, { todayKey: TODAY });
    expect(applied.accounts).toEqual(dry.accounts);
    expect(applied.after).toEqual(dry.after);

    const data = await load(userId);
    expect(data.openingCents).toBe(136_898);
    expect(data.settings.openingCents).toBe(136_898);
    expect(await cutoverEvents(userId)).toHaveLength(1);

    const again = await applyLedgerOpeningCutover(userId, { todayKey: TODAY });
    expect(again.seededCount).toBe(0);
    expect(again.after).toEqual(again.before);
    expect(again.before.readyToAssignCents).toBe(applied.after.readyToAssignCents);
    expect(again.accounts.every((row) => row.recordedCents !== null)).toBe(true);
    expect(await cutoverEvents(userId)).toHaveLength(1);
  });

  it("leaves a register error since the start out of a statement-seeded opening and shows it as a mismatch", async () => {
    const userId = await makeUser();
    const { cardId } = await threeAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(userId, 0);
    // A duplicate the bank never charged, dated after the statement it is anchored on. The live
    // recomputation would fold it into the opening (−730.00 → −713.05) and hide it.
    await addTx(userId, cardId, "2026-08-25", "-16.95", "2026-08-26");

    const receipt = await applyLedgerOpeningCutover(userId, { todayKey: TODAY });
    const card = receipt.accounts.find((row) => row.accountId === cardId);
    expect(card).toMatchObject({
      openingCents: -73_000,
      registerImpliedCents: -71_305,
      mismatchCents: 1_695,
    });
    const shown = (await load(userId)).mismatch.accounts.find(
      (row) => row.accountId === cardId,
    );
    expect(shown?.mismatchCents).toBe(1_695);
  });

  it("carries charges dated before an earlier close that posted after it", async () => {
    // Production's card shape (2026-10-08 audit): a Jul 18 close, charges dated Jul 17–18
    // that posted Jul 19–20. Dated by transaction date alone they fell out of the opening.
    const userId = await makeUser();
    const cardId = await addAccount(userId, "Chase", "credit_card");
    await addTx(userId, cardId, "2026-07-16", "-88.88", "2026-07-18");
    await addTx(userId, cardId, "2026-07-17", "-35.01", "2026-07-19");
    await addTx(userId, cardId, "2026-07-18", "-25.01", "2026-07-20");
    await addTx(userId, cardId, "2026-07-25", "-10.00", "2026-07-26");
    await addTx(userId, cardId, "2026-08-02", "-5.00", "2026-08-03");
    await addStatement(userId, cardId, "2026-06-19", "2026-07-18", "-400.00");
    await addStatement(userId, cardId, "2026-07-19", "2026-08-18", "-475.02");
    await syncBalance(userId, cardId, -47_502);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(userId, 0);

    const receipt = await applyLedgerOpeningCutover(userId, {
      dryRun: true,
      todayKey: TODAY,
    });
    expect(receipt.accounts[0]).toMatchObject({
      openingCents: -47_002,
      seed: {
        source: "statement",
        statementDateKey: "2026-07-18",
        crossingCents: -7_002,
      },
      registerImpliedCents: -47_002,
      mismatchCents: 0,
    });
    expect(
      receipt.accounts[0]?.crossingRows.map((row) => row.amountCents).sort(),
    ).toEqual([-1_000, -2_501, -3_501].sort());
  });

  it("keeps an opening an account already recorded", async () => {
    const userId = await makeUser();
    const { checkingId } = await threeAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(userId, 0);
    await db
      .update(financeAccounts)
      .set({ budgetOpeningCents: 99_999 })
      .where(eq(financeAccounts.id, checkingId));

    const receipt = await applyLedgerOpeningCutover(userId, { todayKey: TODAY });
    expect(receipt.seededCount).toBe(2);
    expect(receipt.accounts.find((row) => row.accountId === checkingId)).toMatchObject({
      recordedCents: 99_999,
      seed: null,
      openingCents: 99_999,
    });
    expect((await openingsOf(userId)).get(checkingId)).toBe(99_999);
  });

  it("refuses a budget that was never set up", async () => {
    const userId = await makeUser();
    await addAccount(userId, "Checking", "checking");
    await expect(
      applyLedgerOpeningCutover(userId, { todayKey: TODAY }),
    ).rejects.toThrow(/not set up/);
  });

  it("does not read, seed, or rewrite a second user's accounts or opening", async () => {
    const owner = await makeUser();
    const ownerAccounts = await threeAccounts(owner);
    await seedBudget(owner, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(owner, 12_209);
    const ownerSettings = parseBudget(await readSetting(owner, BUDGET_SCOPE));

    const other = await makeUser();
    const otherChecking = await addAccount(other, "Other checking", "checking");
    await addTx(other, otherChecking, "2026-07-02", "5.00");
    await seedBudget(other, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await toPreCutoverState(other, 0);

    const otherReceipt = await applyLedgerOpeningCutover(other, { todayKey: TODAY });
    expect(otherReceipt.accounts.map((row) => row.accountId)).toEqual([otherChecking]);
    expect(otherReceipt.after.openingCents).toBe(500);

    // The owner is exactly as before: nothing seeded, legacy total untouched, no audit event.
    const ownerOpenings = await openingsOf(owner);
    for (const id of Object.values(ownerAccounts))
      expect(ownerOpenings.get(id)).toBeNull();
    expect(parseBudget(await readSetting(owner, BUDGET_SCOPE))).toEqual(ownerSettings);
    expect(await cutoverEvents(owner)).toHaveLength(0);

    // And the owner's own cutover leaves the other user's seeded opening alone.
    await applyLedgerOpeningCutover(owner, { todayKey: TODAY });
    expect((await openingsOf(other)).get(otherChecking)).toBe(500);
    expect(await cutoverEvents(other)).toHaveLength(1);
  });
});
