/**
 * One row's merchant name and any flow the merchant string itself settles.
 *
 * Category no longer lives here. Envelope claims and payee auto-category write
 * `budget_category_id`; the bank's `source_category` is provenance only.
 *
 * Flow that depends on *other* rows lives in `transfers.ts` and `income.ts`.
 */

import type { FinanceFlowKind } from "@/db/schema";
import { canonicalPayeeName } from "../payees/canonicalNames";
import { namedFlow } from "./namedFlows";
import { normalizeMerchant } from "./merchant";

export type RowClassification = {
  merchant: string;
  flow: FinanceFlowKind | null;
};

/**
 * Classify one string: canonical payee name when we have one, plus any named flow.
 *
 * `merchantSource` is usually the bank description; for a resolved processor row it is the
 * counterparty the statement named.
 */
export function categorize(merchantSource: string): RowClassification {
  const normalized = normalizeMerchant(merchantSource);
  return {
    merchant: canonicalPayeeName(normalized) ?? normalized,
    flow: namedFlow(normalized),
  };
}
