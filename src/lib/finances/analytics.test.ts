import { describe, expect, it } from "vitest";
import {
  balanceSeries,
  baselineSplit,
  bucketRows,
  cashFlow,
  coverageGap,
  effectiveCategory,
  effectiveFlow,
  monthBuckets,
  oneOffSuggestions,
  paydaysFrom,
  payPeriodBuckets,
  recurringMerchants,
  rowsInRange,
  spendByCategory,
  trailingAverage,
  trailingRange,
  type AnalyticsRow,
} from "./analytics";

function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    accountId: "checking",
    accountName: "360 Checking",
    transactionDate: "2026-03-14",
    description: "WM SUPERCENTER #1981",
    amountCents: -8412,
    sourceCategory: "",
    category: null,
    derivedCategory: "Groceries",
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,
    excludeFromBaseline: false,
    eventLabel: "",
    ...overrides,
  };
}

describe("effectiveFlow", () => {
  it("prefers the user's correction over the classifier", () => {
    expect(effectiveFlow(row({ derivedFlow: "spend", flowOverride: "refund" }))).toBe(
      "refund",
    );
  });

  it("falls back on sign for a row imported since the last reclassify", () => {
    // Not dead code: dropping these would under-report spending without saying so.
    expect(effectiveFlow(row({ derivedFlow: null, amountCents: -500 }))).toBe("spend");
    expect(effectiveFlow(row({ derivedFlow: null, amountCents: 500 }))).toBe("refund");
  });
});

describe("effectiveCategory", () => {
  it("runs user, then classifier, then the bank's vocabulary, then an admission", () => {
    expect(effectiveCategory(row({ category: "Baby" }))).toBe("Baby");
    expect(effectiveCategory(row({ category: null }))).toBe("Groceries");
    expect(
      effectiveCategory(row({ derivedCategory: null, sourceCategory: "Gas" })),
    ).toBe("Gas & Auto");
    expect(effectiveCategory(row({ derivedCategory: null, sourceCategory: "" }))).toBe(
      "Uncategorized",
    );
  });
});

