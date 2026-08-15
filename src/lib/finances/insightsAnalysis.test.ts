import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "./analytics";
import { analyzeInsights } from "./insightsAnalysis";
import type { DeclaredBill } from "./recurringBills";

function row(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    accountId: "checking",
    accountName: "360 Checking",
    accountKind: "checking",
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

const geicoBill: DeclaredBill = {
  merchant: "Geico",
  cadenceMonths: 12,
  expectedCents: 282500,
  anchorDate: "2025-01-15",
  scheduled: true,
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
      cadenceMonths: 12,
      typicalCents: 282500,
    });
    expect(analysis.windowed.some((entry) => entry.description === "GEICO *AUTO")).toBe(
      false,
    );
  });

  it("keeps baseline and one-off as two numbers", () => {
    const wedding = row({
      description: "VENUE DEPOSIT",
      transactionDate: "2026-02-10",
      amountCents: -600000,
      derivedCategory: "Entertainment",
      excludeFromBaseline: true,
      eventLabel: "Wedding",
    });
    const analysis = analyzeInsights(groceryHistory([wedding]), [], {
      window: "3m",
      today: "2026-03-31",
    });
    expect(analysis.empty).toBe(false);
    if (analysis.empty) return;

    expect(analysis.split.oneOffCents).toBe(600000);
    expect(analysis.split.baselineCents).toBe(30000);
    expect(analysis.split.events).toContainEqual(
      expect.objectContaining({ label: "Wedding", cents: 600000 }),
    );
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
