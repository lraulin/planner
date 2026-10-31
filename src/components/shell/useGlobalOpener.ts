"use client";

import { useCallback, useEffect, useState } from "react";
import { matchBindings, type KeyBinding } from "@/lib/commands/bindings";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";

/**
 * Open state for an app-wide dialog — the command palette, quick capture — that opens from
 * a shortcut anywhere or from `requestEvent` dispatched on `window` (a menu item, a button).
 *
 * The shortcut is ignored while the user is typing or a dialog is already open: a handler
 * mounted by the shell cannot see whether a grid is mid-rename or a drawer is up, so it asks
 * the DOM, and a keystroke that belongs to something else is never stolen.
 */
export function useGlobalOpener(
  bindings: readonly KeyBinding[],
  requestEvent: string,
): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!matchBindings(event, bindings)) return;
      if (isTypingTarget(event.target) || isModalOpen()) return;

      event.preventDefault();
      setOpen(true);
    }

    function onRequest() {
      setOpen(true);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(requestEvent, onRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(requestEvent, onRequest);
    };
  }, [bindings, requestEvent]);

  return { open, close };
}
