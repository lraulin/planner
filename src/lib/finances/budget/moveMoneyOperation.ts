import type { MonthKey } from "./envelope";
import { isReadyToAssignDestination } from "./groupEnvelopeOptions";
import type { BudgetOperation } from "./moveMoney";
import type { EnvelopeRef } from "./operations";

/**
 * What "Move money to…" writes for the destination picked.
 *
 * Ready to Assign is not an envelope, so money sent there is an **unassign** from the source;
 * anywhere else it is a **transfer** between two envelopes. `null` when the destination is
 * neither — not one of the targets the dialog was offered — so nothing is written.
 */
export function moveMoneyOperation(
  month: MonthKey,
  from: EnvelopeRef,
  targets: readonly EnvelopeRef[],
  toId: string,
  amountCents: number,
): BudgetOperation | null {
  const source = { id: from.id, name: from.name };
  if (isReadyToAssignDestination(toId)) {
    return { kind: "unassign", month, from: source, amountCents };
  }
  const target = targets.find((row) => row.id === toId);
  if (!target) return null;
  return {
    kind: "transfer",
    month,
    from: source,
    to: { id: target.id, name: target.name },
    amountCents,
  };
}
