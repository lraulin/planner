import type { TransactionListRow } from "@/lib/finances/types";

/** A plain posted $10 spend on checking, uncategorised; `over` sets what a test is about. */
export function transactionRow(
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
    budgetCategoryId: null,
    budgetCategoryName: null,
    payeeId: null,
    parentId: null,
    splitChildCount: 0,
    splitImbalanceCents: 0,
    payeeName: null,
    ...over,
  };
}
