import { FINANCE_CATEGORIES } from "../classify/categories";
import { normalizeMerchant } from "../classify/merchant";
import type { TransactionListRow } from "../types";
import type { RuleDraft } from "./editorDraft";

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createRuleRefusal(row: TransactionListRow | undefined): string | null {
  if (!row) return "Select a row first";
  if (!row.payeeId && normalizeMerchant(row.description) === "") {
    return "This row has no payee or merchant to match";
  }
  return null;
}

/** A conservative exact rule: stable payee identity first, exact merchant only as fallback. */
export function ruleDraftFromTransaction(row: TransactionListRow): RuleDraft {
  const merchant = normalizeMerchant(row.description);
  const effectiveCategory = row.category ?? row.derivedCategory;
  const category = FINANCE_CATEGORIES.includes(
    effectiveCategory as (typeof FINANCE_CATEGORIES)[number],
  )
    ? (effectiveCategory ?? "")
    : "";

  return {
    name: row.payeeName ? `${row.payeeName} transactions` : `${merchant} transactions`,
    conditions: [
      row.payeeId
        ? {
            field: "payee",
            op: "is",
            value: row.payeeId,
            upperValue: "",
            flags: "",
          }
        : {
            field: "merchant",
            op: "matches",
            value: `^${escapeRegex(merchant)}$`,
            upperValue: "",
            flags: "",
          },
    ],
    actions: [{ kind: "category", value: category }],
    enabled: true,
    notes: `Created from ${row.description} on ${row.transactionDate}.`,
  };
}
