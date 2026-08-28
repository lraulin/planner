import { describe, expect, it } from "vitest";

import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import type { BudgetRow } from "./rows";
import {
  budgetChildren,
  budgetEnvelopeLabel,
  budgetGroupDepths,
  descendantEnvelopeIds,
  moveDestinations,
  nestedBudgetGridRows,
  resolveBudgetDrop,
} from "./hierarchy";

function group(
  id: string,
  parentGroupId: string | null,
  sortKey: string,
): BudgetGroupRow {
  return {
    id,
    parentGroupId,
    name: id,
    sortKey,
    hidden: false,
  };
}

function category(
  id: string,
  groupId: string | null,
  sortKey: string,
  kind: BudgetCategoryRow["kind"] = "spending",
): BudgetCategoryRow {
  return {
    id,
    groupId,
    name: id,
    sortKey,
    hidden: false,
    notes: "",
    target: null,
    kind,
    isIncome: kind === "income",
    bill: null,
  };
}

function row(id: string, groupId: string | null): BudgetRow {
  return {
    id,
    groupId,
    sortKey: "A",
    name: id,
    isIncome: false,
    hidden: false,
    notes: "",
    assignedCents: 0,
    activityCents: 0,
    balanceCents: 0,
    carryover: true,
    target: null,
    goalCents: null,
    kind: "spending",
    bill: null,
    nextDueKey: null,
    expectedKey: null,
  };
}

describe("budget hierarchy", () => {
  const groups = [
    group("spending", null, "A"),
    group("bills", "spending", "B"),
    group("utilities", "bills", "B"),
  ];
  const categories = [
    category("discretionary", "spending", "C"),
    category("other", "bills", "A"),
    category("electric", "utilities", "A"),
  ];

  it("orders groups and envelopes together and emits recursive counts", () => {
    expect(
      budgetChildren(groups, categories, "spending").map((item) => item.id),
    ).toEqual(["bills", "discretionary"]);

    expect(
      nestedBudgetGridRows(
        groups,
        categories,
        categories.map((entry) => row(entry.id, entry.groupId)),
      ).map((entry) =>
        entry.kind === "group"
          ? `${entry.id}:${entry.depth}:${entry.count}`
          : `${entry.id}:${entry.depth}`,
      ),
    ).toEqual([
      "spending:0:3",
      "bills:1:2",
      "other:2",
      "utilities:2:1",
      "electric:3",
      "discretionary:1",
    ]);
  });

  it("detects cycles rather than silently dropping a branch", () => {
    const cycled = [group("a", "b", "A"), group("b", "a", "A")];
    expect(() => budgetGroupDepths(cycled)).toThrow("cycle");
  });

  it("collects every descendant envelope for recursive totals", () => {
    expect([...descendantEnvelopeIds(groups, categories, "spending")].sort()).toEqual([
      "discretionary",
      "electric",
      "other",
    ]);
    expect([...descendantEnvelopeIds(groups, categories, "bills")].sort()).toEqual([
      "electric",
      "other",
    ]);
  });

  it("names an envelope by its complete nested path", () => {
    expect(budgetEnvelopeLabel(groups, category("electric", "utilities", "A"))).toBe(
      "spending › bills › utilities › electric",
    );
  });

  it("rejects a group inside its own descendant", () => {
    expect(
      resolveBudgetDrop(
        groups,
        categories,
        { kind: "group", id: "spending" },
        { kind: "group", id: "utilities" },
        "inside",
      ),
    ).toBeNull();
  });

  it("resolves a legal move from the same pure sibling order the server uses", () => {
    expect(
      resolveBudgetDrop(
        groups,
        categories,
        { kind: "category", id: "discretionary" },
        { kind: "group", id: "bills" },
        "inside",
      ),
    ).toMatchObject({
      parentGroupId: "bills",
      previous: { kind: "group", id: "utilities" },
      next: null,
      depth: 2,
    });
  });

  it("renders an envelope with no group at the section root", () => {
    const ungrouped = category("rent", null, "A", "bill");
    expect(budgetChildren(groups, [ungrouped], null).map((item) => item.id)).toEqual([
      "rent",
      "spending",
    ]);
    expect(
      nestedBudgetGridRows(groups, [ungrouped], [row("rent", null)]).map(
        (entry) => `${entry.kind}:${entry.id}`,
      ),
    ).toEqual(["node:rent"]);
  });

  it("allows dropping an envelope out of a group onto the root", () => {
    expect(
      resolveBudgetDrop(
        groups,
        categories,
        { kind: "category", id: "discretionary" },
        { kind: "group", id: "spending" },
        "before",
      ),
    ).toMatchObject({ parentGroupId: null });
  });

  it("refuses moves across the income and spending boundary", () => {
    const withIncome = [...groups, group("income", null, "Z")];
    const withIncomeCategories = [
      ...categories,
      category("pay", "income", "A", "income"),
    ];
    expect(
      resolveBudgetDrop(
        withIncome,
        withIncomeCategories,
        { kind: "group", id: "bills" },
        { kind: "group", id: "income" },
        "inside",
      ),
    ).toBeNull();
  });
});

describe("moveDestinations", () => {
  // Two sections that must never mix, and a nest deep enough to move a group into itself.
  const groups = [
    group("income-grp", null, "A"),
    group("spending-grp", null, "B"),
    group("bills", "spending-grp", "A"),
    group("utilities", "bills", "A"),
    group("empty", null, "C"),
  ];
  const categories = [
    category("paycheck", "income-grp", "A", "income"),
    category("groceries", "spending-grp", "B"),
    category("electric", "utilities", "A", "bill"),
  ];

  it("never offers a group that is the moving group or one of its descendants", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "group",
      id: "bills",
    }).map((entry) => entry.id);
    expect(ids).not.toContain("bills");
    expect(ids).not.toContain("utilities");
  });

  it("never offers a group across a section boundary", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "paycheck",
    }).map((entry) => entry.id);
    expect(ids).not.toContain("spending-grp");
    expect(ids).not.toContain("bills");
    expect(ids).not.toContain("utilities");
  });

  it("offers a group with no envelopes yet, whose section is not yet stated", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "paycheck",
    }).map((entry) => entry.id);
    expect(ids).toContain("empty");
  });

  it("treats a bill as spending, so it may move within the spending branch", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "electric",
    }).map((entry) => entry.id);
    expect(ids).toContain("bills");
    expect(ids).toContain("spending-grp");
    expect(ids).not.toContain("income-grp");
  });

  it("omits the group the item already sits in", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "groceries",
    }).map((entry) => entry.id);
    expect(ids).not.toContain("spending-grp");
  });

  it("returns nothing for an item that is not in the structure", () => {
    expect(moveDestinations(groups, categories, { kind: "group", id: "nope" })).toEqual(
      [],
    );
  });
});
