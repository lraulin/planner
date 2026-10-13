import type { FinanceFlowKind } from "@/db/schema";
import { spendCentsOf } from "./analytics";
import type { BillCharge } from "./available";
import type { CommitmentCharge } from "./commitments";

/**
 * A row filed to a bill envelope, with only what the bill readers look at.
 *
 * Five fields because that is all {@link billChargesOf} reads: which envelope, when, and the
 * three that decide whether it is a cost (`spendCentsOf`). A read that returns exactly this
 * does not have to carry a ledger row's other twenty columns, which is what made the forecast
 * cost a whole-ledger read for a few hundred rows' worth of answer.
 */
export type BillChargeRow = {
  budgetCategoryId: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  amountCents: number;
  derivedFlow: FinanceFlowKind | null;
  flowOverride: FinanceFlowKind | null;
};

/**
 * A bill's charges are what is filed to its envelope: a payee claim is how they get there,
 * and routing by envelope keeps the forecast, the Bills page and the register on one answer
 * (`agent-os/specs/2026-09-06-1427-bill-anchor-retires/` D4).
 *
 * `flat` is every posted charge with its bill's id and name; `byBill` is the same charges
 * grouped by bill id. A refund (negative cost) is not a charge, so it is skipped; row order
 * in is order out, which is why the read hands the rows over oldest first.
 */
export function billChargesOf(
  rows: readonly BillChargeRow[],
  bills: readonly { id: string; name: string }[],
): { flat: BillCharge[]; byBill: Map<string, CommitmentCharge[]> } {
  const named = new Map(bills.map((bill) => [bill.id, bill]));
  const flat: BillCharge[] = [];
  const byBill = new Map<string, CommitmentCharge[]>();
  for (const row of rows) {
    const bill = named.get(row.budgetCategoryId);
    const costCents = spendCentsOf(row);
    if (bill === undefined || costCents <= 0) continue;
    const charge = { dateKey: row.transactionDate, costCents };
    flat.push({ billId: bill.id, name: bill.name, ...charge });
    const list = byBill.get(bill.id) ?? [];
    list.push(charge);
    byBill.set(bill.id, list);
  }
  return { flat, byBill };
}
