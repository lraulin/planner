/**
 * One row's merchant, category and (where a rule settles it) flow.
 *
 * This is the per-row tier of classification — everything decidable from a single transaction
 * in isolation. Flow that depends on *other* rows lives in `transfers.ts` and `income.ts`,
 * because whether a −$481.20 withdrawal is spending or half of a transfer is not a fact about
 * that row.
 *
 * The order below is the whole design: **a declared commitment beats a rule, a rule beats the
 * bank's label, and the bank's label beats nothing at all.** The commitment tier is applied by
 * `reclassify.ts`, which is where a payee claim is in scope; this module owns the lower two.
 *
 * Rules beat the bank because they are specific enough to act on (`Dining`), where a bank
 * category is often too coarse to be worth having (`Merchandise`) and is absent entirely on the
 * 875 rows from the 360 feed. A commitment's category beats a rule because it is not a guess at
 * all: the user said what Vetsource is, once. Above all of this sits
 * `financeTransactions.category`, which this module never sees — that is a statement about one
 * charge, and it wins by being a different column.
 *
 * **The rules arrive as an argument.** They used to be a hardcoded array imported here, which
 * is the workaround `agent-os/specs/2026-08-23-1536-finance-rules/` removes: they are now rows
 * the user owns, compiled once per pass and handed in.
 */

import type { FinanceFlowKind } from "@/db/schema";
import type { CompiledRule } from "../rules/compile";
import type { RuleRowInput } from "../rules/conditions";
import { applyRules } from "../rules/match";
import { categoryFromBank } from "./categories";
import { normalizeMerchant } from "./merchant";

export type RowClassification = {
  /** Canonical merchant — a rule's name when one supplied it, else the normalized string. */
  merchant: string;
  /** Taxonomy category, or null when nothing claimed the row. */
  category: string | null;
  /** Set only where a rule decides it; null leaves the choice to the flow detectors. */
  flow: FinanceFlowKind | null;
  /** Which rule fired, for explaining a categorisation. Null when nothing matched. */
  ruleId: string | null;
};

/**
 * The parts of a row a rule can ask about beyond the text being classified.
 *
 * `description` is the **raw** bank line and stays the raw bank line even when the merchant
 * being classified came from somewhere else — a PayPal statement's counterparty, say. A
 * `description` condition is about what the bank wrote; substituting the counterparty there
 * would quietly make it about something else.
 */
export type ClassifyContext = Omit<RuleRowInput, "merchant">;

/**
 * A context for callers that have only a string.
 *
 * The neutral values cannot match an account, payee or date condition, which is the honest
 * answer: without a row there is nothing to compare. Amount is the one that could collide —
 * `amount is 0` would match — and that is why the real path always passes a real context.
 */
function neutralContext(description: string): ClassifyContext {
  return {
    description,
    payeeId: null,
    accountId: "",
    amountCents: 0,
    transactionDate: "",
  };
}

/**
 * Classify one string against the rules, falling back to the bank's own label.
 *
 * `merchantSource` is the text whose normalized merchant is being classified. Usually the bank
 * description; for a resolved processor row it is the counterparty the statement named, which
 * is why it is a separate parameter from `context.description`.
 */
export function categorize(
  merchantSource: string,
  sourceCategory: string,
  rules: readonly CompiledRule[] = [],
  context?: ClassifyContext,
): RowClassification {
  const normalized = normalizeMerchant(merchantSource);
  const outcome = applyRules(rules, {
    ...(context ?? neutralContext(merchantSource)),
    merchant: normalized,
  });

  return {
    merchant: outcome.payeeName ?? normalized,
    category: outcome.category ?? categoryFromBank(sourceCategory),
    flow: (outcome.flow as FinanceFlowKind | null) ?? null,
    ruleId: outcome.ruleId,
  };
}
