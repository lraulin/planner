/**
 * Flows settled by the merchant string itself, extracted from the four seeded rules that
 * were never about a Category.
 *
 * Transfer detection still runs first and withholds those rows. These names keep a monthly
 * VA benefit out of the biweekly paycheck median, file card interest as a carrying cost,
 * and treat a checking withdrawal to PayPal as the purchase (Lee does not carry a PayPal
 * balance).
 *
 * Spec: `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D10.
 */

import type { FinanceFlowKind } from "@/db/schema";

type NamedFlow = {
  match: RegExp;
  flow: FinanceFlowKind;
};

const NAMED_FLOWS: readonly NamedFlow[] = [
  {
    match:
      /^(INTEREST CHARGE|ANNUAL MEMBERSHIP FEE|LATE FEE|FOREIGN TRANSACTION FEE|OVERDRAFT FEE)/,
    flow: "interest_fee",
  },
  { match: /^MONTHLY INTEREST PAID/, flow: "interest_fee" },
  { match: /^VACP TREAS/, flow: "income" },
  { match: /^PAYPAL TO LEE RAULIN/, flow: "spend" },
];

/** The flow this normalized merchant settles, or null to leave the detectors to decide. */
export function namedFlow(normalizedMerchant: string): FinanceFlowKind | null {
  return NAMED_FLOWS.find((rule) => rule.match.test(normalizedMerchant))?.flow ?? null;
}
