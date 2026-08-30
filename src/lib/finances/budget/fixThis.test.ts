import { describe, expect, it } from "vitest";

import { buildBudget, findMonth, type BudgetMonth } from "./envelope";
import {
  defaultUnassignCents,
  fixThisEmptyCopy,
  fixThisSections,
  fixThisSourceMonths,
  fixThisUnavailableReason,
  unassignPreview,
} from "./fixThis";
import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import type { EnvelopeKind } from "@/db/schema";

function group(
  id: string,
  kind: EnvelopeKind,
  parentGroupId: string | null = null,
  hidden = false,
): BudgetGroupRow {
  return {
    id,
    parentGroupId,
    name: id,
    kind,
    sortKey: id,
    hidden,
  };
}

function category(
  id: string,
  kind: EnvelopeKind,
  groupId: string | null = null,
  hidden = false,
): BudgetCategoryRow {
  return {
    id,
    groupId,
    name: id,
    sortKey: id,
    hidden,
    notes: "",
    target: null,
    kind,
    isIncome: kind === "income",
    bill: null,
  };
}

const GROUPS: BudgetGroupRow[] = [group("food", "spending"), group("bills", "bill")];

const CATEGORIES: BudgetCategoryRow[] = [
  category("pay", "income"),
  category("groceries", "spending", "food"),
  category("stash", "spending", "food", true),
  category("pizza", "bill", "bills"),
  category("vacation", "savings"),
];

function months(
  allocations: { month: string; categoryId: string; amountCents: number }[],
  activity: { month: string; categoryId: string; amountCents: number }[] = [],
) {
  return buildBudget({
    categories: CATEGORIES.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      isIncome: row.isIncome,
    })),
    allocations: allocations.map((row) => ({
      ...row,
      carryover: false,
      snoozed: false,
    })),
    activity,
    buffered: [],
    startMonth: "2026-08-01",
    endMonth: "2026-10-01",
    openingCents: 10_000,
  });
}

function august(list: BudgetMonth[]): BudgetMonth {
  const found = findMonth(list, "2026-08-01");
  if (!found) throw new Error("missing August");
  return found;
}

function outline(
  sections: ReturnType<typeof fixThisSections>,
): { type: string; rows: string[] }[] {
  return sections.map((section) => ({
    type: section.label,
    rows: section.rows.map((row) =>
      row.kind === "heading"
        ? `h${row.depth}:${row.label}`
        : `e${row.depth}:${row.name}:${row.availableCents}`,
    ),
  }));
}

describe("fixThisSections", () => {
  it("omits income, empty sections, and envelopes with no Available", () => {
    const list = months([
      { month: "2026-08-01", categoryId: "groceries", amountCents: 3_000 },
      { month: "2026-08-01", categoryId: "pizza", amountCents: 2_165 },
    ]);
    const sections = fixThisSections({
      month: august(list),
      groups: GROUPS,
      categories: CATEGORIES,
      showHidden: false,
    });
    expect(outline(sections)).toEqual([
      {
        type: "Regular spending",
        rows: ["h0:Regular spending", "h0:food", "e1:groceries:3000"],
      },
      {
        type: "Bills",
        rows: ["h0:Bills", "h0:bills", "e1:pizza:2165"],
      },
    ]);
  });

  it("omits hidden envelopes unless show-hidden is on", () => {
    const list = months([
      { month: "2026-08-01", categoryId: "groceries", amountCents: 3_000 },
      { month: "2026-08-01", categoryId: "stash", amountCents: 8_000 },
    ]);
    const hidden = fixThisSections({
      month: august(list),
      groups: GROUPS,
      categories: CATEGORIES,
      showHidden: false,
    });
    expect(outline(hidden)[0]?.rows).toEqual([
      "h0:Regular spending",
      "h0:food",
      "e1:groceries:3000",
    ]);

    const shown = fixThisSections({
      month: august(list),
      groups: GROUPS,
      categories: CATEGORIES,
      showHidden: true,
    });
    expect(outline(shown)[0]?.rows).toEqual([
      "h0:Regular spending",
      "h0:food",
      "e1:groceries:3000",
      "e1:stash:8000",
    ]);
  });

  it("omits envelopes inside a hidden group unless show-hidden is on", () => {
    const hiddenGroup = [group("food", "spending", null, true)];
    const list = months([
      { month: "2026-08-01", categoryId: "groceries", amountCents: 3_000 },
    ]);
    expect(
      fixThisSections({
        month: august(list),
        groups: hiddenGroup,
        categories: CATEGORIES,
        showHidden: false,
      }),
    ).toEqual([]);
    expect(
      outline(
        fixThisSections({
          month: august(list),
          groups: hiddenGroup,
          categories: CATEGORIES,
          showHidden: true,
        }),
      )[0]?.rows,
    ).toEqual(["h0:Regular spending", "h0:food", "e1:groceries:3000"]);
  });
});

