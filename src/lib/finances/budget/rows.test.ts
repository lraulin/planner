import { describe, expect, it } from "vitest";

import { buildBudget, findMonth, type BudgetMonth } from "./envelope";
import {
  balanceTone,
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
    kind: "income",
    sortKey: "a",
    hidden: false,
  },
  {
    id: "spending",
    parentGroupId: null,
    name: "Spending",
    kind: "spending",
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
    incomeRole: "other",
    expectedMonthlyIncomeCents: null,
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
      incomeRole: "other",
      expectedMonthlyIncomeCents: null,
      isIncome: row.kind === "income",
    })),
    allocations: [
      {
        month: "2026-08-01",
        categoryId: "food",
        amountCents: 20_000,
        carryover: false,
        snoozed: false,
      },
      {
        month: "2026-08-01",
        categoryId: "fun",
        amountCents: 30_000,
        carryover: true,
        snoozed: false,
      },
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
  it("orders by group name then envelope name, and attaches the month's numbers", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(rows.map((row) => row.id)).toEqual(["pay", "food", "fun", "old"]);
    expect(rows[1]).toMatchObject({
      id: "food",
      assignedCents: 20_000,
      activityCents: -35_000,
      balanceCents: -15_000,
      carryover: false,
      snoozed: false,
    });
    expect(rows[2]?.carryover).toBe(true);
  });

  it("marks income rows from kind, not from the group", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    expect(rows.find((row) => row.id === "pay")?.isIncome).toBe(true);
    expect(rows.find((row) => row.id === "food")?.isIncome).toBe(false);
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
              leadDays: 0,
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
  it("interleaves group headers and counts only what is shown", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    const grid = sectionGridRows(
      GROUPS,
      "spending",
      rows.filter((row) => !row.isIncome),
    );

    expect(grid.map((row) => `${row.kind}:${row.id}`)).toEqual([
      "group:spending",
      "node:food",
      "node:fun",
    ]);
    expect(grid.find((row) => row.id === "spending")).toMatchObject({ count: 2 });
  });

  it("shows a hidden envelope only when asked, so it can be brought back", () => {
    const rows = budgetRows(GROUPS, CATEGORIES, august());
    const grid = sectionGridRows(
      GROUPS,
      "spending",
      rows.filter((row) => !row.isIncome),
      { showHidden: true },
    );
    expect(grid.map((row) => row.id)).toContain("old");
    expect(grid.find((row) => row.id === "spending")).toMatchObject({ count: 3 });
  });

  it("hands each table only its own groups", () => {
    // The Income group must not draw a header above the spending table, which is what would
    // happen if every table were handed every group.
    const grid = sectionGridRows(GROUPS, "spending", []);
    expect(grid.map((row) => row.id)).toEqual(["spending"]);
  });

  it("still draws a group that has nothing under it", () => {
    // The whole point: a group you cannot see is one you cannot add to or delete, and a
    // group becomes deletable exactly when it empties.
    const grid = sectionGridRows(GROUPS, "spending", []);
    expect(grid).toEqual([
      {
        kind: "group",
        id: "spending",
        label: "Spending",
        count: 0,
        depth: 0,
        collapsed: false,
      },
    ]);
  });

  it("keeps the headers when a section spans more than one group", () => {
    const groups: BudgetGroupRow[] = [
      ...GROUPS,
      {
        id: "extras",
        parentGroupId: null,
        name: "Extras",
        kind: "spending",
        sortKey: "c",
        hidden: false,
      },
    ];
    const categories = [...CATEGORIES, category("rainy", "extras", "a")];
    const rows = budgetRows(groups, categories, august()).filter(
      (row) => !row.isIncome,
    );
    const grid = sectionGridRows(groups, "spending", rows, { showHidden: true });

    expect(grid.filter((row) => row.kind === "group").map((row) => row.label)).toEqual([
      "Extras",
      "Spending",
    ]);
  });

  it("omits a quiet cancelled bill unless Show Hidden is on", () => {
    const groups: BudgetGroupRow[] = [
      {
        id: "bills",
        parentGroupId: null,
        name: "Bills",
        kind: "bill",
        sortKey: "a",
        hidden: false,
      },
    ];
    const netflix = {
      ...category("netflix", "bills", "a", false, "bill"),
      bill: {
        status: "cancelled" as const,
        cancelledOn: null,
        url: "",
        cadenceMonths: 1,
        cadenceDays: null,
        dueDay: null,
        leadDays: 0,
        anchorDate: null,
        scheduled: true,
        expectedCents: 1_299,
      },
    };
    const emptyMonth = findMonth(
      buildBudget({
        categories: [{ id: "netflix", groupId: "bills", isIncome: false }],
        allocations: [],
        activity: [],
        buffered: [],
        startMonth: "2026-08-01",
        endMonth: "2026-08-01",
        openingCents: 0,
      }),
      "2026-08-01",
    );
    if (!emptyMonth) throw new Error("no august");
    const rows = budgetRows(groups, [netflix], emptyMonth);
    expect(sectionGridRows(groups, "bill", rows).map((row) => row.id)).toEqual([
      "bills",
    ]);
    expect(
      sectionGridRows(groups, "bill", rows, { showHidden: true }).map((row) => row.id),
    ).toContain("netflix");
  });

  it("keeps a cancelled bill on the grid when leftover Available remains", () => {
    const groups: BudgetGroupRow[] = [
      {
        id: "bills",
        parentGroupId: null,
        name: "Bills",
        kind: "bill",
        sortKey: "a",
        hidden: false,
      },
    ];
    const netflix = {
      ...category("netflix", "bills", "a", false, "bill"),
      bill: {
        status: "cancelled" as const,
        cancelledOn: null,
        url: "",
        cadenceMonths: 1,
        cadenceDays: null,
        dueDay: null,
        leadDays: 0,
        anchorDate: null,
        scheduled: true,
        expectedCents: 1_299,
      },
    };
    const leftover = findMonth(
      buildBudget({
        categories: [{ id: "netflix", groupId: "bills", isIncome: false }],
        allocations: [
          {
            month: "2026-08-01",
            categoryId: "netflix",
            amountCents: 1_299,
            carryover: true,
            snoozed: false,
          },
        ],
        activity: [],
        buffered: [],
        startMonth: "2026-08-01",
        endMonth: "2026-08-01",
        openingCents: 0,
      }),
      "2026-08-01",
    );
    if (!leftover) throw new Error("no august");
    const rows = budgetRows(groups, [netflix], leftover);
    expect(rows[0]?.balanceCents).toBe(1_299);
    expect(sectionGridRows(groups, "bill", rows).map((row) => row.id)).toContain(
      "netflix",
    );
  });
});
