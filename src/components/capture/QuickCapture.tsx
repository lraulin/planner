"use client";

import { useCallback, useEffect, useState } from "react";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";
import { QuickCaptureDialog } from "./QuickCaptureDialog";
import { CAPTURE_EVENT } from "./event";

/**
 * The app-wide capture shortcut, mounted by `AppShell` so it exists on every signed-in view
 * and on no unauthenticated page.
 *
 * `c` follows the Gmail/GitHub convention for "create". It is safe as a bare letter here
 * because every other binding in the app is a named key — Return and its chords, arrows, Tab,
 * ⌫ — so nothing else wants it.
 *
 * This is the first handler that is not owned by the surface it fires on, so it cannot see
 * whether a grid is mid-rename or has a drawer open. It asks the DOM instead: a dialog
 * anywhere means the keystroke belongs to that, not to capture.
 *
 * The dialog is unmounted rather than hidden, so Escape discards the draft and the next
 * open starts clean.
 */
export function QuickCapture() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || isModalOpen()) return;

      event.preventDefault();
      setOpen(true);
    }

    function onRequest() {
      setOpen(true);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(CAPTURE_EVENT, onRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(CAPTURE_EVENT, onRequest);
    };
  }, []);

  // Closing is the success signal, as everywhere else in the app: a failed capture keeps
  // the box open with the error, so the box going away means it worked. No toast — this
  // would be the only one in the app, and a feedback convention should be decided for the
  // whole app rather than introduced by whichever feature happened to need one first.
  return open ? <QuickCaptureDialog onClose={close} onCaptured={close} /> : null;
}