describe("fixThisSourceMonths", () => {
  it("keeps the viewed month even when empty, and omits a later month with nothing to raid", () => {
    // August is the hole; September holds the assignment that caused it. October is in
    // the fold, but September's leftover is spent there, so it is not a source.
    const list = months(
      [{ month: "2026-09-01", categoryId: "pizza", amountCents: 5_000 }],
      [{ month: "2026-10-01", categoryId: "pizza", amountCents: -5_000 }],
    );
    expect(
      fixThisSourceMonths({
        months: list,
        viewedMonth: "2026-08-01",
        groups: GROUPS,
        categories: CATEGORIES,
        showHidden: false,
      }),
    ).toEqual(["2026-08-01", "2026-09-01"]);
  });
});

describe("defaultUnassignCents", () => {
  it("uses the viewed month's hole, not the picker month's Available", () => {
    expect(defaultUnassignCents(5_000, -2_000)).toBe(2_000);
    expect(defaultUnassignCents(1_000, -976_523)).toBe(1_000);
    expect(defaultUnassignCents(5_000, 400)).toBe(0);
  });
});

describe("unassignPreview", () => {
  it("names both sides after the clamped move", () => {
    expect(
      unassignPreview({
        name: "Pizza",
        availableCents: 2_165,
        amountCents: 2_165,
        viewedReadyToAssignCents: -976_523,
      }),
    ).toEqual({
      availableLine: "This will take Pizza from $21.65 Available to $0.00.",
      readyLine: "Ready to Assign from -$9,765.23 to -$9,743.58.",
    });
  });

  it("lets MAX overshoot Ready to Assign to positive", () => {
    expect(
      unassignPreview({
        name: "Rent",
        availableCents: 50_000,
        amountCents: 50_000,
        viewedReadyToAssignCents: -10_000,
      })?.readyLine,
    ).toBe("Ready to Assign from -$100.00 to $400.00.");
  });
});

describe("fixThisUnavailableReason", () => {
  it("is the past-month gate and the non-negative gate, in that order", () => {
    expect(
      fixThisUnavailableReason({
        viewedMonth: "2026-07-01",
        todayKey: "2026-08-22",
        readyToAssignCents: -5_000,
      }),
    ).toBe("Past months stay historical.");
    expect(
      fixThisUnavailableReason({
        viewedMonth: "2026-08-01",
        todayKey: "2026-08-22",
        readyToAssignCents: 0,
      }),
    ).toBe("Ready to Assign is not negative");
    expect(
      fixThisUnavailableReason({
        viewedMonth: "2026-09-01",
        todayKey: "2026-08-22",
        readyToAssignCents: -1,
      }),
    ).toBeNull();
  });
});

describe("fixThisEmptyCopy", () => {
  it("names the picker month without apologising", () => {
    expect(fixThisEmptyCopy("2026-08-01")).toBe(
      "Nothing in August 2026 has Available to un-assign.",
    );
  });
});
