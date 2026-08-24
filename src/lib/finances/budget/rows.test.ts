import { describe, expect, it } from "vitest";

import { buildBudget, findMonth, type BudgetMonth } from "./envelope";
import {
  balanceTone,
  budgetGridRows,
  budgetRows,
  budgetTotals,
  coverSources,
  moveTargets,
  overspentRows,
} from "./rows";
import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";

const GROUPS: BudgetGroupRow[] = [
  {
    id: "income",
    parentGroupId: null,
    name: "Income",
    isIncome: true,
    sortKey: "a",
    hidden: false,
  },
  {
    id: "spending",
    parentGroupId: null,
    name: "Spending",
    isIncome: false,
    sortKey: "b",
    hidden: false,
  },
];

function category(
  id: string,
  groupId: string,
  sortKey: string,
  hidden = false,
): BudgetCategoryRow {
  return {
    id,
    groupId,
    name: id,
    sortKey,
    hidden,
    notes: "",
    sourceCategories: [],
    templates: [],
    kind: "envelope",
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
      isIncome: row.groupId === "income",
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

  it("marks income rows from their group, not from the envelope", () => {
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
