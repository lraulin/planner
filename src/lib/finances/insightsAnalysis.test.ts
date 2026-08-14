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
});
