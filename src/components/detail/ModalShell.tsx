"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useModalFocus } from "./focus";

/**
 * The centered-dialog shell: backdrop, panel, focus handling, Escape.
 *
 * Extracted once there were four of these — the delete confirmation, Show Fields, the note
 * filter, and quick capture — all repeating the same backdrop colour, the same
 * `useModalFocus` call, and the same capture-phase Escape listener.
 *
 * Escape is handled in the capture phase so it closes the dialog before a grid's own
 * keyboard handler sees it and cancels an edit underneath.
 *
 * `ux-principles.md` keeps modals rare on purpose, so this is a small shared shell rather
 * than a general modal system: it deliberately has no stacking, no scroll lock and no
 * portal, because nothing here needs them.
 */
export function ModalShell({
  open,
  onClose,
  labelledBy,
  describedBy,
  role = "dialog",
  width = "max-w-lg",
  panelRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Id of the element naming this dialog — usually its heading. */
  labelledBy: string;
  describedBy?: string;
  /** `alertdialog` for a destructive confirmation; `dialog` otherwise. */
  role?: "dialog" | "alertdialog";
  /** Tailwind max-width class for the panel. */
  width?: string;
  /** Supply one when the caller needs to reach into the panel; otherwise internal. */
  panelRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const fallbackRef = useRef<HTMLDivElement>(null);
  const ref = panelRef ?? fallbackRef;

  useModalFocus(ref, open);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onClose}
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />

      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative w-full ${width} rounded-lg border border-rule-strong bg-surface shadow-2xl outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
