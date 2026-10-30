"use client";

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/keyboard";

/**
 * ↑ and ↓ walk a grid's selection; Shift extends it. Every flat grid wants exactly this, and
 * each used to carry its own copy of the listener, with guards that had drifted apart.
 *
 * `OutlineGrid` keeps its own: it also yields ⌥↑/↓ to the Move up/down commands and checks
 * for dialogs it does not own.
 *
 * `paused` is the host saying something else has the keyboard — its drawer, a confirm, an
 * inline edit. It is the host's own state, not a DOM query, for the reason `isModalOpen`
 * gives: a handler that owns its dialogs knows whether they are open.
 *
 * The hook adds no "needs a selection" guard. `moveSelection` reads a null focus as "start at
 * the end you are heading towards", so ArrowDown is how you pick the first row without the
 * mouse — and on Time Charts, where every visible cell is an inline input that stops
 * propagation, it is the only way in.
 */
export function useArrowKeySelection(
  move: (delta: number, extend: boolean) => void,
  paused = false,
): void {
  useEffect(() => {
    if (paused) return;
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, event.shiftKey);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [move, paused]);
}
