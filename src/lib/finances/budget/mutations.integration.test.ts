import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetAllocations,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  applyBudgetTemplates,
  assignBudget,
  applyPayeeClaims,
  autoMapBudgetCategories,
  createBudgetCategory,
  createCategoryGroup,
  deleteBudgetCategory,
  deleteCategoryGroup,
  moveBudgetStructureItem,
  moveBudgetStructureItemIntoGroup,
  performBudgetOperation,
  renameCategoryGroup,
  saveEnvelopeTemplates,
  seedBudget,
  setCarryover,
  setTransactionBudgetCategory,
  setTransactionBudgetCategories,
  updateBudgetCategory,
} from "./mutations";
import { updateAccount } from "../mutations";
import {
  createPayee,
  replaceCommitmentPayees,
  setPayeeAutoCategory,
} from "../payees/mutations";
import { applyPayeeAutoCategories } from "../payees/claims";
import { loadBudget } from "./queries";
import { categoryMonth, findMonth } from "./envelope";
import { budgetChildren } from "./hierarchy";

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

/** Checking, a card, on-budget savings, and an off-budget investment. */
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
      externalSource: "test",
      externalKey: `sav-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });
  const [investment] = await db
    .insert(financeAccounts)
    .values({
      userId,
      name: "Brokerage",
      kind: "investment",
      offBudget: true,
      externalSource: "test",
      externalKey: `inv-${crypto.randomUUID()}`,
    })
    .returning({ id: financeAccounts.id });

  return {
    checkingId: checking.id,
    cardId: card.id,
    savingsId: savings.id,
    investmentId: investment.id,
  };
}

type TxSeed = {
  accountId: string;
  date: string;
  description: string;
  amount: string;
  category?: string;
  payeeId?: string;
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
        payeeId: row.payeeId ?? null,
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

  it("puts section on the envelope so the seeded Income group can be deleted", async () => {
    await seedAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const before = await loadBudget(userId, MONTH);
    const kinds = Object.fromEntries(
      before.categories.map((category) => [category.name, category.kind]),
    );
    expect(kinds).toMatchObject({
      Income: "income",
      Bills: "spending",
      Savings: "savings",
    });
    const ready = findMonth(before.months, MONTH)?.readyToAssignCents;

    const incomeGroup = before.groups.find((group) => group.name === "Income")!;
    const incomeEnvelope = before.categories.find(
      (category) => category.name === "Income",
    )!;
    const payGroupId = await createCategoryGroup(userId, { name: "Pay" });
    await moveBudgetStructureItemIntoGroup(
      userId,
      { kind: "category", id: incomeEnvelope.id },
      payGroupId,
    );
    await deleteCategoryGroup(userId, incomeGroup.id);

    const after = await loadBudget(userId, MONTH);
    expect(after.groups.some((group) => group.id === incomeGroup.id)).toBe(false);
    expect(
      after.categories.find((category) => category.id === incomeEnvelope.id)?.kind,
    ).toBe("income");
    expect(findMonth(after.months, MONTH)?.readyToAssignCents).toBe(ready);

    const savings = after.categories.find((category) => category.name === "Savings")!;
    await updateBudgetCategory(userId, savings.id, { kind: "spending" });
    await updateBudgetCategory(userId, savings.id, { kind: "savings" });
    expect(
      (await loadBudget(userId, MONTH)).categories.find(
        (category) => category.id === savings.id,
      )?.kind,
    ).toBe("savings");
  });

  it("auto-maps by category and flow, and leaves an on-budget transfer alone", async () => {
    const { checkingId, cardId, investmentId } = await seedAccounts(userId);
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
      // To an off-budget investment: leaves the pool once, so it is real spending.
      {
        accountId: checkingId,
        date: "2026-08-12",
        description: "TO BROKERAGE",
        amount: "-300.00",
        transferGroupId: "22222222-2222-4222-8222-222222222222",
        category: "Shopping",
      },
      {
        accountId: investmentId,
        date: "2026-08-12",
        description: "FROM CHECKING",
        amount: "300.00",
        transferGroupId: "22222222-2222-4222-8222-222222222222",
      },
    ]);

    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const ids = await envelopes(userId);
    const byDescription = new Map(
      (
        await db
          .select({
            id: financeTransactions.id,
            description: financeTransactions.description,
          })
          .from(financeTransactions)
          .where(eq(financeTransactions.userId, userId))
      ).map((row) => [row.description, row.id]),
    );
    await setTransactionBudgetCategory(
      userId,
      byDescription.get("PAYROLL")!,
      ids.get("Income")!,
    );
    await setTransactionBudgetCategory(
      userId,
      byDescription.get("KROGER")!,
      ids.get("Recurring spend")!,
    );
    await setTransactionBudgetCategory(
      userId,
      byDescription.get("STEAM")!,
      ids.get("Discretionary")!,
    );
    await setTransactionBudgetCategory(
      userId,
      byDescription.get("ELECTRIC")!,
      ids.get("Bills")!,
    );
    await setTransactionBudgetCategory(
      userId,
      byDescription.get("TO BROKERAGE")!,
      ids.get("Discretionary")!,
    );
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
    expect(data.uncategorizedCount).toBe(0);
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

  it("keeps an unpaired internal transfer out of the Category backlog", async () => {
    const { checkingId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "CARD PAYMENT",
        amount: "-50.00",
        flow: "internal_transfer",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });

    expect((await loadBudget(userId, MONTH)).uncategorizedCount).toBe(0);
  });

  it("only assigns a Category to the on-budget side of a boundary transfer", async () => {
    const { checkingId, cardId, savingsId, investmentId } = await seedAccounts(userId);
    const [cardOut, cardIn, savingOut, savingIn, investOut, investIn, unpaired] =
      await addTransactions(userId, [
        {
          accountId: checkingId,
          date: "2026-08-05",
          description: "CARD PAYMENT",
          amount: "-100.00",
          flow: "internal_transfer",
          transferGroupId: "11111111-1111-4111-8111-111111111111",
        },
        {
          accountId: cardId,
          date: "2026-08-05",
          description: "PAYMENT RECEIVED",
          amount: "100.00",
          flow: "internal_transfer",
          transferGroupId: "11111111-1111-4111-8111-111111111111",
        },
        {
          accountId: checkingId,
          date: "2026-08-06",
          description: "TO SAVINGS",
          amount: "-75.00",
          flow: "internal_transfer",
          transferGroupId: "22222222-2222-4222-8222-222222222222",
        },
        {
          accountId: savingsId,
          date: "2026-08-06",
          description: "FROM CHECKING",
          amount: "75.00",
          flow: "internal_transfer",
          transferGroupId: "22222222-2222-4222-8222-222222222222",
        },
        {
          accountId: checkingId,
          date: "2026-08-06",
          description: "TO BROKERAGE",
          amount: "-40.00",
          flow: "internal_transfer",
          transferGroupId: "33333333-3333-4333-8333-333333333333",
        },
        {
          accountId: investmentId,
          date: "2026-08-06",
          description: "FROM CHECKING BROKERAGE",
          amount: "40.00",
          flow: "internal_transfer",
          transferGroupId: "33333333-3333-4333-8333-333333333333",
        },
        {
          accountId: checkingId,
          date: "2026-08-07",
          description: "OLD CARD PAYMENT",
          amount: "-50.00",
          flow: "internal_transfer",
        },
      ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const categoryId = (await envelopes(userId)).get("Savings")!;

    await expect(
      setTransactionBudgetCategory(userId, cardOut, categoryId),
    ).rejects.toThrow(/Transfers between on-budget accounts/);
    await expect(
      setTransactionBudgetCategory(userId, cardIn, categoryId),
    ).rejects.toThrow(/Transfers between on-budget accounts/);
    await expect(
      setTransactionBudgetCategory(userId, unpaired, categoryId),
    ).rejects.toThrow(/Transfers between on-budget accounts/);
    await expect(
      setTransactionBudgetCategory(userId, savingOut, categoryId),
    ).rejects.toThrow(/Transfers between on-budget accounts/);
    await expect(
      setTransactionBudgetCategory(userId, savingIn, categoryId),
    ).rejects.toThrow(/Transfers between on-budget accounts/);
    await setTransactionBudgetCategory(userId, investOut, categoryId);
    await expect(
      setTransactionBudgetCategory(userId, investIn, categoryId),
    ).rejects.toThrow(/outside the envelope budget/);

    const assigned = await db
      .select({
        id: financeTransactions.id,
        categoryId: financeTransactions.budgetCategoryId,
      })
      .from(financeTransactions)
      .where(
        inArray(financeTransactions.id, [
          cardOut,
          cardIn,
          savingOut,
          savingIn,
          investOut,
          investIn,
          unpaired,
        ]),
      );
    expect(
      Object.fromEntries(assigned.map((entry) => [entry.id, entry.categoryId])),
    ).toMatchObject({
      [cardOut]: null,
      [cardIn]: null,
      [savingOut]: null,
      [savingIn]: null,
      [investOut]: categoryId,
      [investIn]: null,
      [unpaired]: null,
    });
  });

  it("fills an uncategorised charge from the payee's fixed default", async () => {
    const { checkingId } = await seedAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const ids = await envelopes(userId);
    const discretionaryId = ids.get("Discretionary");
    if (!discretionaryId) throw new Error("Discretionary fixture envelope is missing.");
    const payeeId = await createPayee(userId, { name: "Kroger" });
    await setPayeeAutoCategory(userId, payeeId, {
      mode: "fixed",
      defaultBudgetCategoryId: discretionaryId,
    });
    const [txId] = await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "KROGER",
        amount: "-50.00",
        payeeId,
      },
    ]);
    await applyPayeeAutoCategories(userId);
    const [row] = await db
      .select({ budgetCategoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, txId));
    expect(row?.budgetCategoryId).toBe(discretionaryId);
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
    const ids = await envelopes(userId);
    const [kroger] = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.description, "KROGER"),
        ),
      );
    await setTransactionBudgetCategory(userId, kroger.id, ids.get("Recurring spend")!);
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

    const budget = await loadBudget(userId, MONTH);
    const august = findMonth(budget.months, MONTH)!;
    expect(categoryMonth(august, ids.get("Bills")!).assignedCents).toBe(10_000);
    expect(august.readyToAssignCents).toBe(0);
    expect(budget.movementNotes).toContain("Bills");
  });

  it("assigns into a future month and leaves current Ready to Assign", async () => {
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
    const bills = { id: ids.get("Bills")!, name: "Bills" };

    await performBudgetOperation(userId, {
      kind: "assign",
      month: "2026-09-01",
      category: bills,
      amountCents: 20_000,
    });
    const data = await loadBudget(userId, MONTH);
    const august = findMonth(data.months, MONTH)!;
    const september = findMonth(data.months, "2026-09-01")!;
    expect(august.assignedInFutureMonthsCents).toBe(20_000);
    expect(august.readyToAssignCents).toBe(30_000);
    expect(categoryMonth(september, bills.id).assignedCents).toBe(20_000);

    await expect(
      performBudgetOperation(await makeUser(), {
        kind: "assign",
        month: "2026-09-01",
        category: bills,
        amountCents: 1,
      }),
    ).rejects.toThrow();
    expect(
      categoryMonth(
        findMonth((await loadBudget(userId, "2026-09-01")).months, "2026-09-01")!,
        bills.id,
      ).assignedCents,
    ).toBe(20_000);
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
    const ids = await envelopes(userId);
    await setTransactionBudgetCategory(userId, txId, ids.get("Recurring spend")!);
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
    const ids = await envelopes(userId);
    const [steam] = await db
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.description, "STEAM"),
        ),
      );
    await setTransactionBudgetCategory(userId, steam.id, ids.get("Discretionary")!);

    let august = findMonth((await loadBudget(userId, MONTH)).months, MONTH)!;
    expect(categoryMonth(august, ids.get("Discretionary")!).activityCents).toBe(-4_000);

    await updateAccount(userId, cardId, { kind: "investment", offBudget: true });
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

  it("round-trips a weekly line and keeps it from a second user", async () => {
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const ids = await envelopes(userId);
    const groceries = ids.get("Recurring spend")!;
    const weekly = {
      id: "w1",
      directive: "template" as const,
      type: "weekly" as const,
      priority: 0,
      amountCents: 18_000,
      weekday: 0,
    };

    await saveEnvelopeTemplates(userId, groceries, [weekly]);

    const stored = (await loadBudget(userId, MONTH)).categories.find(
      (row) => row.id === groceries,
    );
    expect(stored?.templates).toEqual([weekly]);

    // A second user must fail to read it, change it, or clear it.
    const intruderId = await makeUser();
    expect(
      (await loadBudget(intruderId, MONTH)).categories.find(
        (row) => row.id === groceries,
      ),
    ).toBeUndefined();
    await expect(
      saveEnvelopeTemplates(intruderId, groceries, [
        { ...weekly, amountCents: 100, weekday: 3 },
      ]),
    ).rejects.toThrow(/does not exist/);
    await expect(saveEnvelopeTemplates(intruderId, groceries, [])).rejects.toThrow(
      /does not exist/,
    );

    const after = (await loadBudget(userId, MONTH)).categories.find(
      (row) => row.id === groceries,
    );
    expect(after?.templates).toEqual([weekly]);
  });

  it("Underfunded clamps to Ready to Assign and keeps the full ask as the goal", async () => {
    const { checkingId } = await seedAccounts(userId);
    await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-07-01",
        description: "OPENING",
        amount: "50.00",
      },
    ]);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const ids = await envelopes(userId);
    const bills = ids.get("Bills")!;
    const fun = ids.get("Discretionary")!;

    await saveEnvelopeTemplates(userId, bills, [
      {
        id: "t1",
        directive: "template",
        type: "simple",
        priority: 0,
        monthlyCents: 40_000,
      },
    ]);
    await saveEnvelopeTemplates(userId, fun, [
      {
        id: "t2",
        directive: "template",
        type: "simple",
        priority: 0,
        monthlyCents: 40_000,
      },
    ]);

    const result = await assignBudget(userId, {
      month: MONTH,
      option: "underfunded",
    });
    expect(result.applied).toBe(1);

    const data = await loadBudget(userId, MONTH);
    const month = findMonth(data.months, MONTH)!;
    expect(month.readyToAssignCents).toBe(0);
    expect(categoryMonth(month, bills).assignedCents).toBe(5_000);
    expect(categoryMonth(month, fun).assignedCents).toBe(0);
    expect(data.goals[`${MONTH}|${bills}`]).toBe(40_000);
  });

  it("nests and reorders groups and envelopes without changing their money", async () => {
    await seedAccounts(userId);
    await seedBudget(userId, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const before = await loadBudget(userId, MONTH);
    const spending = before.groups.find((group) => group.name === "Spending")!;
    const income = before.groups.find((group) => group.name === "Income")!;
    const billsEnvelope = before.categories.find(
      (category) => category.name === "Bills",
    )!;

    const billsGroupId = await createCategoryGroup(userId, {
      name: "Bill groups",
      parentGroupId: spending.id,
    });
    const utilitiesId = await createCategoryGroup(userId, {
      name: "Utilities",
      parentGroupId: billsGroupId,
    });
    await moveBudgetStructureItemIntoGroup(
      userId,
      { kind: "category", id: billsEnvelope.id },
      utilitiesId,
    );

    const nested = await loadBudget(userId, MONTH);
    expect(
      nested.groups.find((group) => group.id === billsGroupId)?.parentGroupId,
    ).toBe(spending.id);
    expect(nested.groups.find((group) => group.id === utilitiesId)?.parentGroupId).toBe(
      billsGroupId,
    );
    expect(nested.categories.find((row) => row.id === billsEnvelope.id)?.groupId).toBe(
      utilitiesId,
    );
    expect(findMonth(nested.months, MONTH)?.readyToAssignCents).toBe(
      findMonth(before.months, MONTH)?.readyToAssignCents,
    );

    await expect(deleteCategoryGroup(userId, billsGroupId)).rejects.toThrow(
      "Move everything out",
    );
    await expect(
      moveBudgetStructureItem(
        userId,
        { kind: "group", id: billsGroupId },
        { kind: "group", id: utilitiesId },
        "inside",
      ),
    ).rejects.toThrow("cannot move");
    await expect(
      moveBudgetStructureItem(
        userId,
        { kind: "category", id: billsEnvelope.id },
        { kind: "group", id: income.id },
        "inside",
      ),
    ).rejects.toThrow("cannot move");

    await moveBudgetStructureItemIntoGroup(
      userId,
      { kind: "category", id: billsEnvelope.id },
      spending.id,
    );
    await deleteCategoryGroup(userId, utilitiesId);
    await deleteCategoryGroup(userId, billsGroupId);
    const flattened = await loadBudget(userId, MONTH);
    expect(flattened.groups.some((row) => row.id === billsGroupId)).toBe(false);

    const discretionary = flattened.categories.find(
      (category) => category.name === "Discretionary",
    )!;
    await moveBudgetStructureItem(
      userId,
      { kind: "category", id: billsEnvelope.id },
      { kind: "category", id: discretionary.id },
      "before",
    );
    const reordered = await loadBudget(userId, MONTH);
    const spendingOrder = budgetChildren(
      reordered.groups,
      reordered.categories,
      spending.id,
    ).map((child) => child.id);
    expect(spendingOrder.indexOf(billsEnvelope.id)).toBe(
      spendingOrder.indexOf(discretionary.id) - 1,
    );
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
    payeeId: string;
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
    if (group?.id == null)
      throw new Error("expected the seeded Bills envelope to have a group");

    owned = {
      groupId: group.id,
      categoryId: ids.get("Bills")!,
      transactionId: txId,
      accountId: checkingId,
      payeeId: await createPayee(ownerId, { name: "Isolation Payee" }),
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
    expect(data.accountPoolCents).toBe(0);
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
      createCategoryGroup(intruderId, {
        name: "Smuggled",
        parentGroupId: owned.groupId,
      }),
    ).rejects.toThrow(/does not exist/);
    await expect(
      moveBudgetStructureItemIntoGroup(
        intruderId,
        { kind: "category", id: owned.categoryId },
        owned.groupId,
      ),
    ).rejects.toThrow(/does not exist/);
    await expect(
      moveBudgetStructureItem(
        intruderId,
        { kind: "category", id: owned.categoryId },
        { kind: "group", id: owned.groupId },
        "inside",
      ),
    ).rejects.toThrow(/does not exist/);
    await expect(
      setTransactionBudgetCategory(intruderId, owned.transactionId, owned.categoryId),
    ).rejects.toThrow(/does not exist/);
    await expect(
      setTransactionBudgetCategories(
        intruderId,
        [owned.transactionId],
        owned.categoryId,
      ),
    ).rejects.toThrow(/does not exist/);
    await expect(
      setPayeeAutoCategory(intruderId, owned.payeeId, {
        mode: "fixed",
        defaultBudgetCategoryId: owned.categoryId,
      }),
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
    await expect(
      assignBudget(intruderId, { month: MONTH, option: "underfunded" }),
    ).rejects.toThrow();
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

    expect((await envelopes(intruderId)).size).toBe(24);
    expect((await envelopes(ownerId)).size).toBe(5);
  });
});

describeDb("applyPayeeClaims", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  /** A claimed payee with one charge inside the budget window and one before it. */
  async function seedClaim(owner: string) {
    const { checkingId, investmentId } = await seedAccounts(owner);
    await seedBudget(owner, { preset: "minimal", startMonth: MONTH, todayKey: TODAY });
    const byName = await envelopes(owner);
    const rent = byName.get("Bills") ?? [...byName.values()][0];
    const payeeId = await createPayee(owner, { name: "Landlord" });
    const [inWindow, beforeWindow, offBudget] = await addTransactions(owner, [
      {
        accountId: checkingId,
        date: "2026-08-05",
        description: "RENT",
        amount: "-900.00",
      },
      {
        accountId: checkingId,
        date: "2026-07-05",
        description: "RENT",
        amount: "-900.00",
      },
      {
        accountId: investmentId,
        date: "2026-08-06",
        description: "RENT",
        amount: "-900.00",
      },
    ]);
    await db
      .update(financeTransactions)
      .set({ payeeId })
      .where(eq(financeTransactions.userId, owner));
    await replaceCommitmentPayees(owner, { id: rent }, [payeeId]);
    return {
      rent,
      payeeId,
      inWindow,
      beforeWindow,
      offBudget,
      byName,
      checkingId,
    };
  }

  async function envelopeOf(id: string): Promise<string | null> {
    const [row] = await db
      .select({ categoryId: financeTransactions.budgetCategoryId })
      .from(financeTransactions)
      .where(eq(financeTransactions.id, id));
    return row?.categoryId ?? null;
  }

  it("files in-window and pre-start charges when the payee is claimed", async () => {
    const { rent, inWindow, beforeWindow, offBudget } = await seedClaim(userId);
    expect(await envelopeOf(inWindow)).toBe(rent);
    expect(await envelopeOf(beforeWindow)).toBe(rent);
    expect(await envelopeOf(offBudget)).toBeNull();
  });

  it("moves a later charge that arrived after the claim", async () => {
    const { rent, payeeId, checkingId } = await seedClaim(userId);
    const [fresh] = await addTransactions(userId, [
      {
        accountId: checkingId,
        date: "2026-08-20",
        description: "RENT",
        amount: "-900.00",
      },
    ]);
    await db
      .update(financeTransactions)
      .set({ payeeId })
      .where(eq(financeTransactions.id, fresh));

    expect(await envelopeOf(fresh)).toBeNull();
    expect(await applyPayeeClaims(userId)).toEqual({ moved: 1 });
    expect(await envelopeOf(fresh)).toBe(rent);
  });

  it("is idempotent — a second run moves nothing", async () => {
    await seedClaim(userId);
    expect(await applyPayeeClaims(userId)).toEqual({ moved: 0 });
  });

  it("will not file a second user's charges, or read their claims", async () => {
    const { inWindow } = await seedClaim(userId);
    const { inWindow: intruderCharge } = await seedClaim(await makeUser());

    expect(await envelopeOf(inWindow)).not.toBe(await envelopeOf(intruderCharge));
    expect(await applyPayeeClaims(await makeUser())).toEqual({ moved: 0 });
  });
});
