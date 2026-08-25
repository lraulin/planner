import { describe, expect, it } from "vitest";
import {
  categoryAssignableIds,
  categoryAssignmentRefusal,
  categoryEligibleIds,
  partitionCategoryTargets,
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

describe("partitionCategoryTargets", () => {
  it("keeps assignable rows and skips ineligible ones with their refusal", () => {
    const result = partitionCategoryTargets(
      ["ok", "off", "xfer"],
      [
        { id: "ok", accountOffBudget: false, categoryAssignable: true },
        { id: "off", accountOffBudget: true, categoryAssignable: false },
        { id: "xfer", accountOffBudget: false, categoryAssignable: false },
      ],
    );
    expect(result.assignable).toEqual(["ok"]);
    expect(result.skipped.map((row) => row.id)).toEqual(["off", "xfer"]);
  });

  it("omits ids that did not load, so another user's row is not advertised", () => {
    const result = partitionCategoryTargets(
      ["mine", "theirs"],
      [{ id: "mine", accountOffBudget: false, categoryAssignable: true }],
    );
    expect(result.assignable).toEqual(["mine"]);
    expect(result.skipped).toEqual([]);
  });
});
