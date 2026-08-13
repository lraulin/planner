import type { FinanceFlowKind } from "@/db/schema";

/**
 * What each flow is called on screen, and the order it is offered in.
 *
 * One list, because three surfaces name these — the register column, its group headers, and
 * the drawer's override picker — and a flow called "Transfer (internal)" in one place and
 * "Internal transfer" in another reads as two different things.
 *
 * The words avoid the schema's underscores without inventing new concepts: `internal` is
 * money between accounts you hold, `external` is money to an account this module cannot see.
 */
export const FLOW_KINDS: readonly FinanceFlowKind[] = [
  "spend",
  "income",
  "internal_transfer",
  "external_transfer",
  "refund",
  "interest_fee",
];

export const FLOW_LABELS: Record<FinanceFlowKind, string> = {
  spend: "Spend",
  income: "Income",
  internal_transfer: "Transfer (own accounts)",
  external_transfer: "Transfer (outside)",
  refund: "Refund",
  interest_fee: "Interest & fees",
};

export function flowLabel(flow: FinanceFlowKind): string {
  return FLOW_LABELS[flow];
}
