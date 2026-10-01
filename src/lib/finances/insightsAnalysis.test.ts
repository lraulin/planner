import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "./analytics";
import { analyzeInsights } from "./insightsAnalysis";
import type { StoredBill } from "./recurringBills";

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
    derivedCategory: "Groceries",
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,

    payeeId: description,
    payeeName: null,
    ...overrides,
  };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Fourteen months of grocery spend ending 2026-03, plus optional extras. */
function groceryHistory(extras: AnalyticsRow[] = []): AnalyticsRow[] {
  const rows: AnalyticsRow[] = [];
  for (let step = 0; step < 14; step++) {
    const monthIndex = 1 + step; // 2025-02 … 2026-03
    const year = monthIndex <= 11 ? 2025 : 2026;
    const month = monthIndex <= 11 ? monthIndex + 1 : monthIndex - 11;
    rows.push(
      row({
        transactionDate: `${monthKey(year, month)}-15`,
        amountCents: -10000,
        description: "WM SUPERCENTER",
      }),
    );
  }
  return [...rows, ...extras];
}

const geicoBill: StoredBill = {
  name: "Geico",
  payeeIds: ["GEICO *AUTO"],
  cadenceMonths: 12,
  expectedCents: 282500,
  anchorDate: "2025-01-15",
  scheduled: true,
  dueDay: null,
  leadDays: 0,
};

