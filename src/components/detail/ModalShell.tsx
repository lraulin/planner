"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { comboboxOwnsEscape, useModalFocus } from "./focus";

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
 *
 * Below `md` the panel is a **bottom sheet** rather than a centered card — anchored to the
 * bottom edge, full width, capped at 85dvh with its own scroll. Doing it here converts every
 * dialog in the app at once (`responsive.md`), and puts the controls under the thumb rather
 * than behind the soft keyboard.
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
        // An expanded combobox closes its own list first — see `comboboxOwnsEscape`.
        if (comboboxOwnsEscape()) return;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div
        onClick={onClose}
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />

      {/*
       * `max-md:max-w-none!` overrides the caller's width below `md` — a `max-w-sm` dialog
       * would otherwise sit 6px short of the edge on a 390px screen, which reads as a bug
       * rather than as a sheet. `pb-safe` clears the home indicator; the insets resolve to 0
       * on desktop, so it needs no breakpoint of its own.
       */}
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`pb-safe relative max-h-[85dvh] w-full overflow-y-auto rounded-t-xl border border-rule-strong bg-surface shadow-2xl outline-none max-md:max-w-none! md:max-h-[85vh] md:rounded-lg ${width}`}
      >
        {children}
      </div>
    </div>
  );
}
