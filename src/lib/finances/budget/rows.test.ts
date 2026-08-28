import { describe, expect, it } from "vitest";

import { buildBudget, findMonth, type BudgetMonth } from "./envelope";
import {
  balanceTone,
  budgetGridRows,
  budgetRows,
  budgetSections,
  budgetTotals,
  coverSources,
  moveTargets,
  overspentRows,
  sectionGridRows,
} from "./rows";
import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";

const GROUPS: BudgetGroupRow[] = [
  {
    id: "income",
    parentGroupId: null,
    name: "Income",
    sortKey: "a",
    hidden: false,
  },
  {
    id: "spending",
    parentGroupId: null,
    name: "Spending",
    sortKey: "b",
    hidden: false,
  },
];

function category(
  id: string,
  groupId: string,
  sortKey: string,
  hidden = false,
  kind: BudgetCategoryRow["kind"] = groupId === "income" ? "income" : "spending",
): BudgetCategoryRow {
  return {
    id,
    groupId,
    name: id,
    sortKey,
    hidden,
    notes: "",
    target: null,
    kind,
    isIncome: kind === "income",
    bill: null,
  };
}

const CATEGORIES: BudgetCategoryRow[] = [
  // Deliberately out of order, so the sort is doing the work rather than the input.
  category("fun", "spending", "b"),
  category("pay", "income", "a"),
  category("food", "spending", "a"),
  category("old", "spending", "c", true),
];

function august(): BudgetMonth {
  const months = buildBudget({
    categories: CATEGORIES.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      isIncome: row.kind === "income",
    })),
    allocations: [
      {
        month: "2026-08-01",
        categoryId: "food",
        amountCents: 20_000,
        carryover: false,
      },
      { month: "2026-08-01", categoryId: "fun", amountCents: 30_000, carryover: true },
    ],
    activity: [
      { month: "2026-08-01", categoryId: "pay", amountCents: 200_000 },
      { month: "2026-08-01", categoryId: "food", amountCents: -35_000 },
      { month: "2026-08-01", categoryId: "fun", amountCents: -5_000 },
    ],
    buffered: [],
    startMonth: "2026-08-01",
    endMonth: "2026-08-01",
    openingCents: 0,
  });
  const month = findMonth(months, "2026-08-01");
  if (!month) throw new Error("no august");
  return month;
}

describe("budgetRows", () => {
  it("orders by group then sort key, and attaches the month's numbers", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(rows.map((row) => row.id)).toEqual(["pay", "food", "fun", "old"]);
    expect(rows[1]).toMatchObject({
      id: "food",
      assignedCents: 20_000,
      activityCents: -35_000,
      balanceCents: -15_000,
      carryover: false,
    });
    expect(rows[2]?.carryover).toBe(true);
  });

  it("marks income rows from kind, not from the group", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(rows.find((row) => row.id === "pay")?.isIncome).toBe(true);
    expect(rows.find((row) => row.id === "food")?.isIncome).toBe(false);
  });
});

describe("budgetGridRows", () => {
  it("interleaves group headers and counts only what is shown", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    const grid = budgetGridRows(GROUPS, rows);

    expect(grid.map((row) => `${row.kind}:${row.id}`)).toEqual([
      "group:income",
      "node:pay",
      "group:spending",
      "node:food",
      "node:fun",
    ]);
    expect(grid.find((row) => row.id === "spending")).toMatchObject({ count: 2 });
  });

  it("shows a hidden envelope only when asked, so it can be brought back", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    const grid = budgetGridRows(GROUPS, rows, { showHidden: true });
    expect(grid.map((row) => row.id)).toContain("old");
    expect(grid.find((row) => row.id === "spending")).toMatchObject({ count: 3 });
  });

  it("drops a group with nothing under it rather than drawing an empty header", () => {
    const grid = budgetGridRows(GROUPS, []);
    expect(grid).toEqual([]);
  });
});

describe("budgetTotals", () => {
  it("sums every row it is given, hidden ones included", () => {
    // Hiding tidies the screen. A total that changed when something was tidied away would
    // stop being the whole of the budget.
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    const spending = rows.filter((row) => !row.isIncome);
    expect(budgetTotals(spending)).toEqual({
      assignedCents: 50_000,
      activityCents: -40_000,
      balanceCents: 10_000,
    });
  });
});

