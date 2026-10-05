import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financeTransactions,
  users,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { monthKeyOf, shiftMonthKey } from "@/lib/finances/budget/envelope";
import {
  createBudgetCategory,
  updateBudgetCategory,
} from "@/lib/finances/budget/mutations";
import { regularIncomePlan } from "@/lib/finances/budget/incomePlan";
import { listBudgetStructure } from "@/lib/finances/budget/queries";
import { activeBillTotals, billRows } from "@/lib/finances/commitmentRows";
import { loadRecurringBills } from "@/lib/finances/dashboardQueries";
import { localDateKey } from "@/lib/schedule/geometry";
import {
  createSupplyGroup,
  createSupplyItem,
  createSupplyOption,
} from "../supplies/mutations";
import { createLine, createScenario, setOverride, updateLine } from "./mutations";
import {
  loadScenarioDetail,
  loadScenarioSummaries,
  seedScenarioFromSpending,
} from "./workspace";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("scenario workspace");

async function makeUser(label: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email: `scenario-ws-${label}-${crypto.randomUUID()}@example.com`,
      name: label,
    })
    .returning({ id: users.id });
  return row.id;
}

async function makeBill(
  userId: string,
  name: string,
  expectedCents: number,
  status: "active" | "paused" | "cancelled" = "active",
): Promise<string> {
  const id = await createBudgetCategory(userId, { name, kind: "bill" });
  await db
    .update(financeBudgetCategories)
    .set({ expectedCents, cadenceMonths: 1, status })
    .where(eq(financeBudgetCategories.id, id));
  return id;
}

async function makeIncome(
  userId: string,
  name: string,
  expectedMonthlyIncomeCents: number | null,
): Promise<string> {
  const id = await createBudgetCategory(userId, { name, kind: "income" });
  await updateBudgetCategory(userId, id, {
    incomeRole: "regular",
    expectedMonthlyIncomeCents,
  });
  return id;
}

/** A date in the middle of the month `monthsAgo` before this one. */
function inMonth(monthsAgo: number): string {
  return `${shiftMonthKey(monthKeyOf(localDateKey(new Date())), -monthsAgo).slice(0, 7)}-10`;
}

async function spendOnce(
  userId: string,
  accountId: string,
  envelopeId: string,
  cents: number,
  date: string,
): Promise<void> {
  await db.insert(financeTransactions).values({
    userId,
    accountId,
    transactionDate: date,
    description: `spend ${cents}`,
    amount: (-cents / 100).toFixed(2),
    budgetCategoryId: envelopeId,
  });
}

/** Spend the same amount in each of the last twelve completed months. */
async function spendMonthly(
  userId: string,
  accountId: string,
  envelopeId: string,
  cents: number,
): Promise<void> {
  for (let ago = 1; ago <= 12; ago++) {
    await spendOnce(userId, accountId, envelopeId, cents, inMonth(ago));
  }
}

