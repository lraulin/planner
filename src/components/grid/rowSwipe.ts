"use client";

import { isSettled } from "@/lib/tree/completionCascade";
import type { GridCommandCapabilities } from "@/lib/grid/commandDeck";
import type { RowSwipe } from "./CompactRow";

/**
 * A row's swipe gestures, from the grid's own capabilities.
 *
 * The same move `rowMenuFor` makes, for the same reason. Eight views used to hand-write their
 * context menus and they drifted apart; a gesture wired by hand into six hosts would drift the
 * same way, and a swipe is worse to get wrong than a menu row — there is no label to read
 * before you commit. A host states what it can do to a row, once, and the menu, the toolbar,
 * the palette and now the gesture all come out of that one statement.
 *
 * **Built for the row under the finger, not for the selection.** Swiping is aimed at one row;
 * the plural verbs stay on long press, where the menu can say how many it is about to act on.
 * That is why this reads `selection.id` rather than `selection.ids`, which the hosts widen to
 * the whole selection when the row is part of one.
 *
 * A direction whose action the host does not offer is omitted, so a read-only view gets no
 * gesture rather than a rail that does nothing.
 */
export function rowSwipeFor(capabilities: GridCommandCapabilities): RowSwipe {
  const { actions, selection } = capabilities;
  const id = selection?.id ?? null;
  if (!id) return {};

  const swipe: RowSwipe = {};

  if (actions.onSetState) {
    /*
     * Right completes — and completes *back*, which the menu's `Complete` deliberately does
     * not: it greys itself on a settled row, because a menu is a list of what you can do and
     * an already-done row cannot be done again. A gesture has no room to grey anything, and
     * the reason a phone user swipes a completed row is to take it back.
     *
     * Re-opening lands on `in_progress` rather than `not_started` because that is already the
     * app's answer to "what does un-settling mean" — `completionCascade` re-opens settled
     * ancestors to exactly that state. Two answers to one question is how a tree ends up
     * disagreeing with itself.
     */
    const settled = selection?.state !== undefined && isSettled(selection.state);
    swipe.right = {
      label: settled ? "Reopen" : "Complete",
      tone: "positive",
      icon: "complete",
      run: () => actions.onSetState?.([id], settled ? "in_progress" : "completed"),
    };
  }

  if (actions.onDelete) {
    /*
     * Left deletes, behind the host's confirmation — `onDelete` parks the rows and renders the
     * shared `ConfirmDialog`, so the gesture and the menu row ask the same question, with the
     * same branch warning about what else goes with it.
     *
     * `responsive.md` allows exactly this and nothing looser: deleting here is a hard delete
     * that takes the whole branch, so it is the one thing in the app that must never happen on
     * release alone.
     */
    swipe.left = {
      label: "Delete",
      tone: "danger",
      icon: "delete",
      run: () => actions.onDelete?.([id]),
    };
  }

  return swipe;
}
