import type { FinanceAccountKind } from "@/db/schema";
import { FEED_LABELS, type FinanceFeed } from "./types";

/** Display names for `finance_accounts.kind`. Shared by the dashboard, grid, and drawer. */
export const ACCOUNT_KIND_LABELS: Record<FinanceAccountKind, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  investment: "Investment",
  loan: "Loan",
  other: "Other",
};

export const ACCOUNT_KIND_OPTIONS: readonly {
  value: FinanceAccountKind;
  label: string;
}[] = (Object.entries(ACCOUNT_KIND_LABELS) as [FinanceAccountKind, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function accountKindLabel(kind: string): string {
  return ACCOUNT_KIND_LABELS[kind as FinanceAccountKind] ?? kind;
}

export function accountSourceLabel(source: string): string {
  return source in FEED_LABELS ? FEED_LABELS[source as FinanceFeed] : source;
}
