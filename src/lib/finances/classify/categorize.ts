/**
 * One row's merchant, category and (where the merchant settles it) flow.
 *
 * This is the per-row tier of classification — everything decidable from a single
 * transaction in isolation. Flow that depends on *other* rows lives in `transfers.ts` and
 * `income.ts`, because whether a −$481.20 withdrawal is spending or half of a transfer is
 * not a fact about that row.
 *
 * The order below is the whole design: a description rule beats the bank's label, and the
 * bank's label beats nothing at all. Rules win because they are specific enough to act on
 * (`Dining`), where a bank category is often too coarse to be worth having (`Merchandise`)
 * and is absent entirely on the 875 rows from the 360 feed.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { categoryFromBank } from "./categories";
import { normalizeMerchant } from "./merchant";
import { matchRule } from "./rules";

export type RowClassification = {
  /** Canonical merchant — the rule's name when one matched, else the normalized string. */
  merchant: string;
  /** Taxonomy category, or null when nothing claimed the row. */
  category: string | null;
  /** Set only where the merchant itself decides it; null leaves the choice to flow rules. */
  flow: FinanceFlowKind | null;
  /** Which rule fired, for explaining a categorisation. Null when the bank's label was used
   * or nothing matched. */
  ruleId: string | null;
};

/** Classify a single transaction from its own fields. */
export function categorize(
  description: string,
  sourceCategory: string,
): RowClassification {
  const normalized = normalizeMerchant(description);
  const rule = matchRule(normalized);

  return {
    merchant: rule?.merchant ?? normalized,
    category: rule?.category ?? categoryFromBank(sourceCategory),
    flow: rule?.flow ?? null,
    ruleId: rule?.id ?? null,
  };
}
