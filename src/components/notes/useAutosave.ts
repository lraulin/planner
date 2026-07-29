"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounced autosave for the note drawer.
 *
 * Autosave is what lets notes use the same drawer as every other tab (`shape.md`): a note
 * has nothing to validate, so there is nothing for a Save button to gate, and removing the
 * unsaved-changes prompt is what stops a drawer feeling wrong for long-form writing.
 *
 * Three things it must get right, all of which are ways to lose someone's writing:
 *
 * - **Flush on close and unmount.** Closing the drawer within the debounce window would
 *   otherwise discard the last edit silently.
 * - **Never report saved while a newer edit is pending.** Status tracks the value that was
 *   actually written, not the last request that happened to succeed.
 * - **Keep the text on a failure.** A failed save surfaces as an error with a retry; it
 *   never clears the editor or closes the drawer.
 */

export type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; at: number }
  | { state: "error"; message: string };

const DEBOUNCE_MS = 800;

export function useAutosave<T>(
  save: (values: T) => Promise<{ ok: true } | { ok: false; error: string }>,
) {
  const [status, setStatus] = useState<SaveStatus>({ state: "idle" });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  /** Guards against a slow earlier save resolving after a later one. */
  const generation = useRef(0);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flushNow = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    const values = pending.current;
    if (values === null) return;
    pending.current = null;

    const mine = ++generation.current;
    setStatus({ state: "saving" });

    try {
      const result = await saveRef.current(values);
      // A newer save started while this one was in flight; that one owns the status.
      if (mine !== generation.current) return;
      setStatus(
        result.ok
          ? { state: "saved", at: Date.now() }
          : { state: "error", message: result.error },
      );
    } catch {
      if (mine !== generation.current) return;
      setStatus({
        state: "error",
        message: "Could not reach the server. Your text is still here.",
      });
    }
  }, []);

  /** Queue a save. Repeated calls within the window collapse into one write. */
  const schedule = useCallback(
    (values: T) => {
      pending.current = values;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flushNow();
      }, DEBOUNCE_MS);
    },
    [flushNow],
  );

  const retry = useCallback(
    (values: T) => {
      pending.current = values;
      void flushNow();
    },
    [flushNow],
  );

  // Unmount is the last chance to write: the drawer may be closing, or the row may have
  // been swapped for another note.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const values = pending.current;
      if (values !== null) {
        pending.current = null;
        void saveRef.current(values);
      }
    };
  }, []);

  return { status, schedule, flush: flushNow, retry };
}
