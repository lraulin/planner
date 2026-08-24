import { describe, expect, it } from "vitest";

import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import type { BudgetRow } from "./rows";
import {
  budgetChildren,
  budgetEnvelopeLabel,
  budgetGroupDepths,
  descendantEnvelopeIds,
  nestedBudgetGridRows,
  resolveBudgetDrop,
} from "./hierarchy";

function group(
  id: string,
  parentGroupId: string | null,
  sortKey: string,
  isIncome = false,
): BudgetGroupRow {
  return {
    id,
    parentGroupId,
    name: id,
    isIncome,
    sortKey,
    hidden: false,
  };
}

function category(id: string, groupId: string, sortKey: string): BudgetCategoryRow {
  return {
    id,
    groupId,
    name: id,
    sortKey,
    hidden: false,
    notes: "",
    sourceCategories: [],
    templates: [],
    kind: "envelope",
    bill: null,
  };
}

function row(id: string, groupId: string): BudgetRow {
  return {
    id,
    groupId,
    sortKey: "A",
    name: id,
    isIncome: false,
    hidden: false,
    notes: "",
    sourceCategories: [],
    assignedCents: 0,
    activityCents: 0,
    balanceCents: 0,
    carryover: true,
    templates: [],
    goalCents: null,
    kind: "envelope",
    bill: null,
    nextDueKey: null,
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

  it("rejects a group inside its descendant and an envelope at the root", () => {
    expect(
      resolveBudgetDrop(
        groups,
        categories,
        { kind: "group", id: "spending" },
        { kind: "group", id: "utilities" },
        "inside",
      ),
    ).toBeNull();
    expect(
      resolveBudgetDrop(
        groups,
        categories,
        { kind: "category", id: "electric" },
        { kind: "group", id: "spending" },
        "after",
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

  it("refuses moves across the income and spending boundary", () => {
    const withIncome = [...groups, group("income", null, "Z", true)];
    expect(
      resolveBudgetDrop(
        withIncome,
        categories,
        { kind: "group", id: "bills" },
        { kind: "group", id: "income" },
        "inside",
      ),
    ).toBeNull();
  });
});
