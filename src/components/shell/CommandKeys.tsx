"use client";

import { useEffect } from "react";
import { matchBindings } from "@/lib/commands/bindings";
import { commandOrder } from "@/lib/commands/menus";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";
import { useCommands, useCommandKeysSuspended } from "./CommandProvider";

/**
 * The one keyboard dispatcher.
 *
 * There were eleven `document` keydown listeners, each with its own `switch` on `event.key`, and the
 * shortcut a menu *printed* was an unrelated string typed beside the label. The two could disagree
 * for years without anything noticing: nothing in the app connected `"⌥↑"` to `event.altKey &&
 * event.key === "ArrowUp"`. Now a command declares `bindings`, this fires them, and `formatBindings`
 * prints them — one fact, one place.
 *
 * Mounted once in `AppShell`, above the palette, reading whatever the current view registered. Views
 * do not install listeners for their commands any more; they still own **selection navigation**
 * (arrows, shift-extend), which is movement over a row set rather than a command with a menu row.
 *
 * Guards, in order:
 *
 * - Anything the user is typing into wins, always (`isTypingTarget`).
 * - A dialog owns the keyboard while it is up (`isModalOpen`). `ContextMenu` handles itself with
 *   `stopImmediatePropagation`, which is stronger and stays as it is.
 * - A view can claim the keyboard for state the DOM cannot show — an inline editor
 *   (`useSuspendCommandKeys`).
 */
export function CommandKeys() {
  const commands = useCommands();
  const suspended = useCommandKeysSuspended();

  useEffect(() => {
    if (suspended) return;

    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (isModalOpen()) return;

      const match = commandOrder(commands).find((command) =>
        matchBindings(event, command.bindings),
      );
      if (!match) return;

      /*
       * `preventDefault` even when the command is disabled.
       *
       * Tab is Indent on a grid. If Outdent is illegal on this row and we let the key through, Tab
       * moves focus out of the grid — which reads as the row menu's greyed-out Outdent having
       * *broken* the page rather than having been unavailable. A key the view owns stays owned.
       */
      event.preventDefault();
      if (!match.disabled) match.run();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commands, suspended]);

  return null;
}
