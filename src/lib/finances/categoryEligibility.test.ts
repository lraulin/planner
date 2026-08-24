import { describe, expect, it } from "vitest";
import { categoryEligibleIds } from "./categoryEligibility";

describe("categoryEligibleIds", () => {
  it("excludes on-budget transfers but includes the on-budget side of an off-budget transfer", () => {
    const rows = [
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
    expect([...categoryEligibleIds(rows, new Set(["savings"]), "2026-08-01")]).toEqual([
      "c",
    ]);
  });
});
