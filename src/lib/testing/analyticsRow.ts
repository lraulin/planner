import type { AnalyticsRow } from "@/lib/finances/analytics";

/** An $84.12 grocery spend on checking with no payee; `overrides` sets what a test is about. */
export function analyticsRow(overrides: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return {
    id: crypto.randomUUID(),
    accountId: "checking",
    accountName: "360 Checking",
    accountKind: "checking",
    transactionDate: "2026-03-14",
    description: "WM SUPERCENTER #1981",
    amountCents: -8412,
    sourceCategory: "",
    derivedCategory: "Groceries",
    derivedFlow: "spend",
    flowOverride: null,
    transferGroupId: null,
    payeeId: null,
    payeeName: null,
    ...overrides,
  };
}
