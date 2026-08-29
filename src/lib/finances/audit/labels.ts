import type { FinanceAuditKind } from "./types";

const ACTION_LABELS: Record<FinanceAuditKind, string> = {
  bank_snapshot: "Bank snapshot",
  simplefin_sync: "SimpleFIN sync",
  finance_import: "File import",
  transaction_change: "Transaction changed",
  transaction_delete: "Transaction deleted",
  transaction_split: "Transaction split",
  transaction_classification: "Transactions classified",
  account_membership: "Budget membership",
  account_delete: "Account deleted",
  statement_change: "Statement changed",
  budget_assignment: "Budget assignment",
  budget_transfer: "Budget transfer",
  budget_carryover: "Carryover changed",
  budget_bulk_funding: "Bulk funding",
  budget_delete: "Budget deletion",
  legacy_budget_movement: "Legacy movement log",
};

export function financeAuditActionLabel(kind: FinanceAuditKind): string {
  return ACTION_LABELS[kind];
}