describe("analyzeInsights", () => {
  it("computes the trailing average from full history but reports the window", () => {
    const analysis = analyzeInsights(groceryHistory(), [], {
      window: "3m",
      today: "2026-03-31",
    });
    expect(analysis.empty).toBe(false);
    if (analysis.empty) return;

    expect(analysis.range).toEqual({ startKey: "2026-01-01", endKey: "2026-03-15" });
    expect(analysis.flow).toHaveLength(3);
    // Fourteen months of history, so every visible bucket has a full trailing-12.
    expect(analysis.flow.every((point) => point.trailingSpendCents !== null)).toBe(
      true,
    );
    expect(analysis.flow[0].trailingSpendCents).toBe(10000);
  });

  it("keeps a declared yearly bill when the window holds none of its charges", () => {
    const premium = row({
      description: "GEICO *AUTO",
      transactionDate: "2025-01-15",
      amountCents: -282500,
      derivedCategory: "Insurance",
    });
    const analysis = analyzeInsights(groceryHistory([premium]), [geicoBill], {
      window: "3m",
      today: "2026-03-31",
    });
    expect(analysis.empty).toBe(false);
    if (analysis.empty) return;

    const declared = analysis.recurring.find((entry) => entry.merchant === "Geico");
    expect(declared).toMatchObject({
      declared: true,
      cadence: { unit: "month", n: 12 },
      typicalCents: 282500,
    });
    expect(analysis.windowed.some((entry) => entry.description === "GEICO *AUTO")).toBe(
      false,
    );
  });

  describe("declared bills under a filter (Oct 2026 list_recurring_bills report)", () => {
    const rentBill: StoredBill = {
      name: "Rent",
      payeeIds: ["RENT"],
      cadenceMonths: 1,
      expectedCents: 210000,
      anchorDate: null,
      scheduled: true,
      dueDay: null,
      leadDays: 0,
    };
    /** Never charged: the stored anchor is the *next* charge, typed into the Bills page. */
    const mintBill: StoredBill = {
      ...rentBill,
      name: "Phone (Mint Mobile)",
      payeeIds: ["MINT MOBILE"],
      cadenceMonths: 3,
      expectedCents: 16594,
      anchorDate: "2026-04-21",
    };
    const propaneBill: StoredBill = {
      ...rentBill,
      name: "Propane (Taylor Gas)",
      payeeIds: ["TAYLOR GAS"],
      cadenceMonths: 12,
      expectedCents: 35758,
      scheduled: false,
    };
    // Rent posts on the 10th, a year of it; groceries run to the 15th of March.
    const rents = Array.from({ length: 12 }, (_, index) => {
      const month = index + 4; // 2025-04 … 2026-03
      const year = month <= 12 ? 2025 : 2026;
      return row({
        description: "RENT",
        transactionDate: `${monthKey(year, month <= 12 ? month : month - 12)}-10`,
        amountCents: -210000,
        derivedCategory: "Rent",
      });
    });
    const premium = row({
      description: "GEICO *AUTO",
      transactionDate: "2025-01-15",
      amountCents: -282500,
      derivedCategory: "Car Insurance (Geico)",
    });
    const rows = groceryHistory([...rents, premium]);
    const bills = [rentBill, { ...geicoBill, name: "Car Insurance (Geico)" }, mintBill];

    function analyze(categories: string[], extraBills: StoredBill[] = []) {
      const analysis = analyzeInsights(rows, [...bills, ...extraBills], {
        filter: { accountIds: [], categories, merchants: [] },
        window: "3m",
        today: "2026-03-31",
      });
      if (analysis.empty) throw new Error("fixture should not be empty");
      return analysis;
    }

    it("lists only the bills the category filter names, not every bill zeroed out", () => {
      const filtered = analyze(["Rent"]);
      expect(filtered.recurring.map((entry) => entry.merchant)).toEqual(["Rent"]);
      expect(filtered.upcoming.map((entry) => entry.merchant)).toEqual(["Rent"]);

      const all = analyze([]);
      expect(all.recurring.map((entry) => entry.merchant).sort()).toEqual([
        "Car Insurance (Geico)",
        "Phone (Mint Mobile)",
        "Rent",
      ]);
    });

    it("keeps a named bill with no charge on file yet, on a category-only filter", () => {
      const filtered = analyze(["Rent", "Propane (Taylor Gas)"], [propaneBill]);
      expect(filtered.recurring.map((entry) => entry.merchant).sort()).toEqual([
        "Propane (Taylor Gas)",
        "Rent",
      ]);

      const byAccount = analyzeInsights(rows, [...bills, propaneBill], {
        filter: { accountIds: ["checking"], categories: [], merchants: [] },
        window: "3m",
        today: "2026-03-31",
      });
      if (byAccount.empty) throw new Error("fixture should not be empty");
      // An account filter can only be met by a charge, and propane has none.
      expect(byAccount.recurring.map((entry) => entry.merchant)).not.toContain(
        "Propane (Taylor Gas)",
      );
    });

    it("ends the window on the last imported day, whatever the filter matches", () => {
      expect(analyze([]).range).toEqual({
        startKey: "2026-01-01",
        endKey: "2026-03-15",
      });
      expect(analyze(["Rent"]).range).toEqual({
        startKey: "2026-01-01",
        endKey: "2026-03-15",
      });
    });

    it("reports no last charge rather than the stored next-charge anchor", () => {
      const mint = analyze([]).recurring.find(
        (entry) => entry.merchant === "Phone (Mint Mobile)",
      );
      expect(mint).toMatchObject({ chargeCount: 0, lastChargeOn: null });
      const propane = analyze([], [propaneBill]).recurring.find(
        (entry) => entry.merchant === "Propane (Taylor Gas)",
      );
      expect(propane).toMatchObject({ lastChargeOn: null });
    });

    it("counts charges inside the window for declared bills, as for detected ones", () => {
      const all = analyze([]);
      const rent = all.recurring.find((entry) => entry.merchant === "Rent");
      // Jan, Feb and Mar of a year of rent — not all twelve.
      expect(rent).toMatchObject({ chargeCount: 3, lastChargeOn: "2026-03-10" });
      const geico = all.recurring.find(
        (entry) => entry.merchant === "Car Insurance (Geico)",
      );
      // Its one premium is outside the window, but it is still the last charge on file.
      expect(geico).toMatchObject({ chargeCount: 0, lastChargeOn: "2025-01-15" });
    });
  });

  it("builds more buckets on the pay-period axis than on months", () => {
    const paychecks: AnalyticsRow[] = [];
    let day = new Date(Date.UTC(2025, 1, 7));
    const end = new Date(Date.UTC(2026, 2, 31));
    while (day <= end) {
      const key = day.toISOString().slice(0, 10);
      paychecks.push(
        row({
          description: "ACME PAYROLL",
          transactionDate: key,
          amountCents: 200000,
          derivedFlow: "income",
          derivedCategory: "Paycheck",
          accountKind: "checking",
        }),
      );
      day = new Date(day.getTime() + 14 * 24 * 60 * 60 * 1000);
    }

    const rows = groceryHistory(paychecks);
    const months = analyzeInsights(rows, [], {
      window: "12m",
      axis: "month",
      today: "2026-03-31",
    });
    const periods = analyzeInsights(rows, [], {
      window: "12m",
      axis: "pay-period",
      today: "2026-03-31",
    });
    expect(months.empty).toBe(false);
    expect(periods.empty).toBe(false);
    if (months.empty || periods.empty) return;

    expect(months.buckets.length).toBeLessThan(periods.buckets.length);
    expect(months.income.paydayCount).toBeGreaterThan(0);
    expect(periods.income.paydayCount).toBe(months.income.paydayCount);
  });

  it("returns empty when filters match nothing", () => {
    const analysis = analyzeInsights(groceryHistory(), [], {
      filter: { accountIds: ["missing"], categories: [], merchants: [] },
    });
    expect(analysis).toMatchObject({ empty: true, filtered: [] });
  });

  it("leaves no residual when an external transfer explains the whole move", () => {
    const analysis = analyzeInsights(
      [
        // February exists only so March is not the first bucket, which has no prior
        // position to difference against.
        row({
          accountId: "checking",
          transactionDate: "2026-02-10",
          amountCents: 0,
          derivedFlow: "spend",
        }),
        // $2,000 arrives from outside the imported accounts and nothing else happens.
        // Official position moves by the full amount, so the identity closes exactly —
        // this is precisely the month that used to report a $2,000 "discrepancy".
        row({
          accountId: "checking",
          transactionDate: "2026-03-10",
          amountCents: 200000,
          derivedFlow: "external_transfer",
        }),
      ],
      [],
      {
        window: "all",
        statements: [
          {
            accountId: "checking",
            periodEnd: "2026-02-28",
            closingBalanceCents: 50000,
          },
          {
            accountId: "checking",
            periodEnd: "2026-03-31",
            closingBalanceCents: 250000,
          },
        ],
      },
    );
    expect(analysis.empty).toBe(false);
    if (analysis.empty) return;
    const march = analysis.flow.find((point) => point.bucket.key === "2026-03");
    expect(march).toMatchObject({
      netCents: 0,
      externalTransferCents: 200000,
      statementNetCents: 200000,
      residualCents: 0,
    });
  });

  it("reconciles identically whether or not recurring bills are levelled", () => {
    // Levelling spreads a bill across the periods it covers, which moves cost over bucket
    // edges and changes the window's visible total. The official position it is compared
    // against cannot move, so a reconciliation computed from levelled bars reports a
    // residual that is an artifact of the smoothing. On real data that was $2,170.
    // A yearly premium charged in the last visible month: levelling spreads it over the
    // twelve months it covers, so eleven twelfths of it leaves the window entirely.
    const rows = groceryHistory([
      row({
        description: "GEICO *AUTO",
        transactionDate: "2026-03-15",
        amountCents: -282500,
        derivedCategory: "Insurance",
      }),
    ]);
    const options = {
      window: "3m",
      today: "2026-03-31",
      statements: [
        { accountId: "checking", periodEnd: "2025-12-31", closingBalanceCents: 0 },
        {
          accountId: "checking",
          periodEnd: "2026-03-31",
          closingBalanceCents: -312500,
        },
      ],
    } as const;

    const plain = analyzeInsights(rows, [geicoBill], {
      ...options,
      levelRecurring: false,
    });
    const levelled = analyzeInsights(rows, [geicoBill], {
      ...options,
      levelRecurring: true,
    });
    expect(plain.empty).toBe(false);
    expect(levelled.empty).toBe(false);
    if (plain.empty || levelled.empty) return;

    // The fixture has to actually bite, or this test proves nothing.
    const visibleNet = (analysis: typeof plain) =>
      analysis.empty
        ? 0
        : analysis.flow.reduce((total, point) => total + point.netCents, 0);
    expect(visibleNet(levelled)).not.toBe(visibleNet(plain));

    // …and the reconciliation is unmoved by it.
    expect(levelled.reconciliation).toEqual(plain.reconciliation);
    expect(plain.reconciliation).toMatchObject({
      netCents: -312500,
      statementCents: -312500,
      residualCents: 0,
    });
  });

  it("flags a statement hole as a residual against transaction net", () => {
    const analysis = analyzeInsights(
      [
        row({
          accountId: "card",
          accountName: "Card",
          accountKind: "credit_card",
          transactionDate: "2025-05-10",
          amountCents: -1000,
          derivedFlow: "spend",
        }),
        row({
          accountId: "checking",
          transactionDate: "2025-06-15",
          amountCents: 0,
          derivedFlow: "spend",
        }),
      ],
      [],
      {
        window: "all",
        statements: [
          {
            accountId: "card",
            periodEnd: "2025-05-21",
            closingBalanceCents: -33994,
          },
          {
            accountId: "card",
            periodEnd: "2025-06-21",
            closingBalanceCents: -11103,
          },
        ],
      },
    );
    expect(analysis.empty).toBe(false);
    if (analysis.empty) return;
    const june = analysis.flow.find((point) => point.bucket.key === "2025-06");
    expect(june?.statementNetCents).toBe(-11103 - -33994);
    expect(june?.netCents).toBe(0);
    // No external transfers here, so the residual is the whole unexplained gap.
    expect(june?.externalTransferCents).toBe(0);
    expect(june?.residualCents).toBe(0 - (-11103 - -33994));
  });
});
