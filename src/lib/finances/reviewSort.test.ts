import { describe, expect, it } from "vitest";
import type { RecurringMerchant } from "./analytics";
import { DEFAULT_REVIEW_SORT, nextReviewSort, sortReviewItems } from "./reviewSort";

function item(
  over: Partial<RecurringMerchant> & Pick<RecurringMerchant, "merchant">,
): RecurringMerchant {
  return {
    payeeId: null,
    typicalCents: 1000,
    deviationCents: 0,
    lowCents: 1000,
    highCents: 1000,
    chargeCount: 4,
    observedGapDays: 30,
    annualCents: 12_000,
    lastChargeOn: "2026-01-01",
    cadence: null,
    declared: false,
    scheduled: true,
    status: "active",
    shape: "bill",
    chargeKeys: ["2026-01-01"],
    coverage: null,
    spendPeriod: null,
    ...over,
  };
}

describe("sortReviewItems", () => {
  it("defaults to the most recent charge first", () => {
    const sorted = sortReviewItems(
      [
        item({ merchant: "OLD", lastChargeOn: "2026-01-15" }),
        item({ merchant: "NEW", lastChargeOn: "2026-08-01" }),
        item({ merchant: "MID", lastChargeOn: "2026-04-01" }),
      ],
      DEFAULT_REVIEW_SORT,
    );
    expect(sorted.map((entry) => entry.merchant)).toEqual(["NEW", "MID", "OLD"]);
  });

  it("does not let a cheaper row float above a more expensive one when sorting by annual", () => {
    const sorted = sortReviewItems(
      [
        item({ merchant: "CHEAP", annualCents: 1200 }),
        item({ merchant: "DEAR", annualCents: 24_000 }),
      ],
      { column: "annual", direction: "desc" },
    );
    expect(sorted.map((entry) => entry.merchant)).toEqual(["DEAR", "CHEAP"]);
  });
});

describe("nextReviewSort", () => {
  it("reverses the same column and starts a money column descending", () => {
    expect(nextReviewSort(DEFAULT_REVIEW_SORT, "lastCharge")).toEqual({
      column: "lastCharge",
      direction: "asc",
    });
    expect(nextReviewSort(DEFAULT_REVIEW_SORT, "merchant")).toEqual({
      column: "merchant",
      direction: "asc",
    });
    expect(nextReviewSort({ column: "merchant", direction: "asc" }, "annual")).toEqual({
      column: "annual",
      direction: "desc",
    });
  });
});
