/**
 * The target a bill envelope has when it holds none of its own.
 *
 * Before this spec a bill funded itself through `billFundingDemand`, a second demand engine
 * answering the same question as the template evaluator, because "a bill envelope never holds
 * a template". That is one of the three workarounds `shape.md` counts. Now a bill's cadence
 * **seeds a target** and the ordinary evaluator runs it, so there is exactly one path from
 * envelope to ask.
 *
 * Derived live rather than written at import: editing `expectedCents`, the due day or the
 * cadence keeps the ask in sync with no stored row to rewrite. An explicit target always wins.
 *
 * `upTo` rather than `add` because for a bill charged the same amount on the same day the two
 * are identical, and they differ only when a charge does not land — where holding the money for
 * next month's charge is what you want, not asking for the full amount again on top of it.
 *
 * Spec: `agent-os/specs/2026-08-28-1000-ynab-target-engine/` D5.
 */

import type { EnvelopeKind } from "@/db/schema";
import type { ScheduleBill } from "./cadence";
import { assertCents, type Target } from "./types";

export type BillSnapshot = ScheduleBill & {
  id: string;
  name: string;
  /** Unsigned cents. Zero means nothing to fund. */
  expectedCents: number;
};

export type TargetHolder = {
  id: string;
  kind: EnvelopeKind;
  target: Target | null;
};

export type ResolvedTarget = {
  target: Target | null;
  /** Set only when the target's cadence is `schedule`, which resolves against the bill. */
  bill: BillSnapshot | null;
  /** True when nothing is stored and the bill's cadence produced this. */
  derived: boolean;
  errors: string[];
};

/** The `schedule` target a bill's own cadence implies. Null when there is nothing to fund. */
export function deriveTarget(snapshot: BillSnapshot): Target | null {
  const amount = assertCents(snapshot.expectedCents, "bill amount");
  if (amount <= 0) return null;
  return { behavior: "upTo", cadence: { unit: "schedule" }, amountCents: amount };
}

/**
 * What this envelope actually asks against — its stored target, or a bill's derived one.
 *
 * A bill with no snapshot has no next-due date on file, and saying so is better than silently
 * asking nothing: the envelope is configured to fund a charge nobody can date yet.
 */
export function resolveTarget(
  envelope: TargetHolder,
  bills: ReadonlyMap<string, BillSnapshot>,
): ResolvedTarget {
  if (envelope.target) {
    return { target: envelope.target, bill: null, derived: false, errors: [] };
  }
  if (envelope.kind !== "bill") {
    return { target: null, bill: null, derived: false, errors: [] };
  }
  const snapshot = bills.get(envelope.id);
  if (!snapshot) {
    return {
      target: null,
      bill: null,
      derived: false,
      errors: ["Bill has no next-due date yet"],
    };
  }
  return { target: deriveTarget(snapshot), bill: snapshot, derived: true, errors: [] };
}

/** Whether this envelope asks for anything at all — a stored target, or a bill's cadence. */
export function hasTargetAsk(envelope: TargetHolder): boolean {
  return envelope.target !== null || envelope.kind === "bill";
}
