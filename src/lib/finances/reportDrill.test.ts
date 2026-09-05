import { expect, it } from "vitest";
import {
  reportContributionIds,
  parseReportDrill,
  reportRegisterHref,
  type ReportDrill,
} from "./reportDrill";
import type { TransactionListRow } from "./types";
function tx(
  over: Partial<TransactionListRow> &
    Pick<TransactionListRow, "id" | "transactionDate">,
): TransactionListRow {
  return {
    accountId: "checking",
    accountName: "Checking",
    accountKind: "checking",
    postedDate: over.transactionDate,
    pending: false,
    description: over.description ?? over.id,
    amountCents: -1000,
    sourceCategory: "",
    externalSource: null,
    derivedCategory: null,
    derivedFlow: "spend",
    flowOverride: null,

    notes: "",
    balanceAfterCents: null,
    budgetCategoryId: "groceries",
    budgetCategoryName: "Groceries",
    payeeId: null,
    parentId: null,
    splitChildCount: 0,
    splitImbalanceCents: 0,
    payeeName: null,
    ...over,
  };
}

const drill: ReportDrill = {
  basis: "envelope",
  from: "2026-08-01",
  to: "2026-08-31",
  categoryIds: ["groceries"],
  accountIds: [],
  payeeIds: [],
  uncategorized: false,
  direction: "all",
  allCategories: false,
};
it("excludes split parents, superseded pending, off-budget accounts and both internal transfer legs", () => {
  const rows = [
    tx({ id: "purchase", transactionDate: "2026-08-10" }),
    tx({
      id: "refund",
      transactionDate: "2026-08-10",
      amountCents: 200,
      derivedFlow: "refund",
    }),
    tx({ id: "parent", transactionDate: "2026-08-10", splitChildCount: 2 }),
    tx({ id: "old-pending", transactionDate: "2026-08-10", pending: true }),
    tx({ id: "off", transactionDate: "2026-08-10", accountId: "off-budget" }),
    tx({
      id: "out",
      transactionDate: "2026-08-10",
      transferGroupId: "pair",
      derivedFlow: "internal_transfer",
    }),
    tx({
      id: "in",
      transactionDate: "2026-08-10",
      accountId: "savings",
      transferGroupId: "pair",
      derivedFlow: "internal_transfer",
      amountCents: 1000,
    }),
  ];
  expect(
    reportContributionIds(
      rows,
      drill,
      new Set(["off-budget"]),
      new Set(["old-pending"]),
    ),
  ).toEqual(new Set(["purchase", "refund"]));
});
it("round trips unknown payees and an explicitly empty category set without broadening", () => {
  const value = { ...drill, categoryIds: [], payeeIds: ["unknown"] };
  expect(
    parseReportDrill(
      new URL(reportRegisterHref(value), "https://local").searchParams.get("report"),
    ),
  ).toEqual(value);
  expect(
    reportContributionIds(
      [tx({ id: "a", transactionDate: "2026-08-10" })],
      value,
      new Set(),
      new Set(),
    ).size,
  ).toBe(0);
});
it("rejects impossible or backwards report dates", () => {
  for (const patch of [
    { from: "2026-02-30" },
    { to: "2026-13-01" },
    { to: "2026-07-01" },
  ])
    expect(parseReportDrill({ ...drill, ...patch })).toBeNull();
});
