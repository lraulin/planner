import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  financeAccounts,
  financeTransactions,
  financeBudgetAllocations,
} from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  createBudgetCategory,
  createCategoryGroup,
  updateBudgetCategory,
  deleteBudgetCategory,
  seedBudget,
} from "./budget/mutations";
import { loadBudget } from "./budget/queries";
import { categoryMonth, findMonth } from "./budget/envelope";
import { loadInsightsRows, loadBillForecast } from "./dashboardQueries";
import {
  listTransactions,
  loadRegisterPrepared,
  loadRegisterExportRows,
} from "./queries";
import { upsertBillEnvelope } from "./mutations";
import { reportContributionIds, type ReportDrill } from "./reportDrill";
import {
  cashMovementSummary,
  spendingContributions,
  sumReportActivity,
} from "./reports";
import { createPayee, replaceCommitmentPayees } from "./payees/mutations";
const reachable = await databaseReachable();
if (!reachable) warnDatabaseSkipped("envelope workflow");
const describeDb = reachable ? describe : describe.skip;
const created: string[] = [];
async function user() {
  const [row] = await db
    .insert(users)
    .values({
      email: `envelope-workflow-${crypto.randomUUID()}@localhost`,
      name: "Workflow test",
    })
    .returning();
  created.push(row.id);
  return row.id;
}
afterAll(async () => {
  for (const id of created) await db.delete(users).where(eq(users.id, id));
});
describeDb("envelope workflow", () => {
  it("stores income planning only on the owner's income envelopes and never changes assignments", async () => {
    const owner = await user(),
      other = await user();
    const income = await createBudgetCategory(owner, {
      name: "Payroll",
      kind: "income",
    });
    const expense = await createBudgetCategory(owner, { name: "Food" });
    expect(
      (await loadBudget(owner, null)).categories.find((row) => row.id === income),
    ).toMatchObject({ incomeRole: "other", expectedMonthlyIncomeCents: null });
    await updateBudgetCategory(owner, income, {
      incomeRole: "regular",
      expectedMonthlyIncomeCents: 450000,
    });
    expect(
      (await loadBudget(owner, null)).categories.find((row) => row.id === income),
    ).toMatchObject({ incomeRole: "regular", expectedMonthlyIncomeCents: 450000 });
    expect((await loadBudget(other, null)).categories).toEqual([]);
    await expect(
      updateBudgetCategory(other, income, {
        incomeRole: "other",
        expectedMonthlyIncomeCents: 1,
      }),
    ).rejects.toThrow();
    await expect(deleteBudgetCategory(other, income)).rejects.toThrow();
    await expect(
      updateBudgetCategory(owner, expense, { incomeRole: "regular" }),
    ).rejects.toThrow();
    for (const amount of [-1, 1.5, 2147483648])
      await expect(
        updateBudgetCategory(owner, income, { expectedMonthlyIncomeCents: amount }),
      ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(financeBudgetAllocations)
        .where(eq(financeBudgetAllocations.userId, owner)),
    ).toEqual([]);
    await deleteBudgetCategory(owner, income);
  });
  it("reports the same money leaves as Budget and the Register with refunds, splits and transfers", async () => {
    const owner = await user(),
      other = await user();
    const [checking, savings] = await db
      .insert(financeAccounts)
      .values([
        {
          userId: owner,
          name: "Checking",
          kind: "checking",
          externalSource: "test",
          externalKey: "checking",
        },
        {
          userId: owner,
          name: "Savings",
          kind: "savings",
          externalSource: "test",
          externalKey: "savings",
        },
      ])
      .returning();
    await seedBudget(owner, {
      preset: "minimal",
      startMonth: "2026-08-01",
      todayKey: "2026-08-22",
    });
    const food = await createBudgetCategory(owner, { name: "Test food" }),
      house = await createBudgetCategory(owner, { name: "House", kind: "savings" }),
      gift = await createBudgetCategory(owner, { name: "Gift", kind: "income" });
    const pair = crypto.randomUUID();
    const inserted = await db
      .insert(financeTransactions)
      .values([
        {
          userId: owner,
          accountId: checking.id,
          transactionDate: "2026-08-10",
          description: "split purchase",
          amount: "-50.00",
          isParent: true,
        },
        {
          userId: owner,
          accountId: checking.id,
          transactionDate: "2026-08-10",
          description: "refund",
          amount: "10.00",
          budgetCategoryId: food,
          derivedFlow: "refund",
        },
        {
          userId: owner,
          accountId: checking.id,
          transactionDate: "2026-08-10",
          description: "gift",
          amount: "100000.00",
          budgetCategoryId: gift,
          derivedFlow: "external_transfer",
        },
        {
          userId: owner,
          accountId: checking.id,
          transactionDate: "2026-08-10",
          description: "house",
          amount: "-100000.00",
          budgetCategoryId: house,
          derivedFlow: "spend",
        },
        {
          userId: owner,
          accountId: checking.id,
          transactionDate: "2026-08-10",
          description: "move out",
          amount: "-100.00",
          transferGroupId: pair,
          derivedFlow: "internal_transfer",
        },
        {
          userId: owner,
          accountId: savings.id,
          transactionDate: "2026-08-10",
          description: "move in",
          amount: "100.00",
          transferGroupId: pair,
          derivedFlow: "internal_transfer",
        },
      ])
      .returning();
    await db.insert(financeTransactions).values([
      {
        userId: owner,
        accountId: checking.id,
        parentId: inserted[0].id,
        transactionDate: "2026-08-10",
        description: "food leaf",
        amount: "-30.00",
        budgetCategoryId: food,
        derivedFlow: "spend",
      },
      {
        userId: owner,
        accountId: checking.id,
        parentId: inserted[0].id,
        transactionDate: "2026-08-10",
        description: "uncategorized leaf",
        amount: "-20.00",
        derivedFlow: "spend",
      },
    ]);
    const report = await loadInsightsRows(owner);
    expect(report.some((row) => row.id === inserted[0].id)).toBe(false);
    expect(sumReportActivity(spendingContributions(report, "living"))).toBe(-2000);
    expect(cashMovementSummary(report)).toMatchObject({
      inflowCents: 10001000,
      outflowCents: 10005000,
      netCents: -4000,
    });
    const budget = await loadBudget(owner, "2026-08-01", db, {
      todayKey: "2026-08-22",
    });
    const month = findMonth(budget.months, "2026-08-01");
    if (!month) throw new Error("Fixture month missing");
    expect(categoryMonth(month, food).activityCents).toBe(-2000);
    const drill: ReportDrill = {
      basis: "envelope",
      from: "2026-08-01",
      to: "2026-08-31",
      categoryIds: [food],
      accountIds: [],
      payeeIds: [],
      allCategories: false,
      uncategorized: false,
      direction: "all",
    };
    const ledger = await listTransactions(owner, {}, { rowSet: "money" });
    const ids = reportContributionIds(ledger, drill, new Set(), new Set());
    expect(
      ledger
        .filter((row) => ids.has(row.id))
        .reduce((sum, row) => sum + row.amountCents, 0),
    ).toBe(-2000);
    const query = { viewId: "report", report: drill, groupBy: [] };
    const context = {
      offBudgetAccountIds: new Set<string>(),
      budgetStartMonth: "2026-08-01",
    };
    const prepared = await loadRegisterPrepared(owner, query, context);
    expect(new Set(prepared.index.nodeIds)).toEqual(ids);
    expect(
      (await loadRegisterExportRows(owner, query, context)).reduce(
        (sum, row) => sum + row.amountCents,
        0,
      ),
    ).toBe(-2000);
    expect((await loadRegisterPrepared(other, query, context)).index.nodeIds).toEqual(
      [],
    );
    expect(await loadRegisterExportRows(other, query, context)).toEqual([]);
    expect(await loadInsightsRows(other)).toEqual([]);
    expect(
      reportContributionIds(
        await listTransactions(other, {}, { rowSet: "money" }),
        drill,
        new Set(),
        new Set(),
      ).size,
    ).toBe(0);
  });
  it("edits duplicate bill names by ID and keeps their charge histories separate", async () => {
    const owner = await user(),
      other = await user();
    const firstGroup = await createCategoryGroup(owner, { name: "Home", kind: "bill" }),
      secondGroup = await createCategoryGroup(owner, { name: "Office", kind: "bill" });
    const first = await createBudgetCategory(owner, {
        name: "Internet",
        groupId: firstGroup,
        kind: "bill",
      }),
      second = await createBudgetCategory(owner, {
        name: "Internet",
        groupId: secondGroup,
        kind: "bill",
      });
    await upsertBillEnvelope(owner, {
      id: first,
      name: "Internet",
      cadence: { unit: "month", n: 1 },
      expectedCents: 1000,
      anchorDate: "2026-09-02",
    });
    await upsertBillEnvelope(owner, {
      id: second,
      name: "Internet",
      cadence: { unit: "month", n: 1 },
      expectedCents: 2000,
      anchorDate: "2026-09-20",
    });
    await expect(
      upsertBillEnvelope(owner, {
        name: "Internet",
        cadence: { unit: "month", n: 1 },
        expectedCents: 9999,
      }),
    ).rejects.toThrow();
    await expect(
      upsertBillEnvelope(other, {
        id: first,
        name: "Internet",
        cadence: { unit: "month", n: 1 },
        expectedCents: 9999,
      }),
    ).rejects.toThrow();
    await expect(deleteBudgetCategory(other, first)).rejects.toThrow();
    const payee = await createPayee(owner, { name: "First ISP" });
    await replaceCommitmentPayees(owner, { id: first }, [payee]);
    const [account] = await db
      .insert(financeAccounts)
      .values({
        userId: owner,
        name: "Checking",
        kind: "checking",
        externalSource: "test",
        externalKey: "bill",
      })
      .returning();
    await db.insert(financeTransactions).values({
      userId: owner,
      accountId: account.id,
      transactionDate: "2026-09-03",
      description: "Internet",
      amount: "-10.00",
      payeeId: payee,
      budgetCategoryId: first,
      derivedFlow: "spend",
    });
    const forecast = await loadBillForecast(owner, "2026-09-05");
    expect(forecast.billRows.find((row) => row.id === first)?.nextDueKey).toBe(
      "2026-10-03",
    );
    expect(forecast.billRows.find((row) => row.id === second)?.nextDueKey).toBe(
      "2026-09-20",
    );
    expect((await loadBudget(other, null)).categories).toEqual([]);
    expect(
      (await loadBudget(owner, null)).categories.find((row) => row.id === second)?.bill
        ?.expectedCents,
    ).toBe(2000);
  });
});
