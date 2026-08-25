import { describe, expect, it } from "vitest";
import {
  categoryAssignableIds,
  categoryAssignmentRefusal,
  categoryEligibleIds,
} from "./categoryEligibility";

const ROWS = [
  {
    id: "a",
    accountId: "checking",
    transactionDate: "2026-08-01",
    transferGroupId: "inside",
    effectiveFlow: "internal_transfer",
  },
  {
    id: "b",
    accountId: "card",
    transactionDate: "2026-08-01",
    transferGroupId: "inside",
    effectiveFlow: "internal_transfer",
  },
  {
    id: "c",
    accountId: "checking",
    transactionDate: "2026-08-02",
    transferGroupId: "outside",
    effectiveFlow: "internal_transfer",
  },
  {
    id: "d",
    accountId: "savings",
    transactionDate: "2026-08-02",
    transferGroupId: "outside",
    effectiveFlow: "internal_transfer",
  },
  {
    id: "e",
    accountId: "checking",
    transactionDate: "2026-08-03",
    transferGroupId: null,
    effectiveFlow: "internal_transfer",
  },
];

describe("categoryEligibleIds", () => {
  it("excludes on-budget transfers but includes the on-budget side of an off-budget transfer", () => {
    expect([...categoryEligibleIds(ROWS, new Set(["savings"]), "2026-08-01")]).toEqual([
      "c",
    ]);
  });
});

describe("categoryAssignableIds", () => {
  it("uses the same transfer boundary as the backlog without excluding history", () => {
    const historicalSpend = {
      id: "old",
      accountId: "checking",
      transactionDate: "2025-12-31",
      transferGroupId: null,
      effectiveFlow: "spend",
    };

    expect([
      ...categoryAssignableIds([...ROWS, historicalSpend], new Set(["savings"])),
    ]).toEqual(["c", "old"]);
  });

  it("names why each non-budgeted Category editor is unavailable", () => {
    expect(
      categoryAssignmentRefusal({
        accountOffBudget: true,
        categoryAssignable: false,
      }),
    ).toMatch(/outside the envelope budget/);
    expect(
      categoryAssignmentRefusal({
        accountOffBudget: false,
        categoryAssignable: false,
      }),
    ).toMatch(/Transfers between on-budget accounts/);
    expect(
      categoryAssignmentRefusal({
        accountOffBudget: false,
        categoryAssignable: true,
      }),
    ).toBeNull();
  });
});
