import { describe, expect, it } from "vitest";
import { searchTransactions } from "./transactionSearch";
import { analyticsRow } from "@/lib/testing/analyticsRow";

describe("searchTransactions", () => {
  it("matches a description case-insensitively and ignores the rest", () => {
    const gift = analyticsRow({
      description: "ZEELLE FAMILY GIFT",
      amountCents: 250000,
      derivedFlow: "income",
      derivedCategory: "Gifts",
    });
    const grocery = analyticsRow({
      description: "WM SUPERCENTER #1981",
      amountCents: -8412,
    });

    const found = searchTransactions([gift, grocery], { query: "family gift" });
    expect(found.rows).toEqual([gift]);
    expect(found.matchedIncomeCents).toBe(250000);
    expect(found.matchedSpendCents).toBe(0);
    expect(found.matchedNetCents).toBe(250000);
  });

  it("bounds on the absolute amount so a refund and a charge share a range", () => {
    const charge = analyticsRow({ amountCents: -50000, description: "VENUE" });
    const refund = analyticsRow({
      amountCents: 50000,
      description: "VENUE REFUND",
      derivedFlow: "refund",
    });
    const tiny = analyticsRow({ amountCents: -100, description: "COFFEE" });

    const found = searchTransactions([charge, refund, tiny], {
      minCents: 40000,
      maxCents: 60000,
    });
    expect(found.rows).toEqual([charge, refund]);
  });

  it("filters direction against effective flow, not the raw sign", () => {
    const paycheck = analyticsRow({
      description: "ACME PAYROLL",
      amountCents: 200000,
      derivedFlow: "income",
    });
    const refund = analyticsRow({
      description: "RETURN",
      amountCents: 4000,
      derivedFlow: "refund",
    });
    const grocery = analyticsRow({ amountCents: -8412 });

    expect(
      searchTransactions([paycheck, refund, grocery], { direction: "income" }).rows,
    ).toEqual([paycheck]);
    expect(
      searchTransactions([paycheck, refund, grocery], { direction: "spend" }).rows,
    ).toEqual([refund, grocery]);
  });

  it("totals the whole match set, not a later page of it", () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      analyticsRow({
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
      analyticsRow({ amountCents: -1000 }),
      analyticsRow({
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
    const rowWithOverride = analyticsRow({
      derivedCategory: "Groceries",
      sourceCategory: "Shopping",
    });
    expect(
      searchTransactions([rowWithOverride], { category: "Groceries" }).rows,
    ).toEqual([rowWithOverride]);
    expect(
      searchTransactions([rowWithOverride], { category: "Shopping" }).rows,
    ).toEqual([]);
  });
});