describeDb("scenario workspace", () => {
  let owner = "";
  let intruder = "";
  let accountId = "";

  beforeEach(async () => {
    owner = await makeUser("owner");
    intruder = await makeUser("intruder");
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId: owner,
        name: "Checking",
        kind: "checking",
        externalSource: "csv:test",
        externalKey: "0001",
      })
      .returning({ id: financeAccounts.id });
    accountId = account.id;
  });

  afterEach(async () => {
    if (owner) await db.delete(users).where(eq(users.id, owner));
    if (intruder) await db.delete(users).where(eq(users.id, intruder));
  });

  it("starts a fresh scenario equal to the Bills page's after-bills remainder", async () => {
    await makeIncome(owner, "Pay", 480286);
    await makeBill(owner, "Rent", 210000);
    await makeBill(owner, "Phone", 5500);
    await makeBill(owner, "Old gym", 3000, "paused");
    await makeBill(owner, "Gone", 1200, "cancelled");
    const id = await createScenario(owner, "Today");

    const detail = await loadScenarioDetail(owner, id);

    // The Bills page: Regular income's known total minus the active bills' monthly total.
    const structure = await listBudgetStructure(owner);
    const income = regularIncomePlan(structure.categories);
    const bills = activeBillTotals(billRows(await loadRecurringBills(owner), [], null));
    expect(detail?.composition.remainderCents).toBe(
      income.knownCents - bills.monthlyCents,
    );
    expect(detail?.composition.remainderCents).toBe(480286 - 215500);
    expect(detail?.composition.incomplete).toBe(false);
  });

  it("reproduces the spreadsheet with Rent off and a mortgage line on", async () => {
    await makeIncome(owner, "Pay", 480286);
    const rent = await makeBill(owner, "Rent", 210000);
    await makeBill(owner, "Everything else", 100171);
    const id = await createScenario(owner, "After closing");
    await setOverride(owner, id, rent, { included: false });
    await createLine(owner, id, {
      name: "Mortgage",
      kind: "expense",
      source: {
        type: "manual",
        amountCents: 242900,
        cadence: { unit: "month", n: 1 },
      },
    });

    const detail = await loadScenarioDetail(owner, id);
    expect(detail?.composition.expenseCents).toBe(343071);
    expect(detail?.composition.remainderCents).toBe(137215);
  });

  it("follows a Supplies group by id as items are added and the group renamed", async () => {
    const group = await createSupplyGroup(owner, "Pets");
    const item = async (name: string) => {
      const itemId = await createSupplyItem(owner, {
        name,
        groupId: group,
        rate: { rateBasis: "units_per_day", unitsPerDayMilli: 1000 },
      });
      await createSupplyOption(owner, {
        itemId,
        qtyPerItem: 30,
        costPerOrderCents: 3000,
        inUse: true,
      });
    };
    await item("Cat food");
    const id = await createScenario(owner, "Today");
    await createLine(owner, id, {
      name: "Pets",
      kind: "expense",
      source: { type: "supplyGroup", supplyGroupId: group },
    });
    const before = await loadScenarioDetail(owner, id);
    await item("Litter");
    const after = await loadScenarioDetail(owner, id);
    expect(before?.composition.linesCents).toBe(3044);
    expect(after?.composition.linesCents).toBe(6088);
  });

  it("shows a linked line's 12-completed-month average and leaves out this month", async () => {
    const groceries = await createBudgetCategory(owner, { name: "Groceries" });
    await spendMonthly(owner, accountId, groceries, 60000);
    await spendOnce(owner, accountId, groceries, 99999, localDateKey(new Date()));
    const id = await createScenario(owner, "Today");
    await createLine(owner, id, {
      name: "Food",
      kind: "expense",
      source: {
        type: "manual",
        amountCents: 40000,
        cadence: { unit: "month", n: 1 },
      },
      link: { envelopeId: groceries },
    });

    const detail = await loadScenarioDetail(owner, id);
    const [line] = detail?.composition.expenseLines ?? [];
    expect(line.actualMonthlyCents).toBe(60000);
    expect(line.differenceCents).toBe(-20000);
  });

  it("names uncovered spending, and stops once a line links the envelope or its group", async () => {
    const groceries = await createBudgetCategory(owner, { name: "Groceries" });
    const fun = await createBudgetCategory(owner, { name: "Fun" });
    await spendMonthly(owner, accountId, groceries, 60000);
    await spendMonthly(owner, accountId, fun, 9000);
    const id = await createScenario(owner, "Today");

    const bare = await loadScenarioDetail(owner, id);
    expect(bare?.uncovered.map((row) => [row.name, row.monthlyCents])).toEqual([
      ["Groceries", 60000],
      ["Fun", 9000],
    ]);

    await createLine(owner, id, {
      name: "Food",
      kind: "expense",
      link: { envelopeId: groceries },
    });
    const linked = await loadScenarioDetail(owner, id);
    expect(linked?.uncovered.map((row) => row.name)).toEqual(["Fun"]);
  });

  it("accounts for a bill that is switched off rather than calling it uncovered", async () => {
    const rent = await makeBill(owner, "Rent", 210000);
    await spendMonthly(owner, accountId, rent, 210000);
    const id = await createScenario(owner, "Today");
    await setOverride(owner, id, rent, { included: false });
    const detail = await loadScenarioDetail(owner, id);
    expect(detail?.uncovered).toEqual([]);
    expect(detail?.composition.billRows[0].actualMonthlyCents).toBe(210000);
  });

  it("seeds one linked line per uncovered envelope and leaves the footer empty", async () => {
    const groceries = await createBudgetCategory(owner, { name: "Groceries" });
    const fun = await createBudgetCategory(owner, { name: "Fun" });
    await spendMonthly(owner, accountId, groceries, 60000);
    await spendMonthly(owner, accountId, fun, 9000);
    const id = await createScenario(owner, "Today");

    expect(await seedScenarioFromSpending(owner, id)).toBe(2);
    const detail = await loadScenarioDetail(owner, id);
    expect(detail?.composition.linesCents).toBe(69000);
    expect(detail?.uncovered).toEqual([]);
    // Seeding again adds nothing: everything is referenced now.
    expect(await seedScenarioFromSpending(owner, id)).toBe(0);
  });

  it("marks the remainder incomplete when Regular income has no expectation", async () => {
    await makeIncome(owner, "Pay", 400000);
    const va = await makeIncome(owner, "VA", null);
    const id = await createScenario(owner, "Today");
    const unknown = await loadScenarioDetail(owner, id);
    expect(unknown?.composition.incomplete).toBe(true);
    expect(unknown?.composition.incompleteNames).toEqual(["VA"]);

    await setOverride(owner, id, va, { included: true, monthlyCents: 18000 });
    const supplied = await loadScenarioDetail(owner, id);
    expect(supplied?.composition.incomplete).toBe(false);
    expect(supplied?.composition.incomeCents).toBe(418000);
  });

  it("lists each scenario with the remainder the detail shows", async () => {
    await makeIncome(owner, "Pay", 480286);
    await makeBill(owner, "Rent", 210000);
    const today = await createScenario(owner, "Today");
    const tight = await createScenario(owner, "Tight");
    await createLine(owner, tight, {
      name: "Mortgage",
      kind: "expense",
      source: { type: "manual", amountCents: 242900, cadence: { unit: "month", n: 1 } },
    });

    const summaries = await loadScenarioSummaries(owner);
    expect(summaries.map((row) => row.name)).toEqual(["Today", "Tight"]);
    for (const summary of summaries) {
      const detail = await loadScenarioDetail(owner, summary.id);
      expect(summary.remainderCents).toBe(detail?.composition.remainderCents);
    }
    expect(summaries.find((row) => row.id === today)?.remainderCents).toBe(270286);
    expect(summaries.find((row) => row.id === tight)?.remainderCents).toBe(27386);
  });

  it("does not show one user's scenario, or their bills, to another", async () => {
    await makeIncome(owner, "Pay", 480286);
    await makeBill(owner, "Rent", 210000);
    const id = await createScenario(owner, "Mine");
    const [line] = [await createLine(owner, id, { name: "Food", kind: "expense" })];
    await updateLine(owner, line, { name: "Food" });

    expect(await loadScenarioDetail(intruder, id)).toBeNull();
    expect(await loadScenarioSummaries(intruder)).toEqual([]);
    await expect(seedScenarioFromSpending(intruder, id)).rejects.toThrow(
      "That scenario does not exist.",
    );

    // Their own empty scenario sees none of the owner's bills or income.
    const theirs = await createScenario(intruder, "Theirs");
    const detail = await loadScenarioDetail(intruder, theirs);
    expect(detail?.composition.billRows).toEqual([]);
    expect(detail?.composition.incomeRows).toEqual([]);
    expect(detail?.composition.remainderCents).toBe(0);
  });
});
