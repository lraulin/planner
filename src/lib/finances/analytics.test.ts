import { describe, expect, it } from "vitest";
import { shiftDateKey } from "@/lib/schedule/geometry";
import {
  balanceSeries,
  baselineSplit,
  bucketRows,
  cadenceCandidates,
  cashFlow,
  coverageGap,
  effectiveCategory,
  effectiveFlow,
  monthBuckets,
  monthlyIncome,
  oneOffSuggestions,
  paydaysFrom,
  spendCandidates,
  payPeriodBuckets,
  recurringMerchants,
  rowsInRange,
  incomeCentsOf,
  spendByCategory,
  spendByCategoryPerBucket,
  spendByMerchant,
  typicalIncomePerBucketCents,
  upcomingBills,
  spendCentsOf,
  trailingAverage,
  trailingRange,
  TREND_OTHER,
  assetDebtSeries,
  accountContributions,
  debtToAssetRatio,
  type AnalyticsRow,
} from "./analytics";

function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  const description = overrides.description ?? "WM SUPERCENTER #1981";
  return {
    id: crypto.randomUUID(),
    accountId: "checking",
    accountName: "360 Checking",
    accountKind: "checking",
    transactionDate: "2026-03-14",
    description,
    amountCents: -8412,
    sourceCategory: "",
    category: null,
    derivedCategory: "Groceries",
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,
    excludeFromBaseline: false,
    eventLabel: "",
    plannedWithdrawal: false,
    payeeId: description,
    payeeName: null,
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

/** Fortnightly deposits from one employer, the shape a real payroll series has. */
function paycheckSeries(count: number, startKey = "2026-01-02", amountCents = 231121) {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    row({
      transactionDate: new Date(start + index * 14 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      description: "GA8248 TRUSTEDQA DIRDEP",
      amountCents,
      derivedFlow: "income",
    }),
  );
}

/** A monthly benefit: reliable income, but never a paycheck. */
function monthlyBenefit(count: number) {
  return Array.from({ length: count }, (_, index) =>
    row({
      transactionDate: `2026-${String(index + 1).padStart(2, "0")}-05`,
      description: "VACP TREAS 310 XXVA BENEFIT",
      amountCents: 18000,
      derivedFlow: "income",
    }),
  );
}

describe("paydaysFrom", () => {
  it("reads one payday per employer per day, bonus folded into the check", () => {
    const series = paycheckSeries(6);
    const paydays = paydaysFrom([
      ...series,
      // Posts the same day as the first check: one payday, not a period a day wide.
      row({
        transactionDate: series[0].transactionDate,
        description: "GA8248 TRUSTEDQA PAYROLL",
        amountCents: 50000,
        derivedFlow: "income",
      }),
      row({ transactionDate: "2026-01-11", amountCents: -8412 }),
    ]);

    expect(paydays).toHaveLength(6);
    expect(paydays[0]).toMatchObject({
      dateKey: series[0].transactionDate,
      amountCents: 231121 + 50000,
    });
  });

  it("does not let a monthly benefit open a pay period", () => {
    /*
     * The bug this pins: grouping every income row by date made a $180 monthly disability
     * payment its own payday, and 31 of 104 periods on the real data were that benefit —
     * splitting the biweekly calendar into windows whose only income was $180.
     */
    const paydays = paydaysFrom([...paycheckSeries(8), ...monthlyBenefit(6)]);

    expect(paydays).toHaveLength(8);
    expect(paydays.every((payday) => payday.amountCents === 231121)).toBe(true);
  });
});

describe("monthlyIncome", () => {
  const range = { startKey: "2026-01-01", endKey: "2026-06-30" };

  it("adds reliable non-paycheck income without folding it into the paycheck median", () => {
    const rows = [...paycheckSeries(13), ...monthlyBenefit(6)];
    const income = monthlyIncome(rows, paydaysFrom(rows), range);

    // The benefit must not drag the median down — that is what would deflate × 26 ÷ 12.
    expect(income.medianPaycheckCents).toBe(231121);
    expect(income.paycheckMonthlyCents).toBe(500762);
    // Six monthly $180 payments over the window's six months.
    expect(income.otherMonthlyCents).toBe(18000);
    expect(income.totalMonthlyCents).toBe(518762);
  });

  it("reports nothing rather than a wrong figure when no paycheck series exists", () => {
    const rows = monthlyBenefit(6);
    const income = monthlyIncome(rows, paydaysFrom(rows), range);

    expect(income.paydayCount).toBe(0);
    expect(income.paycheckMonthlyCents).toBe(0);
    expect(income.otherMonthlyCents).toBe(18000);
  });
});

describe("typicalIncomePerBucketCents", () => {
  const income = {
    paycheckMonthlyCents: 500762,
    otherMonthlyCents: 18000,
    totalMonthlyCents: 518762,
    medianPaycheckCents: 231121,
    paydayCount: 13,
  };

  it("is the typical-month figure on a month axis", () => {
    expect(typicalIncomePerBucketCents(income, "month")).toBe(518762);
  });

  it("restates the same money per paycheck so a monthly line does not sit above two-week bars", () => {
    // 518762 × 12 ÷ 26. Same as median paycheck plus other income per period.
    expect(typicalIncomePerBucketCents(income, "pay-period")).toBe(239429);
  });

  it("is absent when there is no typical income to plot", () => {
    expect(
      typicalIncomePerBucketCents(
        {
          paycheckMonthlyCents: 0,
          otherMonthlyCents: 0,
          totalMonthlyCents: 0,
          medianPaycheckCents: 0,
          paydayCount: 0,
        },
        "month",
      ),
    ).toBe(0);
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

  it("reports external transfers as their own signed term, outside net", () => {
    const buckets = monthBuckets({ startKey: "2026-03-01", endKey: "2026-03-31" });
    const [point] = cashFlow(
      [
        // A gift from a parent, arriving via PayPal. It funds the month without being
        // earned, so it must not reach incomeCents — and must not vanish either.
        row({
          transactionDate: "2026-03-02",
          amountCents: 200000,
          derivedFlow: "external_transfer",
        }),
        // A sweep out to a bank this module cannot see. Still ours, so not a cost.
        row({
          transactionDate: "2026-03-03",
          amountCents: -50000,
          derivedFlow: "external_transfer",
        }),
      ],
      buckets,
    );

    expect(point).toMatchObject({
      incomeCents: 0,
      spendCents: 0,
      netCents: 0,
      externalTransferCents: 150000,
    });
  });

  it("carries a net trailing average, signed, for the net view", () => {
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-03-31" });
    const points = cashFlow(
      [
        // Two months in surplus, one badly under.
        row({
          transactionDate: "2026-01-05",
          amountCents: 300000,
          derivedFlow: "income",
        }),
        row({ transactionDate: "2026-01-20", amountCents: -100000 }),
        row({
          transactionDate: "2026-02-05",
          amountCents: 300000,
          derivedFlow: "income",
        }),
        row({ transactionDate: "2026-02-20", amountCents: -100000 }),
        row({ transactionDate: "2026-03-20", amountCents: -400000 }),
      ],
      buckets,
      { window: 3 },
    );

    expect(points.map((point) => point.netCents)).toEqual([200000, 200000, -400000]);
    // Only the last bucket has three behind it: (200000 + 200000 − 400000) / 3 = 0.
    expect(points.map((point) => point.trailingNetCents)).toEqual([null, null, 0]);
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
      { window: 3 },
    );

    expect(points.map((point) => point.trailingSpendCents)).toEqual([
      null,
      null,
      10000,
      10000,
    ]);
  });
});

describe("interest runs both ways", () => {
  it("counts an interest charge as a cost", () => {
    const charge = row({
      description: "INTEREST CHARGE ON PURCHASES",
      amountCents: -3109,
      derivedFlow: "interest_fee",
    });
    expect(spendCentsOf(charge)).toBe(3109);
    expect(incomeCentsOf(charge)).toBe(0);
  });

  it("counts interest earned as money in, never as negative spending", () => {
    /*
     * The bug this pins: `interest_fee` covers both the cost of holding an account and the
     * interest a savings account pays you. Treating the credit as a cost made a quiet
     * fortnight in 2023 report −$117 of outgoings, because $117 of savings interest was the
     * only thing in it.
     */
    const earned = row({
      description: "Monthly Interest Paid",
      amountCents: 11734,
      derivedFlow: "interest_fee",
    });
    expect(spendCentsOf(earned)).toBe(0);
    expect(incomeCentsOf(earned)).toBe(11734);
  });

  it("never reports negative money out for a period holding only interest earned", () => {
    const buckets = monthBuckets({ startKey: "2023-10-01", endKey: "2023-10-31" });
    const [point] = cashFlow(
      [
        row({
          transactionDate: "2023-10-31",
          description: "Monthly Interest Paid",
          amountCents: 11734,
          derivedFlow: "interest_fee",
        }),
      ],
      buckets,
    );

    expect(point.spendCents).toBe(0);
    expect(point.incomeCents).toBe(11734);
  });
});

describe("fixed vs variable", () => {
  /** A monthly bill, twelve times — enough for the recurring detector to know its cadence. */
  function rent(months: number) {
    return Array.from({ length: months }, (_, index) =>
      row({
        transactionDate: `2026-${String(index + 1).padStart(2, "0")}-01`,
        description: "TURBOTENANT.COM RENT:RAULI",
        amountCents: -210000,
      }),
    );
  }

  it("separates the bills from the half that is a decision each period", () => {
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-12-31" });
    const points = cashFlow(
      [...rent(12), row({ transactionDate: "2026-01-14", amountCents: -8412 })],
      buckets,
    );

    expect(points[0]).toMatchObject({
      fixedCents: 210000,
      variableCents: 8412,
      spendCents: 218412,
    });
    expect(points[1]).toMatchObject({ fixedCents: 210000, variableCents: 0 });
  });

  it("levels a monthly bill across the fortnights it covers, changing no total", () => {
    /*
     * The artifact this removes: rent is monthly and a pay period is a fortnight, so one
     * period in every ~2.17 takes the whole $2,100 and the rest take none. Levelling moves
     * cost *within* the chart — every total has to come out identical or the chart has
     * started inventing money.
     */
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-12-31" });
    const rows = rent(12);
    const plain = cashFlow(rows, buckets);
    const levelled = cashFlow(rows, buckets, { levelRecurring: true });

    const sum = (points: typeof plain) =>
      points.reduce((total, point) => total + point.spendCents, 0);
    expect(sum(levelled)).toBe(sum(plain));
    expect(sum(levelled)).toBe(12 * 210000);

    // Each charge covers ~31 days, so a calendar month still holds about one rent — the
    // point of the exercise is what it does to a fortnightly axis, tested below.
    for (const point of levelled) {
      expect(point.fixedCents).toBeGreaterThan(0);
    }
  });

  it("flattens the fortnight-sized swing a monthly bill creates", () => {
    // Two-week buckets across a year, which is what a pay-period axis actually looks like.
    const buckets = Array.from({ length: 26 }, (_, index) => {
      const start = new Date(Date.UTC(2026, 0, 1) + index * 14 * 86_400_000);
      const end = new Date(start.getTime() + 13 * 86_400_000);
      const key = start.toISOString().slice(0, 10);
      return {
        key,
        label: key,
        startKey: key,
        endKey: end.toISOString().slice(0, 10),
      };
    });
    const rows = rent(12);

    const spread = (points: { fixedCents: number }[]) => {
      const values = points.map((point) => point.fixedCents);
      const mean = values.reduce((t, v) => t + v, 0) / values.length;
      return Math.sqrt(values.reduce((t, v) => t + (v - mean) ** 2, 0) / values.length);
    };

    const plain = cashFlow(rows, buckets);
    const levelled = cashFlow(rows, buckets, { levelRecurring: true });

    // Unlevelled, a period either holds the whole rent or none of it.
    expect(spread(plain)).toBeGreaterThan(90_000);
    // Levelled, every period carries roughly the same share.
    expect(spread(levelled)).toBeLessThan(20_000);
    expect(levelled.reduce((total, point) => total + point.fixedCents, 0)).toBe(
      plain.reduce((total, point) => total + point.fixedCents, 0),
    );
  });

  it("leaves a one-off purchase where it happened", () => {
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-12-31" });
    const points = cashFlow(
      [...rent(12), row({ transactionDate: "2026-02-14", amountCents: -200000 })],
      buckets,
      { levelRecurring: true },
    );

    // Not a recurring merchant, so levelling must not touch it: the whole charge stays in
    // February, and no other month picks any of it up.
    expect(points[1].variableCents).toBe(200000);
    expect(points.filter((point) => point.variableCents !== 0)).toHaveLength(1);
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
    expect(found[0].observedGapDays).toBe(31);
    expect(found[0].annualCents).toBe(40868);
  });

  it("reports the range a bill actually swings across, as positive costs", () => {
    // Schedule and amount are independent axes: an electric bill arrives every month and
    // costs whatever the weather decided. One median would state that as a fact.
    const found = recurringMerchants(
      monthlyCharges(
        "SMECO",
        [
          18827, 19500, 20000, 21000, 22319, 23000, 24000, 26000, 28000, 29000, 30000,
          31113,
        ],
      ),
    );

    expect(found[0]).toMatchObject({ lowCents: 18827, highCents: 31113 });
    // Costs, not signed amounts — a sign slip here would report a negative floor.
    expect(found[0].lowCents).toBeGreaterThan(0);
  });

  it("does not detect a bill whose amount swings past the variance band at all", () => {
    /*
     * SMECO over its whole history runs $77.95 to $311.13 — a 4× swing whose deviation is
     * far outside `RECURRING_VARIANCE_RATIO`, so it is not a "subscription" by this
     * function's definition and lands in variable spend instead. Worth pinning because it
     * is the case that has to be **declared**: detection cannot rescue a bill that regular
     * in date and wild in amount, and it will not pretend otherwise.
     */
    expect(
      recurringMerchants(
        monthlyCharges(
          "SMECO",
          [
            7795, 9100, 12000, 15500, 18827, 22319, 25000, 28000, 31113, 20000, 14000,
            9500,
          ],
        ),
      ),
    ).toEqual([]);
  });

  it("collapses the range onto the declared amount when no charge is on file", () => {
    // Otherwise a bill with no history would print a range invented out of nothing.
    const found = recurringMerchants([], [geicoBill]);
    expect(found[0]).toMatchObject({ lowCents: 141260, highCents: 141260 });
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

  it("withholds a declared bill that detection could never have found", () => {
    // Two charges eight months apart: under the six-charge floor and over the 100-day
    // cadence cap, so `recurringMerchants` will never claim it. Before the declaration
    // existed this row had no way off the list.
    const ordinary = Array.from({ length: 30 }, (_, index) =>
      row({
        transactionDate: `2026-03-${String(index + 1).padStart(2, "0")}`,
        amountCents: -4000,
      }),
    );
    const premiums = [
      row({
        description: "GEICO *AUTO",
        transactionDate: "2025-09-04",
        amountCents: -138900,
      }),
      row({
        description: "GEICO *AUTO",
        transactionDate: "2026-03-03",
        amountCents: -141260,
      }),
    ];

    expect(
      oneOffSuggestions([...ordinary, ...premiums]).map((entry) => entry.merchant),
    ).toEqual(["Geico", "Geico"]);

    expect(
      oneOffSuggestions([...ordinary, ...premiums], { bills: [geicoBill] }),
    ).toEqual([]);
  });

  it("keeps withholding a declared bill in a window holding none of its charges", () => {
    const solitary = row({
      description: "GEICO *AUTO",
      transactionDate: "2026-03-03",
      amountCents: -141260,
    });
    // One charge, so the declared merchant contributes nothing to the recurring table — the
    // suppression cannot be left to depend on that table having produced a row.
    expect(oneOffSuggestions([solitary], { bills: [geicoBill] })).toEqual([]);
  });
});

/** Geico's real shape: a semi-annual premium, declared because it cannot be detected. */
const geicoBill = {
  name: "Geico",
  payeeIds: ["GEICO *AUTO"],
  cadenceMonths: 6,
  expectedCents: 141260,
  anchorDate: null,
  scheduled: true,
};

describe("recurringMerchants with declared bills", () => {
  it("lists a declared bill with a year of it costed, from no charges at all", () => {
    const found = recurringMerchants([], [geicoBill]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      merchant: "Geico",
      typicalCents: 141260,
      annualCents: 282520,
      cadence: { unit: "month", n: 6 },
      chargeCount: 0,
      declared: true,
    });
  });

  it("prefers the declared amount over the median of the charges on file", () => {
    const charges = [
      row({
        description: "GEICO *AUTO",
        transactionDate: "2026-03-03",
        amountCents: -1,
      }),
    ];
    expect(recurringMerchants(charges, [geicoBill])[0].typicalCents).toBe(141260);
  });

  it("falls back to the charges when no amount was declared", () => {
    const charges = [
      row({
        description: "GEICO *AUTO",
        transactionDate: "2026-03-03",
        amountCents: -141260,
      }),
    ];
    const found = recurringMerchants(charges, [{ ...geicoBill, expectedCents: null }]);
    expect(found[0].typicalCents).toBe(141260);
  });

  it("prices a declared bill from the whole history, not the visible window", () => {
    // The propane case: the window is a trailing year and the last delivery was fourteen
    // months ago. Reading the amount from the window would drop the row entirely, so the
    // commitment would blink out of the table exactly when someone narrowed the range.
    const history = [
      row({
        description: "TAYLOR GAS HEATING AIR",
        transactionDate: "2025-10-24",
        amountCents: -33_583,
      }),
    ];
    const bill = {
      name: "Taylor Gas",
      payeeIds: ["TAYLOR GAS HEATING AIR"],
      cadenceMonths: 6,
      expectedCents: null,
      anchorDate: null,
      scheduled: true,
    };

    expect(recurringMerchants([], [bill])).toEqual([]);
    expect(recurringMerchants([], [bill], history)[0]).toMatchObject({
      merchant: "Taylor Gas",
      typicalCents: 33_583,
      annualCents: 67_166,
      declared: true,
    });
  });

  it("does not also detect a merchant that has been declared", () => {
    // Twelve monthly charges would normally be detected. Declaring it quarterly is the
    // user disagreeing, and one merchant may not appear twice with two different answers.
    const charges = Array.from({ length: 12 }, (_, index) =>
      row({
        description: "SIMPLISAFE 8888957880",
        transactionDate: `2025-${String(index + 1).padStart(2, "0")}-14`,
        amountCents: -3471,
      }),
    );
    const found = recurringMerchants(charges, [
      {
        name: "SimpliSafe",
        payeeIds: ["SIMPLISAFE 8888957880"],
        cadenceMonths: 3,
        expectedCents: null,
        anchorDate: null,
        scheduled: true,
      },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      cadence: { unit: "month", n: 3 },
      declared: true,
    });
    expect(found[0].annualCents).toBe(13884);
  });

  it("costs a declared bill from every matcher, not just the name", () => {
    // Pizza Hut and Domino's are two bank strings and one commitment. Without matchers
    // the charges sit under their own names and the declaration would look empty.
    const charges = [
      row({
        description: "ACME MART",
        transactionDate: "2026-01-09",
        amountCents: -2800,
      }),
      row({
        description: "BOB'S GROCERY",
        transactionDate: "2026-01-16",
        amountCents: -3200,
      }),
    ];
    const found = recurringMerchants(charges, [
      {
        name: "Groceries",
        payeeIds: ["ACME MART", "BOB'S GROCERY"],
        cadenceMonths: 1,
        expectedCents: null,
        anchorDate: null,
        scheduled: true,
      },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      merchant: "Groceries",
      chargeCount: 2,
      typicalCents: 3000,
      declared: true,
    });
  });

  it("keeps a cancelled bill on the list and off every total that would count it", () => {
    const found = recurringMerchants([], [{ ...geicoBill, status: "cancelled" }]);
    expect(found[0]).toMatchObject({ merchant: "Geico", status: "cancelled" });
    expect(recurringMerchants([], [{ ...geicoBill, status: "ignored" }])).toEqual([]);
  });
});

describe("spendCandidates", () => {
  /**
   * The real Walmart shape: a weekly shop, mid-week trips, amounts from $10 to $348, and
   * five weeks in the last twenty-six with no visit at all.
   */
  function walmartWeeks(weeks: number, skip: readonly number[] = []) {
    const rows = [];
    for (let week = 0; week < weeks; week++) {
      if (skip.includes(week)) continue;
      rows.push(
        row({
          description: "WM SUPERCENTER #1981",
          transactionDate: shiftDateKey("2026-02-22", week * 7),
          // Wildly variable on purpose: this is what the bill detector rejects.
          amountCents: -(1056 + ((week * 7919) % 33_700)),
        }),
      );
    }
    return rows;
  }

  it("finds the weekly shop the bill detector throws away", () => {
    const found = spendCandidates(walmartWeeks(26, [3, 9, 14, 20, 24]), {
      todayKey: "2026-08-21",
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      merchant: "Walmart",
      shape: "spend",
      spendPeriod: "week",
      cadence: null,
    });
    expect(found[0].coverage).toBeGreaterThan(0.75);
    // The amounts that disqualify it as a bill are exactly what it reports as its range.
    expect(found[0].highCents - found[0].lowCents).toBeGreaterThan(20_000);
  });

  it("is what `recurringMerchants` cannot do, on the same rows", () => {
    // Both detectors, same input: the variance gate is the whole difference, and it is why
    // the largest recurring outflow in the file never reached the review list.
    const rows = walmartWeeks(26, [3, 9, 14, 20, 24]);
    expect(recurringMerchants(rows, [])).toEqual([]);
    expect(spendCandidates(rows, { todayKey: "2026-08-21" })).toHaveLength(1);
  });

  it("does not call an occasional visit a routine", () => {
    // Charges in 5 of 26 weeks. A place that gets visited, not a weekly shop.
    expect(
      spendCandidates(
        walmartWeeks(
          26,
          [...Array(26).keys()].filter((w) => w % 5 !== 0),
        ),
        {
          todayKey: "2026-08-21",
        },
      ),
    ).toEqual([]);
  });

  it("needs more than a couple of months before regularity means anything", () => {
    expect(spendCandidates(walmartWeeks(6), { todayKey: "2026-04-04" })).toEqual([]);
  });

  it("leaves a claimed merchant alone", () => {
    expect(
      spendCandidates(walmartWeeks(26, [3, 9, 14, 20, 24]), {
        todayKey: "2026-08-21",
        suppressMerchants: ["Walmart"],
      }),
    ).toEqual([]);
  });
});

describe("cadenceCandidates", () => {
  it("proposes semi-annual from the two charges detection cannot use", () => {
    const premiums = [
      row({
        description: "GEICO *AUTO",
        transactionDate: "2025-09-04",
        amountCents: -138900,
      }),
      row({
        description: "GEICO *AUTO",
        transactionDate: "2026-03-03",
        amountCents: -141260,
      }),
    ];

    expect(cadenceCandidates(premiums)).toEqual([
      {
        merchant: "Geico",
        cadence: { unit: "month", n: 6 },
        typicalCents: 140080,
        chargeCount: 2,
        lastChargeOn: "2026-03-03",
      },
    ]);
  });

  it("proposes nothing for two visits at wildly different amounts", () => {
    // A grocery run six months apart is a coincidence, and offering "yearly?" for it is how
    // a pre-filled dropdown becomes a source of wrong numbers.
    expect(
      cadenceCandidates([
        row({ transactionDate: "2025-09-04", amountCents: -4200 }),
        row({ transactionDate: "2026-03-03", amountCents: -31000 }),
      ]),
    ).toEqual([]);
  });

  it("proposes nothing when the gap belongs to no cadence", () => {
    expect(
      cadenceCandidates([
        row({
          description: "GEICO *AUTO",
          transactionDate: "2025-07-04",
          amountCents: -141260,
        }),
        row({
          description: "GEICO *AUTO",
          transactionDate: "2026-03-03",
          amountCents: -141260,
        }),
      ]),
    ).toEqual([]);
  });

  it("needs more than one charge", () => {
    expect(
      cadenceCandidates([row({ description: "GEICO *AUTO", amountCents: -141260 })]),
    ).toEqual([]);
  });
});

describe("upcomingBills", () => {
  const charge = row({
    description: "GEICO *AUTO",
    transactionDate: "2026-03-03",
    amountCents: -141260,
  });

  it("forecasts the next one from the last that landed", () => {
    expect(upcomingBills([charge], [geicoBill], "2026-08-14")).toEqual([
      {
        merchant: "Geico",
        cadence: { unit: "month", n: 6 },
        dueOn: "2026-09-03",
        daysAway: 20,
        expectedCents: 141260,
        lastChargeOn: "2026-03-03",
      },
    ]);
  });

  it("walks past an anchor several cycles stale rather than reporting a past date", () => {
    const old = row({
      description: "GEICO *AUTO",
      transactionDate: "2024-03-03",
      amountCents: -141260,
    });
    expect(upcomingBills([old], [geicoBill], "2026-08-14")[0].dueOn).toBe("2026-09-03");
  });

  it("uses the declared anchor when no charge is on file", () => {
    expect(
      upcomingBills([], [{ ...geicoBill, anchorDate: "2026-03-03" }], "2026-08-14")[0],
    ).toMatchObject({ dueOn: "2026-09-03", lastChargeOn: "2026-03-03" });
  });

  it("forecasts nothing it has no anchor for", () => {
    expect(upcomingBills([], [geicoBill], "2026-08-14")).toEqual([]);
  });
});

describe("unscheduled bills", () => {
  /** Propane: the yearly cost is knowable, the delivery date is a tank sensor. */
  const propane = {
    name: "Taylor Gas",
    payeeIds: ["TAYLOR GAS COMPANY INC.", "TAYLOR GAS HEATING AIR"],
    cadenceMonths: 12,
    expectedCents: 50_000,
    anchorDate: null,
    scheduled: false,
  };
  /** Two deliveries in one cold winter — the case that double-counts if levelled. */
  const deliveries = [
    row({
      description: "TAYLOR GAS COMPANY INC.",
      transactionDate: "2026-01-23",
      amountCents: -15_000,
    }),
    row({
      description: "TAYLOR GAS HEATING AIR",
      transactionDate: "2026-04-01",
      amountCents: -37_932,
    }),
  ];

  it("is priced by its declared year, not by how many deliveries landed", () => {
    const found = recurringMerchants(deliveries, [propane]);
    expect(found[0]).toMatchObject({
      merchant: "Taylor Gas",
      annualCents: 50_000,
      cadence: { unit: "month", n: 12 },
      declared: true,
      scheduled: false,
    });
  });

  it("gets no forecast row, while a scheduled bill still does", () => {
    expect(upcomingBills(deliveries, [propane], "2026-08-14")).toEqual([]);

    const geico = row({
      description: "GEICO *AUTO",
      transactionDate: "2026-06-26",
      amountCents: -59_498,
    });
    expect(
      upcomingBills([geico], [geicoBill], "2026-08-14").map((bill) => bill.merchant),
    ).toEqual(["Geico"]);
  });

  it("counts as a bill rather than as variable spend", () => {
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-04-30" });
    const [january] = cashFlow(deliveries, buckets, { bills: [propane] });

    expect(january.fixedCents).toBe(15_000);
    expect(january.variableCents).toBe(0);
  });

  it("is not spread across the year, because two deliveries would double-count it", () => {
    // Each delivery levelled over its declared 12 months would put ~$44k of the $52,932
    // into a four-month window twice over. It lands where it happened instead.
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-04-30" });
    const levelled = cashFlow(deliveries, buckets, {
      levelRecurring: true,
      bills: [propane],
    });

    expect(levelled.map((point) => point.fixedCents)).toEqual([15_000, 0, 0, 37_932]);
    expect(levelled.reduce((total, point) => total + point.spendCents, 0)).toBe(52_932);
  });

  it("still accrues its declared year into the levelled baseline", () => {
    // The point of declaring it: the baseline reads the stated yearly cost, so a window with
    // two deliveries and a window with none both charge the same rate.
    const quarter = monthBuckets({ startKey: "2026-01-01", endKey: "2026-03-31" });
    const withCharges = baselineSplit(deliveries, 3, {
      levelRecurring: true,
      bills: recurringMerchants(deliveries, [propane]),
      buckets: quarter,
    });
    const without = baselineSplit([], 3, {
      levelRecurring: true,
      bills: recurringMerchants([], [propane]),
      buckets: quarter,
    });

    expect(withCharges.billsCents).toBe(12_329);
    expect(without.billsCents).toBe(12_329);
  });

  it("leaves a scheduled bill levelled exactly as before", () => {
    const year = monthBuckets({ startKey: "2026-01-01", endKey: "2026-12-31" });
    const premium = row({
      description: "GEICO *AUTO",
      transactionDate: "2026-03-03",
      amountCents: -141_260,
    });
    const levelled = cashFlow([premium], year, {
      levelRecurring: true,
      bills: [geicoBill],
    });

    // Spread from March, not landed whole in it. Seven months carry a share, not six: the
    // 184-day span from Mar 3 runs to Sep 2 and so clips the first two days of September.
    expect(levelled[2].fixedCents).toBeLessThan(141_260);
    expect(levelled.filter((point) => point.fixedCents > 0)).toHaveLength(7);
    expect(levelled.reduce((total, point) => total + point.fixedCents, 0)).toBe(
      141_260,
    );
  });
});

describe("baselineSplit levelling", () => {
  /** A quarter, and one semi-annual premium that happens to land inside it. */
  const quarter = monthBuckets({ startKey: "2026-01-01", endKey: "2026-03-31" });
  // Amounts that swing, so these stay a habit and never trip the variance detector — the
  // levelled figure below has to be the premium's alone.
  const groceries = [
    4200, 18800, 9100, 2200, 31000, 7600, 15400, 5000, 22000, 8800, 12100, 3800,
  ].map((cents, index) =>
    row({
      transactionDate: `2026-0${Math.floor(index / 4) + 1}-${String((index % 4) * 7 + 1).padStart(2, "0")}`,
      amountCents: -cents,
    }),
  );
  const groceriesCents = 140000;
  const premium = row({
    description: "GEICO *AUTO",
    transactionDate: "2026-03-03",
    amountCents: -141260,
  });

  it("counts the charge as posted when levelling is off", () => {
    const split = baselineSplit([...groceries, premium], 3);
    expect(split.baselineCents).toBe(groceriesCents + 141260);
    expect(split.levelled).toBe(false);
    expect(split.billsCents).toBe(0);
  });

  it("accrues a quarter of the year's premium instead of the whole charge", () => {
    const bills = recurringMerchants([...groceries, premium], [geicoBill]);
    const split = baselineSplit([...groceries, premium], 3, {
      levelRecurring: true,
      bills,
      buckets: quarter,
    });

    // 90 days of a $2,825.20 year, not the $1,412.60 that happened to post in March.
    expect(split.billsCents).toBe(69662);
    expect(split.baselineCents).toBe(groceriesCents + 69662);
    expect(split.levelled).toBe(true);
    expect(split.baselinePerBucketCents).toBe(Math.round((groceriesCents + 69662) / 3));
  });

  it("charges a window that contains no charge at all, because the bill still exists", () => {
    const bills = recurringMerchants(groceries, [geicoBill]);
    const split = baselineSplit(groceries, 3, {
      levelRecurring: true,
      bills,
      buckets: quarter,
    });
    expect(split.billsCents).toBe(69662);
  });

  it("agrees with the as-posted figure over a window holding a whole cadence", () => {
    const year = monthBuckets({ startKey: "2026-01-01", endKey: "2026-12-31" });
    const twoPremiums = [
      premium,
      row({
        description: "GEICO *AUTO",
        transactionDate: "2026-09-03",
        amountCents: -141260,
      }),
    ];
    const bills = recurringMerchants(twoPremiums, [geicoBill]);

    const posted = baselineSplit(twoPremiums, 12);
    const levelled = baselineSplit(twoPremiums, 12, {
      levelRecurring: true,
      bills,
      buckets: year,
    });

    // The year holds exactly two of a semi-annual bill, so accrual and actuals are the same
    // money. Only a partial window separates them.
    expect(levelled.baselineCents).toBe(posted.baselineCents);
  });

  it("still counts a refund at a levelled merchant, which has no span to spread over", () => {
    const refund = row({
      description: "GEICO *AUTO",
      transactionDate: "2026-03-20",
      amountCents: 20000,
      derivedFlow: "refund",
    });
    const bills = recurringMerchants([premium], [geicoBill]);
    const split = baselineSplit([premium, refund], 3, {
      levelRecurring: true,
      bills,
      buckets: quarter,
    });
    expect(split.baselineCents).toBe(69662 - 20000);
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
    expect(gap.holes).toEqual([]);
    expect(gap.mismatches).toEqual([]);
  });

  it("reports no gap when every account starts together", () => {
    const gap = coverageGap([
      row({ accountId: "a", transactionDate: "2026-01-01" }),
      row({ accountId: "b", transactionDate: "2026-01-01" }),
    ]);
    expect(gap.completeFrom).toBeNull();
    expect(gap.lateAccounts).toEqual([]);
    expect(gap.holes).toEqual([]);
  });

  it("names a mid-history statement hole even when the card already has earlier rows", () => {
    const gap = coverageGap(
      [
        row({
          accountId: "card",
          accountName: "Capital One •••3448",
          transactionDate: "2024-03-01",
          amountCents: -2000,
        }),
        row({
          accountId: "checking",
          accountName: "360 Checking",
          transactionDate: "2025-02-01",
          amountCents: -190000,
          derivedFlow: "internal_transfer",
        }),
      ],
      [
        {
          id: "s1",
          accountId: "card",
          accountName: "Capital One •••3448",
          periodStart: "2024-06-22",
          periodEnd: "2024-07-21",
          openingBalanceCents: 0,
          closingBalanceCents: -180000,
        },
        {
          id: "s2",
          accountId: "card",
          accountName: "Capital One •••3448",
          periodStart: "2025-12-22",
          periodEnd: "2026-01-21",
          openingBalanceCents: -40000,
          closingBalanceCents: -20114,
        },
      ],
    );

    expect(gap.holes).toEqual([
      expect.objectContaining({
        accountId: "card",
        afterPeriodEnd: "2024-07-21",
        beforePeriodStart: "2025-12-22",
      }),
    ]);
    // The unpaired payment sits inside the hole, so it is unitemized even
    // though the card's first row is earlier than checking.
    expect(gap.unitemizedCents).toBe(190000);
    expect(gap.mismatches[0]?.accountId).toBe("card");
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

describe("spendByMerchant", () => {
  it("ranks merchants the same way categories are ranked, refunds netting off", () => {
    const totals = spendByMerchant([
      row({ description: "SBARRO", amountCents: -2000 }),
      row({ description: "SBARRO", amountCents: 500, derivedFlow: "refund" }),
      row({ description: "SIMPLISAFE 8888957880", amountCents: -3471 }),
    ]);
    expect(totals[0]?.merchant).toBe("SimpliSafe");
    expect(totals.find((entry) => entry.merchant === "SBARRO")?.cents).toBe(1500);
  });
});

describe("spendByCategoryPerBucket", () => {
  it("keeps the top categories stable across buckets and folds the rest into Other", () => {
    const buckets = monthBuckets({ startKey: "2026-01-01", endKey: "2026-02-28" });
    const rows = [
      row({
        transactionDate: "2026-01-05",
        derivedCategory: "Groceries",
        amountCents: -10000,
      }),
      row({
        transactionDate: "2026-01-06",
        derivedCategory: "Dining",
        amountCents: -2000,
      }),
      row({
        transactionDate: "2026-02-05",
        derivedCategory: "Groceries",
        amountCents: -10000,
      }),
      row({
        transactionDate: "2026-02-06",
        derivedCategory: "Pets",
        amountCents: -1000,
      }),
    ];
    const { keys, points } = spendByCategoryPerBucket(rows, buckets, 1);
    expect(keys).toEqual(["Groceries", TREND_OTHER]);
    expect(points[0]?.byCategory.Groceries).toBe(10000);
    expect(points[0]?.byCategory[TREND_OTHER]).toBe(2000);
    expect(points[1]?.byCategory[TREND_OTHER]).toBe(1000);
  });
});

describe("assetDebtSeries", () => {
  it("splits checking from card debt and reports debt as a positive magnitude", () => {
    const buckets = monthBuckets({ startKey: "2026-02-01", endKey: "2026-03-31" });
    const points = assetDebtSeries(
      [
        row({
          accountId: "checking",
          accountKind: "checking",
          transactionDate: "2026-01-15",
          amountCents: 500000,
        }),
        row({
          accountId: "card",
          accountName: "Chase",
          accountKind: "credit_card",
          transactionDate: "2026-02-10",
          amountCents: -100000,
        }),
        row({
          accountId: "checking",
          accountKind: "checking",
          transactionDate: "2026-03-10",
          amountCents: -50000,
        }),
      ],
      buckets,
    );
    expect(points[0]).toMatchObject({
      assetCents: 500000,
      debtCents: 100000,
      netCents: 400000,
    });
    expect(points[1]).toMatchObject({
      assetCents: 450000,
      debtCents: 100000,
      netCents: 350000,
    });
  });

  it("lists per-account change across the window", () => {
    const contrib = accountContributions(
      [
        row({
          accountId: "checking",
          transactionDate: "2026-01-01",
          amountCents: 100000,
        }),
        row({
          accountId: "checking",
          transactionDate: "2026-03-01",
          amountCents: -20000,
        }),
      ],
      { startKey: "2026-02-01", endKey: "2026-03-31" },
    );
    expect(contrib).toEqual([
      {
        accountId: "checking",
        accountName: "360 Checking",
        kind: "checking",
        startCents: 100000,
        endCents: 80000,
        changeCents: -20000,
      },
    ]);
  });

  it("returns a null ratio when there are no assets to divide by", () => {
    expect(debtToAssetRatio(0, 100)).toBeNull();
    expect(debtToAssetRatio(200, 50)).toBe(0.25);
  });

  it("does not report a card credit as negative debt", () => {
    const buckets = monthBuckets({ startKey: "2026-02-01", endKey: "2026-02-28" });
    const points = assetDebtSeries(
      [
        row({
          accountId: "card",
          accountName: "Chase",
          accountKind: "credit_card",
          transactionDate: "2026-02-10",
          amountCents: 50000,
        }),
      ],
      buckets,
    );
    expect(points[0]?.debtCents).toBe(0);
    expect(points[0]?.assetCents).toBe(50000);
  });
});
