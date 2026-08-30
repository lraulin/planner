import { describe, expect, it } from "vitest";

import { applyGroupCollapse } from "@/lib/grid/collapse";
import { groupMembers } from "@/lib/grid/groupMembers";

import type { BudgetCategoryRow, BudgetGroupRow } from "./queries";
import type { BudgetRow } from "./rows";
import {
  budgetChildren,
  budgetEnvelopeLabel,
  budgetSiblings,
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
  kind: BudgetGroupRow["kind"] = "spending",
): BudgetGroupRow {
  return {
    id,
    parentGroupId,
    name: id,
    kind,
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
    snoozed: false,
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

  it("orders envelopes before groups, by name, ignoring stored sort keys", () => {
    const groups = [group("zoo", null, "A"), group("apple", null, "Z")];
    const categories = [
      category("milk", null, "A"),
      category("bread", null, "Z"),
      category("apple-juice", "apple", "A"),
    ];
    expect(budgetChildren(groups, categories, null).map((item) => item.id)).toEqual([
      "bread",
      "milk",
      "apple",
      "zoo",
    ]);
    expect(budgetChildren(groups, categories, "apple").map((item) => item.id)).toEqual([
      "apple-juice",
    ]);
  });

  it("puts a parent's own envelopes above its groups and emits recursive counts", () => {
    expect(
      budgetChildren(groups, categories, "spending").map((item) => item.id),
    ).toEqual(["discretionary", "bills"]);

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
      "discretionary:1",
      "bills:1:2",
      "other:2",
      "utilities:2:1",
      "electric:3",
    ]);
  });

  // The grid reads membership from position: a header owns every row after it until a
  // header at its own depth or shallower. `discretionary` belongs to `spending`, so
  // emitting it after the `utilities` header made it a `utilities` row — counted in that
  // total and hidden when `utilities` collapsed.
  it("never emits an envelope after a header it does not belong to", () => {
    const rows = nestedBudgetGridRows(
      groups,
      categories,
      categories.map((entry) => row(entry.id, entry.groupId)),
    );
    const members = groupMembers(rows);
    const idsUnder = (id: string) =>
      (members.get(id) ?? []).map((entry) => entry.id).sort();

    expect(idsUnder("spending")).toEqual(["discretionary", "electric", "other"]);
    expect(idsUnder("bills")).toEqual(["electric", "other"]);
    expect(idsUnder("utilities")).toEqual(["electric"]);

    expect(
      applyGroupCollapse(rows, new Set(["utilities"])).map((entry) => entry.id),
    ).toEqual(["spending", "discretionary", "bills", "other", "utilities"]);
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

  it("renders an envelope with no group at the section root, above the groups", () => {
    const ungrouped = category("rent", null, "A", "bill");
    expect(budgetChildren(groups, [ungrouped], null).map((item) => item.id)).toEqual([
      "rent",
      "spending",
    ]);
    // The empty headers used to be dropped. They are kept now, because a group nobody can
    // see is one nobody can add to or delete — see `2026-08-28-1613-group-kind/`.
    expect(
      nestedBudgetGridRows(groups, [ungrouped], [row("rent", null)]).map(
        (entry) => `${entry.kind}:${entry.id}`,
      ),
    ).toEqual(["node:rent", "group:spending", "group:bills", "group:utilities"]);
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
    const withIncome = [...groups, group("income", null, "Z", "income")];
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
  // A group states its own kind, so an empty one is not "unknown" — it is a savings group,
  // and a bill may not move into it.
  const groups = [
    group("income-grp", null, "A", "income"),
    group("spending-grp", null, "B"),
    group("bills", null, "C", "bill"),
    group("utilities", "bills", "A", "bill"),
    group("empty-savings", null, "D", "savings"),
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

  it("never offers a group of another kind", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "paycheck",
    }).map((entry) => entry.id);
    expect(ids).toEqual([]);
  });

  it("does not offer an empty group of the wrong kind", () => {
    // The old rule treated a group with no envelopes as "section unknown" and allowed it,
    // because it had nothing to infer from. A stored kind has an answer.
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "groceries",
    }).map((entry) => entry.id);
    expect(ids).not.toContain("empty-savings");
  });

  it("offers only bill groups to a bill", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "electric",
    }).map((entry) => entry.id);
    expect(ids).toEqual(["bills"]);
  });

  it("omits the group the item already sits in", () => {
    const ids = moveDestinations(groups, categories, {
      kind: "category",
      id: "electric",
    }).map((entry) => entry.id);
    expect(ids).not.toContain("utilities");
  });

  it("returns nothing for an item that is not in the structure", () => {
    expect(moveDestinations(groups, categories, { kind: "group", id: "nope" })).toEqual(
      [],
    );
  });
});

describe("budgetSiblings", () => {
  // Four tables share one `parent_group_id IS NULL`, so a bill and a savings envelope are
  // both "root children" while being in different orderings on screen.
  const groups = [group("bills", null, "B", "bill")];
  const categories = [
    category("rent", null, "A", "bill"),
    category("groceries", null, "C"),
    category("emergency", null, "D", "savings"),
    category("electric", "bills", "A", "bill"),
  ];

  it("returns only the moving item's own section at the root", () => {
    expect(
      budgetSiblings(groups, categories, null, "bill").map((item) => item.id),
    ).toEqual(["rent", "bills"]);
    expect(
      budgetSiblings(groups, categories, null, "savings").map((item) => item.id),
    ).toEqual(["emergency"]);
  });

  it("makes a root envelope's neighbour one it can actually move past", () => {
    // The bug this exists to stop: with every root child in one list, Rent's neighbour was
    // Groceries — a spending envelope — and `resolveBudgetDrop` refused the move, so "Move
    // down" did nothing at all. Name order puts the Bills group next to Rent, not Groceries.
    const siblings = budgetSiblings(groups, categories, null, "bill");
    const index = siblings.findIndex((item) => item.id === "rent");
    const neighbor = siblings[index + 1] ?? siblings[index - 1];
    if (!neighbor) throw new Error("rent should have a bill sibling");
    expect(neighbor.id).not.toBe("groceries");
    expect(
      resolveBudgetDrop(
        groups,
        categories,
        { kind: "category", id: "rent" },
        { kind: neighbor.kind, id: neighbor.id },
        siblings[index + 1] ? "after" : "before",
      ),
    ).not.toBeNull();
  });

  it("is just the children inside a group, which already share a kind", () => {
    expect(
      budgetSiblings(groups, categories, "bills", "bill").map((item) => item.id),
    ).toEqual(["electric"]);
  });
});
