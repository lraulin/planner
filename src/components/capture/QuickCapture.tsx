"use client";

import { useCallback, useEffect, useState } from "react";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";
import { QuickCaptureDialog } from "./QuickCaptureDialog";
import { CAPTURE_EVENT } from "./event";

/**
 * The app-wide capture shortcut, mounted by `TabStrip` so it exists on every tab and on no
 * unauthenticated page.
 *
 * `c` follows the Gmail/GitHub convention for "create". It is safe as a bare letter here
 * because every other binding in the app is a named key — Insert, arrows, Tab, Enter, F2,
 * Delete — so nothing else wants it.
 *
 * This is the first handler that is not owned by the surface it fires on, so it cannot see
 * whether a grid is mid-rename or has a drawer open. It asks the DOM instead: a dialog
 * anywhere means the keystroke belongs to that, not to capture.
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

  return <QuickCaptureDialog open={open} onClose={close} />;
}
