import { describe, expect, it } from "vitest";
import type { AnalyticsRow } from "./analytics";
import { searchTransactions } from "./transactionSearch";

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
    plannedWithdrawal: false,
    ...overrides,
  };
}

describe("searchTransactions", () => {
  it("matches a description case-insensitively and ignores the rest", () => {
    const gift = row({
      description: "ZEELLE FAMILY GIFT",
      amountCents: 250000,
      derivedFlow: "income",
      derivedCategory: "Gifts",
    });
    const grocery = row({ description: "WM SUPERCENTER #1981", amountCents: -8412 });

    const found = searchTransactions([gift, grocery], { query: "family gift" });
    expect(found.rows).toEqual([gift]);
    expect(found.matchedIncomeCents).toBe(250000);
    expect(found.matchedSpendCents).toBe(0);
    expect(found.matchedNetCents).toBe(250000);
  });

  it("bounds on the absolute amount so a refund and a charge share a range", () => {
    const charge = row({ amountCents: -50000, description: "VENUE" });
    const refund = row({
      amountCents: 50000,
      description: "VENUE REFUND",
      derivedFlow: "refund",
    });
    const tiny = row({ amountCents: -100, description: "COFFEE" });

    const found = searchTransactions([charge, refund, tiny], {
      minCents: 40000,
      maxCents: 60000,
    });
    expect(found.rows).toEqual([charge, refund]);
  });

  it("filters direction against effective flow, not the raw sign", () => {
    const paycheck = row({
      description: "ACME PAYROLL",
      amountCents: 200000,
      derivedFlow: "income",
    });
    const refund = row({
      description: "RETURN",
      amountCents: 4000,
      derivedFlow: "refund",
    });
    const grocery = row({ amountCents: -8412 });

    expect(
      searchTransactions([paycheck, refund, grocery], { direction: "income" }).rows,
    ).toEqual([paycheck]);
    expect(
      searchTransactions([paycheck, refund, grocery], { direction: "spend" }).rows,
    ).toEqual([refund, grocery]);
  });

  it("totals the whole match set, not a later page of it", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      row({
        description: `GIFT ${index}`,
        amountCents: 10000,
        derivedFlow: "income",
        transactionDate: `2026-03-0${index + 1}`,
      }),
    );
    const found = searchTransactions(rows, { query: "gift" });
    expect(found.rows).toHaveLength(5);
    expect(found.matchedIncomeCents).toBe(50000);
    expect(found.matchedNetCents).toBe(50000);
    // Pagination is the caller's job; this function never slices.
    expect(found.rows.slice(0, 2)).toHaveLength(2);
    expect(found.matchedIncomeCents).toBe(50000);
  });

  it("treats an empty filter as everything", () => {
    const rows = [
      row({ amountCents: -1000 }),
      row({
        description: "PAYROLL",
        amountCents: 2000,
        derivedFlow: "income",
      }),
    ];
    const found = searchTransactions(rows, {});
    expect(found.rows).toEqual(rows);
    expect(found.matchedIncomeCents).toBe(2000);
    expect(found.matchedSpendCents).toBe(1000);
    expect(found.matchedNetCents).toBe(1000);
  });

  it("uses the effective category, not the bank's leftover label", () => {
    const rowWithOverride = row({
      category: "Baby",
      derivedCategory: "Groceries",
      sourceCategory: "Shopping",
    });
    expect(searchTransactions([rowWithOverride], { category: "Baby" }).rows).toEqual([
      rowWithOverride,
    ]);
    expect(
      searchTransactions([rowWithOverride], { category: "Groceries" }).rows,
    ).toEqual([]);
  });
});
