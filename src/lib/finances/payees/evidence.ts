/**
 * What an envelope has learned, as a list a person can read.
 *
 * The learning rules themselves live in `./autoCategory.ts` and are not restated here — this
 * module asks that module what it would do and turns the answer into a row. The whole point
 * of the section this feeds is that the guard's decision (learn now, or hold until nothing is
 * unfiled) is currently invisible: `shouldLearnFromCategoryEdit` already refuses to teach the
 * Apple payee from twelve of its 292 charges, and nothing in the app ever said so.
 *
 * Spec: `agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/` D3.
 */

import {
  shouldLearnFromCategoryEdit,
  type AutoCategoryMode,
  type CategoryChoice,
} from "./autoCategory";

/** One charge, already judged for Category eligibility by the caller. */
export type EvidenceCharge = {
  id: string;
  categoryId: string | null;
  /** False for off-budget rows and internal transfers — they can never be filed. */
  eligible: boolean;
};

export type EvidencePayee = {
  id: string;
  name: string;
  claimedBudgetCategoryId: string | null;
  defaultBudgetCategoryId: string | null;
  autoCategoryMode: AutoCategoryMode;
  charges: readonly EvidenceCharge[];
};

/**
 * Where a payee's charges go on their own, and whether that is in force.
 *
 * `held` is the state that needed a name: the payee has been filed here by hand, wants to
 * learn, and is waiting because charges are still unfiled. It is not an error.
 */
export type EvidenceStatus =
  | { kind: "claimed" }
  | { kind: "applied"; source: "learned" | "fixed" }
  | { kind: "held"; unfiledCount: number }
  | { kind: "off" }
  | { kind: "none" };

export type PayeeEvidenceRow = {
  payeeId: string;
  name: string;
  /** Charges of this payee sitting in this envelope. Filed is filed, eligible or not. */
  filedCount: number;
  /** Eligible charges of this payee with no Category at all, anywhere. */
  unfiledCount: number;
  status: EvidenceStatus;
  /** Set when the payee's own destination is some other envelope. */
  routedTo: { id: string; name: string } | null;
  /** A name the normalizer destroyed (`P` from `PP*P36C17FF0B`). */
  damagedName: boolean;
};

/** A name too short to be a merchant — the residue shape `resolve.ts` calls opaque. */
export function isDamagedPayeeName(name: string): boolean {
  return name.trim().length < 3;
}

/** One line of the "Files here" list. Exported for the tests and for the audit script. */
export function payeeEvidence(
  categoryId: string,
  payee: EvidencePayee,
  envelopeName: (id: string) => string | null,
): PayeeEvidenceRow {
  const eligible: CategoryChoice[] = payee.charges
    .filter((charge) => charge.eligible)
    .map((charge) => ({ id: charge.id, categoryId: charge.categoryId }));
  const unfiledCount = eligible.filter((choice) => choice.categoryId === null).length;
  const destinationId = payee.claimedBudgetCategoryId ?? payee.defaultBudgetCategoryId;

  return {
    payeeId: payee.id,
    name: payee.name,
    filedCount: payee.charges.filter((charge) => charge.categoryId === categoryId)
      .length,
    unfiledCount,
    status: evidenceStatus(payee, eligible, unfiledCount),
    routedTo:
      destinationId && destinationId !== categoryId
        ? { id: destinationId, name: envelopeName(destinationId) ?? "another envelope" }
        : null,
    damagedName: isDamagedPayeeName(payee.name),
  };
}

function evidenceStatus(
  payee: EvidencePayee,
  eligible: readonly CategoryChoice[],
  unfiledCount: number,
): EvidenceStatus {
  if (payee.claimedBudgetCategoryId) return { kind: "claimed" };
  if (payee.autoCategoryMode === "off") return { kind: "off" };
  if (payee.defaultBudgetCategoryId) {
    return {
      kind: "applied",
      source: payee.autoCategoryMode === "fixed" ? "fixed" : "learned",
    };
  }
  // No default yet. Ask the guard, rather than repeating the condition it applies.
  if (!shouldLearnFromCategoryEdit(payee, eligible) && unfiledCount > 0) {
    return { kind: "held", unfiledCount };
  }
  return { kind: "none" };
}

/** The whole list for one envelope, heaviest evidence first so it reads as a ranking. */
export function payeeEvidenceRows(
  categoryId: string,
  payees: readonly EvidencePayee[],
  envelopeName: (id: string) => string | null,
): PayeeEvidenceRow[] {
  return payees
    .map((payee) => payeeEvidence(categoryId, payee, envelopeName))
    .sort(
      (a, b) =>
        b.filedCount - a.filedCount ||
        b.unfiledCount - a.unfiledCount ||
        a.name.localeCompare(b.name),
    );
}

/** The sentence the row shows for its state. The held case quotes the guard's own reason. */
export function evidenceStatusCopy(row: PayeeEvidenceRow): string {
  switch (row.status.kind) {
    case "claimed":
      return "claimed";
    case "applied":
      return row.status.source === "fixed" ? "applied · fixed" : "applied";
    case "held":
      return `held: ${row.status.unfiledCount.toLocaleString()} ${
        row.status.unfiledCount === 1 ? "charge" : "charges"
      } still unfiled`;
    case "off":
      return "not auto-categorized";
    case "none":
      return "no default yet";
  }
}
