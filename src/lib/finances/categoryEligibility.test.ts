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

describe("categoryEligibleIds — the budget's window", () => {
  const spend = (id: string, transactionDate: string) => ({
    id,
    accountId: "checking",
    transactionDate,
    transferGroupId: null,
    effectiveFlow: "spend",
  });

  it("leaves history before the budget's first month out of the backlog", () => {
    expect([
      ...categoryEligibleIds(
        [spend("before", "2026-07-31"), spend("first", "2026-08-01")],
        new Set(),
        "2026-08-01",
      ),
    ]).toEqual(["first"]);
  });

  it("has no backlog before a budget exists", () => {
    expect(
      categoryEligibleIds([spend("any", "2026-08-01")], new Set(), null).size,
    ).toBe(0);
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
    expect(
      categoryAssignmentRefusal({
        accountOffBudget: false,
        categoryAssignable: true,
        isSplitParent: true,
      }),
    ).toMatch(/from its children/);
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
