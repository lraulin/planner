/**
 * The one deliberate way a bank disagreement moves Ready to Assign.
 *
 * D3 (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/`) makes a bank/ledger mismatch a
 * warning with a link, never an automatic RTA term — that is the whole point of the ledger
 * fold. But a mismatch that survives fixing the rows it names (a truly unrecoverable gap: a
 * bank fee never imported, a rounding difference, an account opened before any register
 * existed) has to be closeable *somehow*, or the warning just sits there forever. D5 answers
 * that the same way YNAB does: Lee confirms the number, and Reconcile writes one ordinary
 * transaction — dated today, on the register, in the audit — rather than silently editing a
 * stored fact. The gap becomes a dollar that moved, not a number that was overwritten.
 *
 * Pure by design: this module only turns an already-known difference into the row to insert.
 * Finding that difference is `loadBudgetMismatch`'s job (`budget/queries.ts`, D3's own
 * formula); writing the row and its audit trail is `reconcileAccount` (`budget/mutations.ts`).
 */

function cents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

export type ReconcileAdjustmentRow = {
  accountId: string;
  transactionDate: string;
  amountCents: number;
  description: string;
  /** Forced, not derived: a negative "income" is exactly what a downward correction is. */
  flowOverride: "income";
  /** Never a real bank feed — what lets a reader (and the backlog count) tell this apart. */
  externalSource: "reconcile";
};

/**
 * The adjustment Reconcile writes for one account, or null when there is nothing to close.
 *
 * `differenceCents` is D3's own mismatch figure, signed the same way: positive means the bank
 * has more than the ledger currently accounts for. The adjustment carries that exact amount —
 * inserting it as a money row dated today is what brings a fresh recompute of the mismatch
 * back to zero, since the row itself becomes part of "rows since start" the next time anyone
 * asks. `budgetCategoryId` is deliberately absent: there is no literal "Ready to Assign"
 * envelope in this model, and leaving it uncategorized is what makes the amount an RTA term
 * (D1) the same way any other uncategorized dollar is.
 */
export function reconcileAdjustment(
  accountId: string,
  differenceCents: number,
  todayKey: string,
): ReconcileAdjustmentRow | null {
  cents(differenceCents, "reconcile difference");
  if (differenceCents === 0) return null;
  return {
    accountId,
    transactionDate: todayKey,
    amountCents: differenceCents,
    description: "Reconcile adjustment",
    flowOverride: "income",
    externalSource: "reconcile",
  };
}