describe("pickers and the work list", () => {
  it("offers only funded envelopes as a cover source, never the target or income", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(coverSources(rows, "food").map((row) => row.id)).toEqual(["fun"]);
    // `fun` cannot cover itself, and nothing else has a positive balance.
    expect(coverSources(rows, "fun")).toEqual([]);
  });

  it("offers every other spending envelope as a move target", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(moveTargets(rows, "food").map((row) => row.id)).toEqual(["fun", "old"]);
  });

  it("lists overspent envelopes worst first", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(overspentRows(rows).map((row) => row.id)).toEqual(["food"]);
  });

  it("names the three balance states", () => {
    expect(balanceTone(1)).toBe("positive");
    expect(balanceTone(0)).toBe("zero");
    expect(balanceTone(-1)).toBe("negative");
  });
});

describe("budgetSections", () => {
  /** `food` promoted to a bill, so one section has rows and the other still does too. */
  function withBill(): BudgetCategoryRow[] {
    return CATEGORIES.map((row) =>
      row.id === "food"
        ? {
            ...row,
            kind: "bill" as const,
            bill: {
              status: "active" as const,
              cancelledOn: null,
              url: "",
              cadenceMonths: 1,
              cadenceDays: null,
              dueDay: null,
              anchorDate: null,
              scheduled: true,
              expectedCents: 20_000,
            },
          }
        : row,
    );
  }

  it("splits income, bills, regular spending and savings into four disjoint sets", () => {
    const rows = budgetRows(GROUPS, withBill(), august());
    const sections = budgetSections(rows);

    expect(sections.income.map((row) => row.id)).toEqual(["pay"]);
    expect(sections.bills.map((row) => row.id)).toEqual(["food"]);
    expect(sections.envelopes.map((row) => row.id)).toEqual(["fun", "old"]);
    expect(sections.savings).toEqual([]);
  });

  it("counts every spending row exactly once across the two tables", () => {
    // The property the split has to preserve: the footer sums bills + envelopes, so a row
    // landing in both — or in neither — would silently change the budget's total.
    const rows = budgetRows(GROUPS, withBill(), august());
    const sections = budgetSections(rows);
    const spending = rows.filter(
      (row) => row.kind === "bill" || row.kind === "spending",
    );

    expect(sections.bills.length + sections.envelopes.length).toBe(spending.length);
    expect(budgetTotals([...sections.bills, ...sections.envelopes])).toEqual(
      budgetTotals(spending),
    );
  });

  it("holds savings out of All spending", () => {
    const categories = [
      ...CATEGORIES,
      category("house", "spending", "d", false, "savings"),
    ];
    const rows = budgetRows(GROUPS, categories, august());
    const sections = budgetSections(rows);

    expect(sections.savings.map((row) => row.id)).toEqual(["house"]);
    expect(sections.envelopes.map((row) => row.id)).not.toContain("house");
    expect(budgetTotals([...sections.bills, ...sections.envelopes])).toEqual(
      budgetTotals(
        rows.filter((row) => row.kind === "bill" || row.kind === "spending"),
      ),
    );
  });

  it("narrows a bill row so its facet needs no null check", () => {
    const rows = budgetRows(GROUPS, withBill(), august());
    const [bill] = budgetSections(rows).bills;
    expect(bill.bill.cadenceMonths).toBe(1);
  });
});

describe("sectionGridRows", () => {
  it("drops a lone top-level group header and unindents its rows", () => {
    // Every spending row sits under one "Spending" group, and the section is already titled
    // — two headers saying the same word, one above each table.
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    const spending = rows.filter((row) => !row.isIncome);
    const grid = sectionGridRows(GROUPS, spending, { showHidden: true });

    expect(grid.every((row) => row.kind === "node")).toBe(true);
    expect(grid.map((row) => row.depth)).toEqual([0, 0, 0]);
  });

  it("keeps the headers when a section spans more than one group", () => {
    const groups: BudgetGroupRow[] = [
      ...GROUPS,
      {
        id: "savings",
        parentGroupId: null,
        name: "Savings",
        sortKey: "c",
        hidden: false,
      },
    ];
    const categories = [...CATEGORIES, category("rainy", "savings", "a")];
    const rows = budgetRows(groups, categories, august()).filter(
      (row) => !row.isIncome,
    );
    const grid = sectionGridRows(groups, rows, { showHidden: true });

    expect(grid.filter((row) => row.kind === "group").map((row) => row.label)).toEqual([
      "Spending",
      "Savings",
    ]);
  });
});
