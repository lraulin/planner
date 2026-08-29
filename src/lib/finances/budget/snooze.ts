/**
 * Whether an envelope's target can be snoozed for a month, and why not when it cannot.
 *
 * One implementation, read twice: the control disables itself with this reason
 * (`agent-os/standards/components/navigation.md` — unavailable means disabled *with a reason*),
 * and `setTargetSnooze` rejects with the same string rather than trusting the client
 * (`agent-os/standards/development/security.md`). A second copy of these rules is how a
 * disabled button and a permissive endpoint drift apart.
 *
 * Spec: `agent-os/specs/2026-08-28-2223-target-snooze/` D5, D6, D9.
 */

import { monthLabel, type MonthKey } from "./envelope";
import type { EnvelopeKind } from "@/db/schema";
import type { Target } from "./targets/types";

export type SnoozeCandidate = {
  kind: EnvelopeKind;
  target: Target | null;
};

/** Null when the target may be snoozed; otherwise the reason, ready to show as a `title`. */
export function snoozeUnavailableReason(
  envelope: SnoozeCandidate,
  month: MonthKey,
  currentMonth: MonthKey,
): string | null {
  if (month !== currentMonth) {
    return `Snooze applies to the current month. This is ${monthLabel(month)}.`;
  }
  // D6. A variable bill whose charge has posted already asks for nothing, a sinking bill's
  // yellow is wanted as a reminder, and a bill can already be paused, cancelled, or re-dated.
  if (envelope.kind === "bill") {
    return "Bills cannot be snoozed. Pause the bill or change its next charge date instead.";
  }
  // D9. No target means no ask (`hasUnderfundedAsk`), so there is nothing to silence.
  if (envelope.target === null) {
    return "This envelope has no target to snooze.";
  }
  if (envelope.kind === "income") {
    return "Income envelopes are not funded, so they have no target to snooze.";
  }
  return null;
}