describe("monthBuckets", () => {
  it("covers every month a range touches, February and year rollover included", () => {
    const buckets = monthBuckets({ startKey: "2025-12-15", endKey: "2026-03-02" });

    expect(buckets.map((bucket) => bucket.key)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(buckets[2]).toMatchObject({
      label: "Feb 2026",
      startKey: "2026-02-01",
      endKey: "2026-02-28",
    });
  });
});

describe("bucketRows", () => {
  it("drops rows outside the calendar and keeps the rest in their window", () => {
    const buckets = monthBuckets({ startKey: "2026-02-01", endKey: "2026-03-31" });
    const grouped = bucketRows(
      [
        row({ transactionDate: "2026-01-31" }),
        row({ transactionDate: "2026-02-14" }),
        row({ transactionDate: "2026-03-01" }),
        row({ transactionDate: "2026-04-01" }),
      ],
      buckets,
    );

    expect(grouped.get("2026-02")).toHaveLength(1);
    expect(grouped.get("2026-03")).toHaveLength(1);
  });

  it("skips a row falling in a hole between pay periods", () => {
    const buckets = payPeriodBuckets([
      { startKey: "2026-03-06", endKey: "2026-03-19", paydays: [] },
      { startKey: "2026-04-03", endKey: "2026-04-16", paydays: [] },
    ]);
    const grouped = bucketRows([row({ transactionDate: "2026-03-25" })], buckets);

    expect(grouped.get("2026-03-06")).toHaveLength(0);
    expect(grouped.get("2026-04-03")).toHaveLength(0);
  });
});

describe("paydaysFrom", () => {
  it("reads one payday per employer per day, bonus folded into the check", () => {
    const paydays = paydaysFrom([
      row({
        transactionDate: "2026-03-06",
        description: "GA8248 TRUSTEDQA DIRDEP",
        amountCents: 231121,
        derivedFlow: "income",
      }),
      // Posts the same day as the check: one payday, not a pay period a day wide.
      row({
        transactionDate: "2026-03-06",
        description: "GA8248 TRUSTEDQA PAYROLL",
        amountCents: 50000,
        derivedFlow: "income",
      }),
      row({
        transactionDate: "2026-03-20",
        description: "GA8248 TRUSTEDQA DIRDEP",
        amountCents: 231121,
        derivedFlow: "income",
      }),
      row({ transactionDate: "2026-03-11", amountCents: -8412 }),
    ]);

    expect(paydays).toHaveLength(2);
    expect(paydays[0]).toMatchObject({ dateKey: "2026-03-06", amountCents: 281121 });
  });
});

describe("cashFlow", () => {
  it("reports spend as a positive cost, nets refunds off it, and ignores transfers", () => {
    const buckets = monthBuckets({ startKey: "2026-03-01", endKey: "2026-03-31" });
    const [point] = cashFlow(
      [
        row({ transactionDate: "2026-03-02", amountCents: -10000 }),
        row({
          transactionDate: "2026-03-03",
          amountCents: 2500,
          derivedFlow: "refund",
        }),
        row({
          transactionDate: "2026-03-04",
          amountCents: 250000,
          derivedFlow: "income",
        }),
        // Both legs of a card payment. Counting either would be a second helping of
        // spending already recorded on the card.
        row({
          transactionDate: "2026-03-05",
          amountCents: -129200,
          derivedFlow: "internal_transfer",
        }),
        row({
          transactionDate: "2026-03-06",
          amountCents: 129200,
          derivedFlow: "internal_transfer",
        }),
      ],
      buckets,
    );

    expect(point).toMatchObject({
      spendCents: 7500,
      incomeCents: 250000,
      netCents: 242500,
    });
  });

  it("leaves the rolling average null until the window is actually full", () => {
    // A "trailing 12" computed from three months is a different statistic wearing the same
    // label, and always the flattering one.
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-04-30" });
    const points = cashFlow(
      buckets.map((bucket) =>
        row({ transactionDate: bucket.startKey, amountCents: -10000 }),
      ),
      buckets,
      3,
    );

    expect(points.map((point) => point.trailingSpendCents)).toEqual([
      null,
      null,
      10000,
      10000,
    ]);
  });
});

describe("trailingAverage", () => {
  it("averages the window ending at each index", () => {
    expect(trailingAverage([10, 20, 30, 40], 2)).toEqual([null, 15, 25, 35]);
  });
});

describe("baselineSplit", () => {
  it("keeps ongoing and one-off spending as two numbers and names the events", () => {
    const rows = [
      row({ amountCents: -210000 }),
      row({ amountCents: -8412 }),
      row({ amountCents: -2000000, excludeFromBaseline: true, eventLabel: "Wedding" }),
      row({
        amountCents: -450000,
        excludeFromBaseline: true,
        eventLabel: "House move",
      }),
      row({ amountCents: -60000, excludeFromBaseline: true, eventLabel: "" }),
    ];
    const split = baselineSplit(rows, 2);

    expect(split.baselineCents).toBe(218412);
    expect(split.oneOffCents).toBe(2510000);
    expect(split.baselinePerBucketCents).toBe(109206);
    expect(split.events.map((event) => event.label)).toEqual([
      "Wedding",
      "House move",
      "Unnamed one-off",
    ]);
  });
});

describe("spendByCategory", () => {
  it("ranks categories by cost and reports each one's share", () => {
    const totals = spendByCategory([
      row({ amountCents: -210000, derivedCategory: "Rent & Housing" }),
      row({ amountCents: -8412, derivedCategory: "Groceries" }),
      row({ amountCents: -1588, derivedCategory: "Groceries" }),
      row({ amountCents: 250000, derivedFlow: "income", derivedCategory: null }),
    ]);

    expect(totals.map((entry) => [entry.category, entry.cents])).toEqual([
      ["Rent & Housing", 210000],
      ["Groceries", 10000],
    ]);
    expect(totals[1].share).toBeCloseTo(10000 / 220000);
  });
});

describe("recurringMerchants", () => {
  /** Twelve monthly charges, the way a subscription actually posts. */
  function monthlyCharges(description: string, amounts: readonly number[]) {
    return amounts.map((cents, index) =>
      row({
        description,
        derivedCategory: "Utilities",
        transactionDate: `2025-${String(index + 1).padStart(2, "0")}-14`,
        amountCents: -cents,
      }),
    );
  }

  it("finds a subscription by its variance alone, and annualizes it", () => {
    const found = recurringMerchants([
      ...monthlyCharges("SIMPLISAFE 8888957880", Array(12).fill(3471)),
      // Same shop every month, wildly different amounts: a habit, not a bill.
      ...monthlyCharges(
        "WM SUPERCENTER #1981",
        [4200, 18800, 9100, 2200, 31000, 7600, 15400, 5000, 22000, 8800, 12100, 3300],
      ),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      typicalCents: 3471,
      deviationCents: 0,
      chargeCount: 12,
    });
    // $34.71 a month is invisible; $408 a year is a decision.
    expect(found[0].cadenceDays).toBe(31);
    expect(found[0].annualCents).toBe(40868);
  });

  it("ignores a merchant with too few charges to have a cadence", () => {
    expect(
      recurringMerchants([
        row({ description: "METLIFE PET", transactionDate: "2026-01-14" }),
        row({ description: "METLIFE PET", transactionDate: "2026-02-14" }),
        row({ description: "METLIFE PET", transactionDate: "2026-03-14" }),
      ]),
    ).toEqual([]);
  });
});

describe("oneOffSuggestions", () => {
  it("proposes the outsized charges and withholds recurring bills", () => {
    const ordinary = Array.from({ length: 30 }, (_, index) =>
      row({
        transactionDate: `2026-03-${String(index + 1).padStart(2, "0")}`,
        amountCents: -4000,
      }),
    );
    const rent = Array.from({ length: 12 }, (_, index) =>
      row({
        description: "TURBOTENANT.COM RENT:RAULI",
        transactionDate: `2026-${String(index + 1).padStart(2, "0")}-01`,
        amountCents: -210000,
      }),
    );
    const wedding = row({
      description: "THE INN AT BRUSH CREEK",
      transactionDate: "2026-05-02",
      amountCents: -2000000,
    });

    const suggestions = oneOffSuggestions([...ordinary, ...rent, wedding]);

    expect(suggestions.map((entry) => entry.row.id)).toEqual([wedding.id]);
    expect(suggestions[0].cents).toBe(2000000);
  });

  it("stops suggesting a row once it has been confirmed", () => {
    const wedding = row({
      transactionDate: "2026-05-02",
      amountCents: -2000000,
      excludeFromBaseline: true,
      eventLabel: "Wedding",
    });
    expect(oneOffSuggestions([wedding])).toEqual([]);
  });
});

describe("balanceSeries", () => {
  it("carries money that predates the window and runs the total forward", () => {
    const buckets = monthBuckets({ startKey: "2026-02-01", endKey: "2026-03-31" });
    const points = balanceSeries(
      [
        row({ transactionDate: "2026-01-15", amountCents: 500000 }),
        row({ transactionDate: "2026-02-10", amountCents: -100000 }),
        row({ transactionDate: "2026-03-10", amountCents: -50000 }),
      ],
      buckets,
    );

    expect(points.map((point) => point.balanceCents)).toEqual([400000, 350000]);
  });
});

describe("coverageGap", () => {
  it("names the day the category charts become complete and what they miss before it", () => {
    const gap = coverageGap([
      row({
        accountId: "checking",
        accountName: "360 Checking",
        transactionDate: "2023-08-04",
        amountCents: -84300,
        derivedFlow: "internal_transfer",
      }),
      row({
        accountId: "checking",
        accountName: "360 Checking",
        transactionDate: "2024-01-04",
        amountCents: -24948,
        derivedFlow: "internal_transfer",
      }),
      // Paired, so it hides nothing: the savings moved and both legs are right here.
      row({
        accountId: "checking",
        accountName: "360 Checking",
        transactionDate: "2024-02-01",
        amountCents: -500000,
        derivedFlow: "internal_transfer",
        transferGroupId: "moved-to-savings",
      }),
      row({
        accountId: "capone-card",
        accountName: "Capital One •••3448",
        transactionDate: "2025-08-10",
        amountCents: -1200,
      }),
    ]);

    expect(gap.completeFrom).toBe("2025-08-10");
    expect(gap.lateAccounts).toEqual([
      { accountName: "Capital One •••3448", firstSeen: "2025-08-10" },
    ]);
    // The lump payments are the only trace of what was actually bought.
    expect(gap.unitemizedCents).toBe(109248);
  });

  it("reports no gap when every account starts together", () => {
    const gap = coverageGap([
      row({ accountId: "a", transactionDate: "2026-01-01" }),
      row({ accountId: "b", transactionDate: "2026-01-01" }),
    ]);
    expect(gap.completeFrom).toBeNull();
    expect(gap.lateAccounts).toEqual([]);
  });
});

describe("trailingRange", () => {
  it("counts whole calendar months back, including the one it ends in", () => {
    expect(trailingRange("2026-08-13", 12)).toEqual({
      startKey: "2025-09-01",
      endKey: "2026-08-13",
    });
  });
});

describe("rowsInRange", () => {
  it("is inclusive at both ends", () => {
    const rows = [
      row({ transactionDate: "2026-02-28" }),
      row({ transactionDate: "2026-03-01" }),
      row({ transactionDate: "2026-03-31" }),
      row({ transactionDate: "2026-04-01" }),
    ];
    expect(
      rowsInRange(rows, { startKey: "2026-03-01", endKey: "2026-03-31" }),
    ).toHaveLength(2);
  });
});
