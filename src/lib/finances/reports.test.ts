import { describe, expect, it } from "vitest";
import { buildBudget } from "./budget/envelope";
import { budgetRows } from "./budget/rows";
import type { BudgetCategoryRow, BudgetData, BudgetGroupRow } from "./budget/queries";
import { monthlyFundingPlan } from "./budget/incomePlan";
import { billDueCue, billDueSoon } from "./budget/dueCue";
import type { IndicatorState } from "./budget/indicator";
import { budgetReturnContext, revealBudgetGroups } from "./budget/returnContext";
import {
  spendingComparisonRows,
  reportRange,
  applyReportFilters,
  cashMovementSummary,
  completedMonthAverages,
  envelopeReportRows,
  migrateReportNames,
  rankedReportSpending,
  regularIncomeContributions,
  reportMonthlySeries,
  spendingContributions,
  sumReportActivity,
  type EnvelopeReportRow,
} from "./reports";

function category(
  id: string,
  kind: BudgetCategoryRow["kind"],
  overrides: Partial<BudgetCategoryRow> = {},
): BudgetCategoryRow {
  return {
    id,
    name: id,
    kind,
    groupId: null,
    sortKey: id,
    hidden: false,
    notes: "",
    target: null,
    isIncome: kind === "income",
    bill: null,
    incomeRole: "other",
    expectedMonthlyIncomeCents: null,
    ...overrides,
  };
}
function tx(
  id: string,
  amountCents: number,
  envelopeKind: EnvelopeReportRow["envelopeKind"],
  overrides: Partial<EnvelopeReportRow> = {},
): EnvelopeReportRow {
  return {
    id,
    amountCents,
    accountId: "checking",
    accountName: "Checking",
    accountKind: "checking",
    transactionDate: "2026-08-10",
    description: id,
    sourceCategory: "",
    derivedCategory: id,
    derivedFlow: amountCents > 0 ? "income" : "spend",
    flowOverride: null,
    transferGroupId: null,
    payeeId: null,
    payeeName: null,
    budgetCategoryId: id,
    groupId: null,
    envelopeKind,
    incomeRole: "other",
    accountOffBudget: false,
    contributesToBudget: true,
    ...overrides,
  };
}
const range = { startKey: "2026-08-01", endKey: "2026-09-05" };
const groups: BudgetGroupRow[] = [
  {
    id: "parent",
    name: "Household",
    parentGroupId: null,
    kind: "spending",
    sortKey: "a",
    hidden: false,
  },
  {
    id: "child",
    name: "Food",
    parentGroupId: "parent",
    kind: "spending",
    sortKey: "b",
    hidden: false,
  },
];
function data(categories: BudgetCategoryRow[]): BudgetData {
  const months = buildBudget({
    categories,
    allocations: [
      {
        month: "2026-08-01",
        categoryId: "saved",
        amountCents: 10000,
        carryover: true,
        snoozed: false,
      },
    ],
    activity: [{ month: "2026-09-01", categoryId: "saved", amountCents: -2000 }],
    buffered: [],
    startMonth: "2026-08-01",
    endMonth: "2026-09-01",
    openingCents: 10000,
  });
  return {
    categories,
    groups,
    months,
    configured: true,
    settings: { startMonth: "2026-08-01", openingCents: 10000 },
    month: "2026-09-01",
    todayKey: "2026-09-05",
    accountPoolCents: 8000,
    uncategorizedCount: 0,
    uncategorizedCents: 0,
    goals: {},
    prospectiveOpeningCents: 0,
    movementEvents: [],
    preStartActivity: [],
  };
}
describe("envelope reports", () => {
  it("keeps a $100,000 gift and house purchase out of living costs while including both in cash flow", () => {
    const rows = [
      tx("pay", 500000, "income", { incomeRole: "regular" }),
      tx("gift", 10000000, "income", { derivedFlow: "external_transfer" }),
      tx("house", -10000000, "savings"),
      tx("food", -100000, "spending"),
      tx("refund", 20000, "spending", { derivedFlow: "refund" }),
    ];
    expect(-sumReportActivity(spendingContributions(rows, "living"))).toBe(80000);
    expect(sumReportActivity(regularIncomeContributions(rows))).toBe(500000);
    expect(-sumReportActivity(spendingContributions(rows, "savings"))).toBe(10000000);
    expect(cashMovementSummary(rows)).toEqual({
      inflowCents: 10520000,
      outflowCents: 10100000,
      netCents: 420000,
    });
  });
  it("keeps the partial month out of trailing averages", () => {
    const points = reportMonthlySeries(
      [
        tx("food", -9000, "spending"),
        tx("food", -1000, "spending", { transactionDate: "2026-09-02" }),
      ],
      "living",
      range,
      "2026-09-05",
    );
    expect(completedMonthAverages(points, "2026-09-05")[0]).toMatchObject({
      count: 1,
      spendCents: 9000,
    });
    expect(points[1]).toMatchObject({ spendCents: 1000, trailingSpendCents: 9000 });
  });
  it("uses stable IDs through nested groups, duplicate names, refunds, and unknown payees", () => {
    const categories = [
      category("a", "spending", { name: "Food", groupId: "child" }),
      category("b", "spending", { name: "Food" }),
    ];
    const rows = [
      tx("a", -5000, "spending", { groupId: "child" }),
      tx("b", -8000, "spending"),
      tx("r", 1000, "spending", { budgetCategoryId: "a", groupId: "child" }),
    ];
    const ranked = rankedReportSpending(rows, { categories, groups }, "category");
    expect(ranked.map((row) => [row.id, row.cents])).toEqual([
      ["b", 8000],
      ["a", 4000],
    ]);
    expect(ranked[1].name).toBe("Household › Food › Food");
    expect(
      applyReportFilters(rows, {
        accountIds: [],
        categoryIds: ["a"],
        payeeIds: ["unknown"],
      }),
    ).toHaveLength(2);
    expect(migrateReportNames(["Food"], categories)).toEqual({
      ids: [],
      unresolved: ["Food"],
    });
    expect(
      -sumReportActivity(
        spendingContributions(
          [tx("u", -1500, null, { budgetCategoryId: null })],
          "all",
        ),
      ),
    ).toBe(1500);
  });
  it("reads carry-in and available directly from the Budget fold, including hidden savings", () => {
    const fixture = data([category("saved", "savings", { hidden: true })]);
    const options = {
      report: "balances" as const,
      month: "2026-09-01",
      range,
      scope: "living" as const,
      categoryIds: [],
    };
    expect(envelopeReportRows(fixture, [], options).envelopes[0]).toMatchObject({
      carryInCents: 10000,
      assignedCents: 0,
      activityCents: -2000,
      balanceCents: 8000,
    });
    expect(
      envelopeReportRows(fixture, [], { ...options, month: "2026-07-01" }),
    ).toMatchObject({ beforeSetup: true, envelopes: [] });
  });
  it("reveals a return link's ancestry without changing persisted collapse state", () => {
    const context = budgetReturnContext(
      "a",
      [category("a", "spending", { groupId: "child" })],
      groups,
    );
    const saved = new Set(["parent", "child", "unrelated"]);
    expect(revealBudgetGroups(saved, context?.ancestors)).toEqual(
      new Set(["unrelated"]),
    );
    expect(saved.size).toBe(3);
  });
});
describe("monthly funding plan", () => {
  it("uses target requirements or positive assignments, excludes savings, and includes inactive bill assignments", () => {
    const fixture = data([
      category("pay", "income", {
        incomeRole: "regular",
        expectedMonthlyIncomeCents: 100000,
      }),
      category("food", "spending", {
        target: {
          behavior: "add",
          cadence: { unit: "month", day: 1 },
          amountCents: 20000,
        },
      }),
      category("saved", "savings"),
    ]);
    const rows = budgetRows(groups, fixture.categories, fixture.months[1]);
    const plan = monthlyFundingPlan(rows, "2026-09-01", fixture.months[0]);
    expect(plan).toMatchObject({
      plannedCents: 20000,
      marginCents: 80000,
      missing: [],
    });
    const food = rows.find((row) => row.id === "food");
    if (!food) throw new Error("fixture");
    expect(
      monthlyFundingPlan(
        rows.map((row) => (row.id === "food" ? { ...row, assignedCents: 30000 } : row)),
        "2026-09-01",
        null,
      ).plannedCents,
    ).toBe(30000);
    const inactive = {
      ...food,
      id: "paused",
      kind: "bill" as const,
      assignedCents: 5000,
      bill: {
        status: "paused" as const,
        cancelledOn: null,
        url: "",
        cadenceMonths: 1,
        cadenceDays: null,
        dueDay: 1,
        anchorDate: null,
        scheduled: true,
        expectedCents: 50000,
      },
    };
    expect(
      monthlyFundingPlan([...rows, inactive], "2026-09-01", null).plannedCents,
    ).toBe(25000);
  });
  it("never presents missing estimates or targets as conclusively affordable", () => {
    const fixture = data([
      category("pay", "income", { incomeRole: "regular" }),
      category("food", "spending"),
    ]);
    const plan = monthlyFundingPlan(
      budgetRows(groups, fixture.categories, fixture.months[1]),
      "2026-09-01",
      null,
    );
    expect(plan.marginCents).toBeNull();
    expect(plan.income.expectedCents).toBeNull();
    expect(plan.missing[0]).toMatchObject({ id: "food", reason: "No target" });
  });
});
describe("bill due cues", () => {
  const row = {
    nextDueKey: "2026-09-30",
    bill: {
      status: "active" as const,
      cancelledOn: null,
      url: "",
      cadenceMonths: 1,
      cadenceDays: null,
      dueDay: 30,
      anchorDate: null,
      scheduled: true,
      expectedCents: 1000,
    },
  };
  it("distinguishes before and on payday only in the current budget month", () => {
    expect(
      billDueCue(row, "2026-09-01", "2026-09-28", "2026-10-01", "funded"),
    ).toMatchObject({ label: "Before payday" });
    expect(
      billDueCue(row, "2026-09-01", "2026-09-28", "2026-09-30", "funded"),
    ).toMatchObject({ label: "On payday" });
    expect(
      billDueCue(row, "2026-10-01", "2026-09-28", "2026-10-01", "funded"),
    ).toBeNull();
  });
  it("only shouts while the envelope still needs money", () => {
    const cue = (state: IndicatorState) =>
      billDueCue(row, "2026-09-01", "2026-09-28", "2026-10-01", state)?.urgent;
    expect(cue("underfunded")).toBe(true);
    expect(cue("overspent")).toBe(true);
    for (const state of ["funded", "on-track", "overassigned", "fully-spent"] as const)
      expect(cue(state)).toBe(false);
  });
  it("uses a 14-day inclusive horizon across months and omits inactive or unscheduled bills", () => {
    expect(billDueSoon({ ...row, nextDueKey: "2026-10-12" }, "2026-09-28")).toBe(true);
    expect(billDueSoon({ ...row, nextDueKey: "2026-10-13" }, "2026-09-28")).toBe(false);
    for (const status of ["paused", "cancelled"] as const)
      expect(billDueSoon({ ...row, bill: { ...row.bill, status } }, "2026-09-28")).toBe(
        false,
      );
    expect(
      billDueSoon({ ...row, bill: { ...row.bill, scheduled: false } }, "2026-09-28"),
    ).toBe(false);
    expect(billDueSoon({ ...row, nextDueKey: null }, "2026-09-28")).toBe(false);
  });
});

it("narrows expenses without removing the regular-income comparator, and bounds averages to available history", () => {
  const rows = [
    tx("pay", 500000, "income", { incomeRole: "regular" }),
    tx("food", -10000, "spending"),
    tx("bill", -3000, "bill"),
  ];
  expect(
    spendingComparisonRows(rows, {
      accountIds: [],
      payeeIds: [],
      categoryIds: ["food"],
    }).map((row) => row.id),
  ).toEqual(["pay", "food"]);
  expect(reportRange("12m", "2026-09-05", "2026-07-15")).toEqual({
    startKey: "2026-07-01",
    endKey: "2026-09-05",
  });
});
