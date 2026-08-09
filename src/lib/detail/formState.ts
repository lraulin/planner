import type { NodeState } from "@/db/schema";
import { effectiveState, ownShelf } from "@/lib/tree/shelving";

/**
 * What the detail form's State field should show for a row.
 *
 * Matches the grid's State column (`ownEffectiveState`): a routine whose shelf has run out
 * still *stores* `postponed`, but every surface that answers "what is this task right now?"
 * shows Not started. Seeding the form from the stored value made completing a due-again
 * routine look like a no-op on mobile — the list said NS, the form said Postponed, Save
 * put Postponed back on the form, and the one field the user changed appeared to discard
 * their choice.
 *
 * `id` is not required: `ownShelf` only needs state + deferred date, and the form is always
 * editing this row's own field (inherited shelves stay out of the State select).
 */
export function formState(
  row: { id?: string; state: NodeState | null; deferredDate: Date | null },
  today: string | null,
): NodeState | null {
  return effectiveState(row.state, ownShelf({ id: row.id ?? "", ...row }), today);
}

/**
 * Whether a draft State is a real edit relative to the stored row.
 *
 * An expired shelf still stores `postponed` while readers show Not started. A form that
 * shows the effective value re-posts `not_started` on every save of notes or dates; that
 * restates the UI, it is not "re-open this task". Writing it would collapse the stored
 * shelf residue and fight the model that expiry is derived, never swept.
 */
export function isStateEdit(
  stored: { state: NodeState | null; deferredDate: Date | null },
  draft: NodeState,
  today: string | null,
): boolean {
  if (draft === stored.state) return false;
  // Draft still matches what the form showed — the stored value is shelf residue the user
  // never saw as a State they chose.
  if (draft === formState(stored, today)) return false;
  return true;
}
