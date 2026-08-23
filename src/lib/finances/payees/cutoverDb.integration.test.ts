import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financePayees,
  financeRecurringBills,
  financeRecurringSpend,
  financeSchedules,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createPayee } from "./mutations";
import {
  applyPayeeCutover,
  auditPayeeCutover,
  PayeeCutoverBlockedError,
} from "./cutoverDb";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("payee matcher cutover");

const userIds: string[] = [];

async function makeUser(label: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `payee-cutover-${label}-${crypto.randomUUID()}@localhost`,
      name: "Payee Cutover Test",
    })
    .returning({ id: users.id });
  userIds.push(user.id);
  return user.id;
}

async function makeAccount(userId: string): Promise<string> {
  const [account] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: crypto.randomUUID(),
    })
    .returning({ id: financeAccounts.id });
  return account.id;
}

afterAll(async () => {
  for (const userId of userIds) await db.delete(users).where(eq(users.id, userId));
});

describeDb("payee matcher cutover", () => {
  let userId: string;
  let accountId: string;

  beforeEach(async () => {
    userId = await makeUser("owner");
    accountId = await makeAccount(userId);
  });

  it("creates placeholders, assigns claims, rewrites schedules, and replays as a no-op", async () => {
    const walmart = await createPayee(userId, {
      name: "Walmart",
      aliases: ["WM SUPERCENTER"],
    });
    const [bill] = await db
      .insert(financeRecurringBills)
      .values({
        userId,
        name: "Groceries",
        matchers: ["Walmart"],
        cadenceMonths: 1,
      })
      .returning({ id: financeRecurringBills.id });
    const [spend] = await db
      .insert(financeRecurringSpend)
      .values({ userId, name: "Pizza", matchers: ["DOMINOS"] })
      .returning({ id: financeRecurringSpend.id });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-01",
      description: "Walmart",
      amount: "-40.00",
      payeeId: walmart,
    });
    await db.insert(financeSchedules).values({
      userId,
      name: "Pizza night",
      conditions: [{ field: "payee", op: "is", value: "DOMINOS" }],
      nextDate: "2026-08-28",
      sortKey: "a0",
    });

    const applied = await applyPayeeCutover(userId);
    expect(applied).toMatchObject({
      createdPayees: 1,
      assignedClaims: 2,
      rewrittenSchedules: 1,
    });
    expect(applied.finalPlan.isIdempotent).toBe(true);

    const claims = await db
      .select({
        name: financePayees.name,
        billId: financePayees.commitmentBillId,
        spendId: financePayees.commitmentSpendId,
      })
      .from(financePayees)
      .where(eq(financePayees.userId, userId));
    expect(claims).toEqual(
      expect.arrayContaining([
        { name: "Walmart", billId: bill.id, spendId: null },
        { name: "DOMINOS", billId: null, spendId: spend.id },
      ]),
    );

    const [schedule] = await db
      .select({ conditions: financeSchedules.conditions })
      .from(financeSchedules)
      .where(eq(financeSchedules.userId, userId));
    const dominos = claims.find((row) => row.name === "DOMINOS");
    const [dominosRow] = await db
      .select({ id: financePayees.id })
      .from(financePayees)
      .where(and(eq(financePayees.userId, userId), eq(financePayees.name, "DOMINOS")));
    expect(dominos).toBeDefined();
    expect(schedule.conditions).toEqual([
      { field: "payee", op: "is", value: dominosRow.id },
    ]);

    await expect(applyPayeeCutover(userId)).resolves.toMatchObject({
      createdPayees: 0,
      assignedClaims: 0,
      rewrittenSchedules: 0,
    });
  });

  it("rolls back every write when transaction parity differs", async () => {
    await createPayee(userId, { name: "Walmart", aliases: ["WALMART"] });
    await db.insert(financeRecurringBills).values({
      userId,
      name: "Groceries",
      matchers: ["Walmart"],
      cadenceMonths: 1,
    });
    await db.insert(financeTransactions).values({
      userId,
      accountId,
      transactionDate: "2026-08-01",
      description: "Walmart",
      amount: "-40.00",
      payeeId: null,
    });

    await expect(applyPayeeCutover(userId)).rejects.toBeInstanceOf(
      PayeeCutoverBlockedError,
    );

    const [payee] = await db
      .select({ billId: financePayees.commitmentBillId })
      .from(financePayees)
      .where(eq(financePayees.userId, userId));
    expect(payee.billId).toBeNull();
  });

  it("shows and changes none of another user's cutover state", async () => {
    const owner = userId;
    const intruder = await makeUser("intruder");
    const ownedPayee = await createPayee(owner, {
      name: "Netflix",
      aliases: ["NETFLIX"],
    });
    await db.insert(financeRecurringBills).values({
      userId: owner,
      name: "Netflix",
      matchers: ["Netflix"],
      cadenceMonths: 1,
    });

    const intruderAudit = await auditPayeeCutover(intruder);
    expect(intruderAudit.isIdempotent).toBe(true);
    await expect(applyPayeeCutover(intruder)).resolves.toMatchObject({
      createdPayees: 0,
      assignedClaims: 0,
      rewrittenSchedules: 0,
    });

    const [ownerAfter] = await db
      .select({ billId: financePayees.commitmentBillId })
      .from(financePayees)
      .where(and(eq(financePayees.userId, owner), eq(financePayees.id, ownedPayee)));
    expect(ownerAfter.billId).toBeNull();
  });
});
