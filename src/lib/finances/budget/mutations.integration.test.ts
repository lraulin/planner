import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createSchedule } from "../schedules/mutations";
import type { ScheduleCondition } from "../schedules/conditions";
import { createPayee } from "../payees/mutations";
import {
  addTemplatesFromSchedules,
  applyBudgetTemplates,
  autoMapBudgetCategories,
  createBudgetCategory,
  deleteBudgetCategory,
  deleteCategoryGroup,
  performBudgetOperation,
  renameCategoryGroup,
  saveEnvelopeTemplates,
  seedBudget,
  setCarryover,
  setTransactionBudgetCategory,
  updateBudgetCategory,
} from "./mutations";
import { updateAccount } from "../mutations";
import { loadBudget } from "./queries";
import { categoryMonth, findMonth } from "./envelope";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("budget mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `budget-${crypto.randomUUID()}@localhost`,
      name: "Budget Test",
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

/** Checking with a starting deposit, a card, and a savings account that is off-budget. */
async function seedAccounts(userId: string) {
  const [checking] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Checking",
      kind: "checking",
      externalSource: "test",
      externalKey: `chk-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  const [card] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Card",
      kind: "credit_card",
      externalSource: "test",
      externalKey: `card-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  const [savings] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Savings",
      kind: "savings",
      offBudget: true,
      externalSource: "test",
      externalKey: `sav-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });

  return { checkingId: checking.id, cardId: card.id, savingsId: savings.id };
}

type TxSeed = {
  accountId: string;
  date: string;
  description: string;
  amount: string;
  category?: string;
  flow?: "spend" | "income" | "internal_transfer";
  transferGroupId?: string;
};

async function addTransactions(userId: string, rows: TxSeed[]): Promise<string[]> {
  const inserted = await db
    .insert(financeTransactions)
    .values(
      rows.map((row) => ({
        userId,
        accountId: row.accountId,
        transactionDate: row.date,
        description: row.description,
        amount: row.amount,
        category: row.category ?? null,
        derivedFlow: row.flow ?? null,
        transferGroupId: row.transferGroupId ?? null,
      })),
    )
    .returning({ id: financeTransactions.id });
  return inserted.map((row) => row.id);
}

async function envelopes(userId: string) {
  const rows = await db
    .select({ id: financeBudgetCategories.id, name: financeBudgetCategories.name })
    .from(financeBudgetCategories)
    .where(eq(financeBudgetCategories.userId, userId));
  return new Map(rows.map((row) => [row.name, row.id]));
}

describeDb("budget mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("seeds a budget and records the opening position once", async () => {
    const { checkingId, cardId } = await seedAccounts(userId);
    // July money, so it lands in the opening figure rather than in August's activity.
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-07-15",
        description: "OPENING",
        amount: "1500.00",
      },
      { accountId: cardId, date: "2026-07-20", description: "CARD", amount: "-200.00" },
    ]);

    const result = await seedBudget(userId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });
    expect(result.openingCents).toBe(130_000);
    expect(result.categoryCount).toBe(5);

    const data = await loadBudget(userId, MONTH);
    expect(data.configured).toBe(true);
    expect(findMonth(data.months, MONTH)?.readyToAssignCents).toBe(130_000);
  });

  it("refuses to seed twice", async () => {
    await seedAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await expect(
      seedBudget(userId, { preset: "detailed", startMonth: MONTH, todayKey: TODAY }),
    ).rejects.toThrow(/already been set up/);
  });

  it("auto-maps by category and flow, and leaves an on-budget transfer alone", async () => {
    const { checkingId, cardId, savingsId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-02",
        description: "PAYROLL",
        amount: "2000.00",
        flow: "income",
      },
      {
        accountId: cardId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-120.00",
        category: "Groceries",
      },
      {
        accountId: cardId,
        date: "2026-08-06",
        description: "STEAM",
        amount: "-40.00",
        category: "Games",
      },
      {
        accountId: checkingId,
        date: "2026-08-07",
        description: "ELECTRIC",
        amount: "-90.00",
        category: "Utilities",
      },
      // Card payment: both legs on-budget, so neither is budget activity.
      {
        accountId: checkingId,
        date: "2026-08-10",
        description: "CARD PAYMENT",
        amount: "-160.00",
        transferGroupId: "11111111-1111-4111-8111-111111111111",
        category: "Groceries",
      },
      {
        accountId: cardId,
        date: "2026-08-10",
        description: "PAYMENT THANK YOU",
        amount: "160.00",
        transferGroupId: "11111111-1111-4111-8111-111111111111",
      },
      // To savings: leaves the budget, so it is real spending once someone envelopes it.
      {
        accountId: checkingId,
        date: "2026-08-12",
        description: "TO SAVINGS",
        amount: "-300.00",
        transferGroupId: "22222222-2222-4222-8222-222222222222",
        category: "Shopping",
      },
      {
        accountId: savingsId,
        date: "2026-08-12",
        description: "FROM CHECKING",
        amount: "300.00",
        transferGroupId: "22222222-2222-4222-8222-222222222222",
      },
    ]);

    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const mapped = await autoMapBudgetCategories(userId, MONTH);
    expect(mapped.placed).toBe(5);

    const ids = await envelopes(userId);
    const data = await loadBudget(userId, MONTH);
    const august = findMonth(data.months, MONTH)!;

    expect(august.totalIncomeCents).toBe(200_000);
    expect(categoryMonth(august, ids.get("Recurring spend")!).activityCents).toBe(
      -12_000,
    );
    expect(categoryMonth(august, ids.get("Discretionary")!).activityCents).toBe(
      -34_000,
    );
    expect(categoryMonth(august, ids.get("Bills")!).activityCents).toBe(-9_000);

    // The card payment stayed out of the budget despite carrying a category.
    expect(data.uncategorizedCount).toBe(2);
  });

  it("does not move a transaction someone placed by hand", async () => {
    const { checkingId } = await seedAccounts(userId);
    const [txId] = await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-50.00",
        category: "Groceries",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const ids = await envelopes(userId);
    await setTransactionBudgetCategory(userId, txId, ids.get("Savings")!);
    const mapped = await autoMapBudgetCategories(userId, MONTH);

    expect(mapped.placed).toBe(0);
    const [row] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, txId));
    expect(row?.budgetCategoryId).toBe(ids.get("Savings"));
  });

  it("assigns, covers, and moves money without changing the total", async () => {
    const { checkingId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-07-01",
        description: "OPENING",
        amount: "1000.00",
      },
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-350.00",
        category: "Groceries",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await autoMapBudgetCategories(userId, MONTH);

    const ids = await envelopes(userId);
    const food = { id: ids.get("Recurring spend")!, name: "Recurring spend" };
    const fun = { id: ids.get("Discretionary")!, name: "Discretionary" };

    await performBudgetOperation(userId, {
      kind: "assign",
      month: MONTH,
      category: food,
      amountCents: 20_000,
    });
    await performBudgetOperation(userId, {
      kind: "assign",
      month: MONTH,
      category: fun,
      amountCents: 30_000,
    });

    let august = findMonth((await loadBudget(userId, MONTH)).months, MONTH)!;
    expect(categoryMonth(august, food.id).balanceCents).toBe(-15_000);
    expect(august.readyToAssignCents).toBe(50_000);

    const covered = await performBudgetOperation(userId, {
      kind: "cover",
      month: MONTH,
      from: fun,
      to: food,
    });
    expect(covered.applied).toBe(true);
    expect(covered.note).toContain(
      "Covered $150.00 of Recurring spend from Discretionary",
    );

    august = findMonth((await loadBudget(userId, MONTH)).months, MONTH)!;
    expect(categoryMonth(august, food.id).balanceCents).toBe(0);
    expect(categoryMonth(august, fun.id).balanceCents).toBe(15_000);
    // A move between envelopes changes nothing outside them.
    expect(august.readyToAssignCents).toBe(50_000);
  });

  it("clamps an assignment from Ready to Assign against what is stored, not what was sent", async () => {
    const { checkingId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-07-01",
        description: "OPENING",
        amount: "100.00",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    const ids = await envelopes(userId);
    await performBudgetOperation(userId, {
      kind: "assign-remaining",
      month: MONTH,
      to: { id: ids.get("Bills")!, name: "Bills" },
      amountCents: 999_999,
    });

    const august = findMonth((await loadBudget(userId, MONTH)).months, MONTH)!;
    expect(categoryMonth(august, ids.get("Bills")!).assignedCents).toBe(10_000);
    expect(august.readyToAssignCents).toBe(0);
  });

  it("holds money for next month and hands it back", async () => {
    const { checkingId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-07-01",
        description: "OPENING",
        amount: "500.00",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    await performBudgetOperation(userId, {
      kind: "hold",
      month: MONTH,
      amountCents: 20_000,
    });
    const data = await loadBudget(userId, MONTH);
    expect(findMonth(data.months, MONTH)?.readyToAssignCents).toBe(30_000);
    expect(findMonth(data.months, "2026-09-01")?.fromLastMonthCents).toBe(50_000);

    await performBudgetOperation(userId, { kind: "release-hold", month: MONTH });
    expect(
      findMonth((await loadBudget(userId, MONTH)).months, MONTH)?.readyToAssignCents,
    ).toBe(50_000);
  });

  it("sets carryover on this month and every later one", async () => {
    await seedAccounts(userId);
    await seedBudget(userId, {
      preset: "minimal",
      startMonth: "2026-06-01",
      todayKey: TODAY,
    });
    const ids = await envelopes(userId);
    const food = { id: ids.get("Recurring spend")!, name: "Recurring spend" };

    for (const month of ["2026-06-01", "2026-07-01", MONTH]) {
      await performBudgetOperation(userId, {
        kind: "assign",
        month,
        category: food,
        amountCents: 10_000,
      });
    }

    await setCarryover(userId, {
      month: "2026-07-01",
      categoryId: food.id,
      carryover: true,
    });

    const rows = await db
      .select({
        month: financeBudgetAllocations.month,
        carryover: financeBudgetAllocations.carryover,
      })
      .from(financeBudgetAllocations)
      .where(eq(financeBudgetAllocations.categoryId, food.id));
    const byMonth = new Map(rows.map((row) => [row.month, row.carryover]));

    // Not retroactive: June's hand-off to July was governed by June's flag.
    expect(byMonth.get("2026-06-01")).toBe(false);
    expect(byMonth.get("2026-07-01")).toBe(true);
    expect(byMonth.get(MONTH)).toBe(true);
  });

  it("keeps a transaction when its envelope is deleted", async () => {
    const { checkingId } = await seedAccounts(userId);
    const [txId] = await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-50.00",
        category: "Groceries",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await autoMapBudgetCategories(userId, MONTH);

    const ids = await envelopes(userId);
    await deleteBudgetCategory(userId, ids.get("Recurring spend")!);

    const [row] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, txId));
    // Deleting a bucket must never delete the money that went through it.
    expect(row).toBeDefined();
    expect(row?.budgetCategoryId).toBeNull();
  });

  it("excludes an account the moment it is taken off budget", async () => {
    const { checkingId, cardId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-50.00",
        category: "Groceries",
      },
      {
        accountId: cardId,
        date: "2026-08-06",
        description: "STEAM",
        amount: "-40.00",
        category: "Games",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    await autoMapBudgetCategories(userId, MONTH);

    const ids = await envelopes(userId);
    let august = findMonth((await loadBudget(userId, MONTH)).months, MONTH)!;
    expect(categoryMonth(august, ids.get("Discretionary")!).activityCents).toBe(-4_000);

    await updateAccount(userId, cardId, { offBudget: true });
    august = findMonth((await loadBudget(userId, MONTH)).months, MONTH)!;
    expect(categoryMonth(august, ids.get("Discretionary")!).activityCents).toBe(0);
  });

  it("applies a simple template and records the goal", async () => {
    const { checkingId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-07-01",
        description: "OPENING",
        amount: "500.00",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const ids = await envelopes(userId);
    const bills = ids.get("Bills")!;

    await saveEnvelopeTemplates(userId, bills, [
      {
        id: "t1",
        directive: "template",
        type: "simple",
        priority: 0,
        monthlyCents: 12_000,
      },
    ]);

    const result = await applyBudgetTemplates(userId, { month: MONTH, force: false });
    expect(result.applied).toBe(1);

    const data = await loadBudget(userId, MONTH);
    const cell = categoryMonth(findMonth(data.months, MONTH)!, bills);
    expect(cell.assignedCents).toBe(12_000);
    expect(data.goals[`${MONTH}|${bills}`]).toBe(12_000);
  });

  it("adds schedule templates onto Bills and skips a second run", async () => {
    await seedAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const payeeId = await createPayee(userId, {
      name: "Netflix",
      aliases: ["NETFLIX"],
    });
    const conditions: ScheduleCondition[] = [
      {
        field: "date",
        op: "isapprox",
        value: { frequency: "monthly", start: "2026-01-15" },
      },
      { field: "payee", op: "is", value: payeeId },
      { field: "amount", op: "isapprox", value: -1599 },
    ];
    await createSchedule(userId, { name: "Netflix", conditions }, TODAY);

    const first = await addTemplatesFromSchedules(userId, {});
    expect(first.added).toBe(1);
    const second = await addTemplatesFromSchedules(userId, {});
    expect(second.added).toBe(0);

    const data = await loadBudget(userId, MONTH);
    const bills = data.categories.find((category) => category.name === "Bills");
    expect(bills?.templates).toHaveLength(1);
    expect(bills?.templates[0]).toMatchObject({ type: "schedule" });
  });
});

describeDb("budget mutations — cross-user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let owned: {
    groupId: string;
    categoryId: string;
    transactionId: string;
    accountId: string;
  };

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();

    const { checkingId } = await seedAccounts(ownerId);
    const [txId] = await addTransactions(ownerId, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-50.00",
        category: "Groceries",
      },
    ]);
    await seedBudget(ownerId, {
      preset: "minimal",
      startMonth: MONTH,
      todayKey: TODAY,
    });
    await autoMapBudgetCategories(ownerId, MONTH);

    const ids = await envelopes(ownerId);
    const [group] = await db
      .select({ id: financeBudgetCategories.groupId })
      .from(financeBudgetCategories)
      .where(eq(financeBudgetCategories.id, ids.get("Bills")!));

    owned = {
      groupId: group.id,
      categoryId: ids.get("Bills")!,
      transactionId: txId,
      accountId: checkingId,
    };
  });

  it("shows the intruder nothing of the owner's budget", async () => {
    // Templates and applied goals ride on the same read, so the owner has both here: an
    // envelope whose templates leaked would leak the schedules they name along with them.
    await saveEnvelopeTemplates(ownerId, owned.categoryId, [
      {
        id: "t1",
        directive: "template",
        type: "simple",
        priority: 0,
        monthlyCents: 900,
      },
    ]);
    await applyBudgetTemplates(ownerId, { month: MONTH, force: true });

    const data = await loadBudget(intruderId, MONTH);
    expect(data.configured).toBe(false);
    expect(data.groups).toEqual([]);
    expect(data.categories).toEqual([]);
    expect(data.goals).toEqual({});
    expect(data.onBudgetPositionCents).toBe(0);
  });

  it("refuses every write against the owner's rows", async () => {
    const ref = { id: owned.categoryId, name: "Bills" };

    await expect(
      performBudgetOperation(intruderId, {
        kind: "assign",
        month: MONTH,
        category: ref,
        amountCents: 5_000,
      }),
    ).rejects.toThrow();
    await expect(
      setCarryover(intruderId, {
        month: MONTH,
        categoryId: owned.categoryId,
        carryover: true,
      }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      updateBudgetCategory(intruderId, owned.categoryId, { name: "Stolen" }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      renameCategoryGroup(intruderId, owned.groupId, "Stolen"),
    ).rejects.toThrow(/does not exist/);
    await expect(
      createBudgetCategory(intruderId, { groupId: owned.groupId, name: "Smuggled" }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      setTransactionBudgetCategory(intruderId, owned.transactionId, owned.categoryId),
    ).rejects.toThrow(/does not exist/);
    await expect(
      saveEnvelopeTemplates(intruderId, owned.categoryId, [
        {
          id: "t1",
          directive: "template",
          type: "simple",
          priority: 0,
          monthlyCents: 100,
        },
      ]),
    ).rejects.toThrow(/does not exist/);
    await expect(
      applyBudgetTemplates(intruderId, { month: MONTH, force: true }),
    ).rejects.toThrow();
    await expect(addTemplatesFromSchedules(intruderId, {})).rejects.toThrow();
    await expect(
      updateAccount(intruderId, owned.accountId, { offBudget: true }),
    ).rejects.toThrow();
  });

  it("refuses every delete against the owner's rows", async () => {
    await expect(deleteBudgetCategory(intruderId, owned.categoryId)).rejects.toThrow(
      /does not exist/,
    );
    await expect(deleteCategoryGroup(intruderId, owned.groupId)).rejects.toThrow(
      /does not exist/,
    );

    // And nothing was quietly removed on the way past.
    const remaining = await envelopes(ownerId);
    expect(remaining.size).toBe(5);
  });

  it("leaves the owner's data untouched after every attempt", async () => {
    const before = await loadBudget(ownerId, MONTH);
    const ids = await envelopes(ownerId);

    await expect(
      performBudgetOperation(intruderId, {
        kind: "cover",
        month: MONTH,
        from: null,
        to: { id: owned.categoryId, name: "Bills" },
      }),
    ).rejects.toThrow();

    const after = await loadBudget(ownerId, MONTH);
    expect(after.categories.map((row) => row.id).sort()).toEqual(
      [...ids.values()].sort(),
    );
    expect(findMonth(after.months, MONTH)?.readyToAssignCents).toBe(
      findMonth(before.months, MONTH)?.readyToAssignCents,
    );
  });

  it("keeps the intruder's own budget separate", async () => {
    // The intruder can seed their own; the owner's stays exactly as it was.
    await seedAccounts(intruderId);
    await seedBudget(intruderId, {
      preset: "detailed",
      startMonth: MONTH,
      todayKey: TODAY,
    });

    expect((await envelopes(intruderId)).size).toBe(21);
    expect((await envelopes(ownerId)).size).toBe(5);
  });
});
