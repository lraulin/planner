import { describe, expect, it } from "vitest";
import {
  assignHistoryWithLookback,
  assignScopeFromSelection,
  isFutureBudgetMonth,
  preStartAssignHistory,
} from "./fromBudget";

describe("isFutureBudgetMonth", () => {
  it("is true only for months after today", () => {
    expect(isFutureBudgetMonth("2026-09-01", "2026-08-25")).toBe(true);
    expect(isFutureBudgetMonth("2026-08-01", "2026-08-25")).toBe(false);
    expect(isFutureBudgetMonth("2026-07-01", "2026-08-25")).toBe(false);
  });
});

describe("preStartAssignHistory", () => {
  it("fills Assigned with 0 and keeps categorised spend from before the start month", () => {
    const history = preStartAssignHistory(
      "2026-08-01",
      ["food"],
      [{ month: "2026-07-01", categoryId: "food", amountCents: -4_200 }],
      2,
    );
    expect(history).toEqual([
      {
        month: "2026-06-01",
        assigned: { food: 0 },
        activity: { food: 0 },
      },
      {
        month: "2026-07-01",
        assigned: { food: 0 },
        activity: { food: -4_200 },
      },
    ]);
  });
});

describe("assignHistoryWithLookback", () => {
  it("puts lookback months in front of the folded budget months", () => {
    const folded = [
      {
        month: "2026-08-01",
        categories: {
          food: {
            categoryId: "food",
            assignedCents: 5_000,
            activityCents: -1_000,
            balanceCents: 4_000,
            carryover: true,
          },
        },
      },
    ];
    const history = assignHistoryWithLookback(
      folded as never,
      ["food"],
      [{ month: "2026-07-01", categoryId: "food", amountCents: -4_200 }],
      "2026-08-01",
    );
    expect(history.at(-1)).toMatchObject({
      month: "2026-08-01",
      assigned: { food: 5_000 },
      activity: { food: -1_000 },
    });
    expect(history.find((entry) => entry.month === "2026-07-01")).toMatchObject({
      assigned: { food: 0 },
      activity: { food: -4_200 },
    });
  });
});

describe("assignScopeFromSelection", () => {
  const groups = [
    { id: "food", parentGroupId: null },
    { id: "eating-out", parentGroupId: "food" },
  ];
  const categories = [
    { id: "groceries", groupId: "food" },
    { id: "dining", groupId: "eating-out" },
    { id: "rent", groupId: null },
    // Same group, other table: a bill selected through its group is not this section's.
    { id: "meal-kit", groupId: "food" },
  ];
  const section = [{ id: "groceries" }, { id: "dining" }, { id: "rent" }];

  it("is the whole month when nothing is selected", () => {
    expect(assignScopeFromSelection(new Set(), section, groups, categories)).toBe(
      undefined,
    );
  });

  it("keeps a selected envelope of the section", () => {
    expect(
      assignScopeFromSelection(new Set(["rent"]), section, groups, categories),
    ).toEqual(["rent"]);
  });

  it("expands a selected group to its envelopes in this section at any depth", () => {
    expect(
      assignScopeFromSelection(new Set(["food"]), section, groups, categories),
    ).toEqual(["groceries", "dining"]);
  });

  it("falls back to the whole month when the selection names nothing in the section", () => {
    expect(
      assignScopeFromSelection(new Set(["meal-kit"]), section, groups, categories),
    ).toBe(undefined);
  });
});
