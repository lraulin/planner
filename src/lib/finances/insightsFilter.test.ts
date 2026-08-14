import { describe, expect, it } from "vitest";
import { effectiveMerchant, type AnalyticsRow } from "./analytics";
import {
  applyInsightsFilter,
  EMPTY_INSIGHTS_FILTER,
  parseInsightsDrill,
  resolveInsightsRange,
  rowsForDrill,
} from "./insightsFilter";

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

describe("applyInsightsFilter", () => {
  const rows = [
    row({ accountId: "checking", derivedCategory: "Groceries" }),
    row({
      accountId: "card",
      accountName: "Chase",
      accountKind: "credit_card",
      derivedCategory: "Dining",
      description: "SBARRO",
    }),
    row({
      accountId: "checking",
      derivedFlow: "internal_transfer",
      derivedCategory: null,
      amountCents: -129200,
      description: "Withdrawal from CAPITAL ONE MOBILE PMT",
    }),
  ];

  it("treats an empty filter as all rows", () => {
    expect(applyInsightsFilter(rows, EMPTY_INSIGHTS_FILTER)).toHaveLength(3);
  });

  it("restricts by account, category and merchant independently", () => {
    expect(
      applyInsightsFilter(rows, {
        ...EMPTY_INSIGHTS_FILTER,
        accountIds: ["card"],
      }),
    ).toHaveLength(1);
    expect(
      applyInsightsFilter(rows, {
        ...EMPTY_INSIGHTS_FILTER,
        categories: ["Dining"],
      })[0]?.derivedCategory,
    ).toBe("Dining");
    expect(
      applyInsightsFilter(rows, {
        ...EMPTY_INSIGHTS_FILTER,
        merchants: ["SBARRO"],
      }),
    ).toHaveLength(1);
  });

  it("does not reclassify a transfer when the other account is filtered out", () => {
    const filtered = applyInsightsFilter(rows, {
      ...EMPTY_INSIGHTS_FILTER,
      accountIds: ["checking"],
    });
    const transfer = filtered.find(
      (entry) => entry.derivedFlow === "internal_transfer",
    );
    expect(transfer).toBeDefined();
    expect(transfer?.amountCents).toBe(-129200);
  });
});

describe("resolveInsightsRange", () => {
  const full = { startKey: "2023-07-24", endKey: "2026-08-10" };

  it("keeps trailing windows ending on the last imported day", () => {
    expect(resolveInsightsRange("3m", "2026-08-13", full)).toEqual({
      startKey: "2026-06-01",
      endKey: "2026-08-10",
    });
    expect(resolveInsightsRange("12m", "2026-08-13", full)?.startKey).toBe(
      "2025-09-01",
    );
  });

  it("takes YTD and QTD from wall-clock today and clips to the last imported day", () => {
    expect(resolveInsightsRange("ytd", "2026-08-13", full)).toEqual({
      startKey: "2026-01-01",
      endKey: "2026-08-10",
    });
    expect(resolveInsightsRange("qtd", "2026-08-13", full)).toEqual({
      startKey: "2026-07-01",
      endKey: "2026-08-10",
    });
    expect(resolveInsightsRange("qtd", "2026-04-01", full)?.startKey).toBe(
      "2026-04-01",
    );
    expect(resolveInsightsRange("qtd", "2026-01-02", full)?.startKey).toBe(
      "2026-01-01",
    );
  });

  it("returns all-time unchanged", () => {
    expect(resolveInsightsRange("all", "2026-08-13", full)).toEqual(full);
  });

  it("returns null when there is no history", () => {
    expect(resolveInsightsRange("ytd", "2026-08-13", null)).toBeNull();
  });
});

describe("rowsForDrill", () => {
  const rows = [
    row({ derivedCategory: "Groceries", amountCents: -4000 }),
    row({
      derivedCategory: "Dining",
      description: "SBARRO",
      amountCents: -2000,
    }),
    row({
      derivedFlow: "internal_transfer",
      derivedCategory: "Groceries",
      amountCents: -50000,
    }),
    row({
      derivedFlow: "refund",
      derivedCategory: "Groceries",
      amountCents: 1500,
    }),
    row({
      derivedFlow: "income",
      description: "GA8248 TRUSTEDQA PAYROLL",
      amountCents: 247433,
      transactionDate: "2026-03-20",
    }),
  ];

  it("a category drill is the spend (and refunds) in that category, not transfers", () => {
    const drilled = rowsForDrill(rows, { kind: "category", id: "Groceries" });
    expect(drilled.map((entry) => entry.derivedFlow).sort()).toEqual([
      "refund",
      "spend",
    ]);
  });

  it("a merchant drill ignores transfers at that merchant string", () => {
    const drilled = rowsForDrill(rows, { kind: "merchant", id: "SBARRO" });
    expect(drilled).toHaveLength(1);
    expect(drilled[0]?.derivedCategory).toBe("Dining");
  });

  it("a bucket drill is every row in the inclusive window", () => {
    expect(
      rowsForDrill(rows, {
        kind: "bucket",
        startKey: "2026-03-14",
        endKey: "2026-03-14",
      }),
    ).toHaveLength(4);
  });

  it("a Sankey source drill is income from that merchant", () => {
    const paycheck = rows.find((entry) => entry.amountCents === 247433);
    expect(paycheck).toBeDefined();
    const drilled = rowsForDrill(rows, {
      kind: "sankey",
      id: effectiveMerchant(paycheck!),
      role: "source",
    });
    expect(drilled).toEqual([paycheck]);
  });
});

describe("parseInsightsDrill", () => {
  it("keeps a well-formed drill and drops garbage", () => {
    expect(parseInsightsDrill({ kind: "category", id: "Groceries" })).toEqual({
      kind: "category",
      id: "Groceries",
    });
    expect(parseInsightsDrill({ kind: "bucket", startKey: "2026-01-01" })).toBeNull();
    expect(parseInsightsDrill({ kind: "nope", id: "x" })).toBeNull();
    expect(parseInsightsDrill(null)).toBeNull();
  });
});
