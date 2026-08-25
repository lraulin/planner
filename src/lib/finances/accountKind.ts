import type { FinanceAccountKind } from "@/db/schema";
import { FEED_LABELS, type FinanceFeed } from "./types";

/**
 * Account kinds that always participate in the envelope budget.
 *
 * Checking, savings, cash and credit cards are one pool. Account location does not give
 * money a job; an envelope does. Spec: `agent-os/specs/2026-08-24-2206-single-pool-budget/`
 * D1.
 */
export const CORE_BUDGET_KINDS: ReadonlySet<FinanceAccountKind> = new Set([
  "checking",
  "savings",
  "cash",
  "credit_card",
]);

export function isCoreBudgetKind(kind: FinanceAccountKind): boolean {
  return CORE_BUDGET_KINDS.has(kind);
}

/**
 * Default `offBudget` for a newly created account.
 *
 * Core kinds are always on-budget. New investments and loans default off, as tracking
 * accounts, until the user includes them. Other keeps the historical on-budget default.
 */
export function defaultOffBudget(kind: FinanceAccountKind): boolean {
  return kind === "investment" || kind === "loan";
}

/**
 * The membership a write is allowed to store.
 *
 * Core kinds cannot leave the pool: a requested `true` is ignored in favour of `false`
 * rather than stored and then fought by a CHECK. Flexible kinds honour the request, or
 * the kind's default when the caller does not say.
 */
export function resolvedOffBudget(
  kind: FinanceAccountKind,
  requested?: boolean,
): boolean {
  if (isCoreBudgetKind(kind)) return false;
  return requested ?? defaultOffBudget(kind);
}

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
