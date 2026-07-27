"use client";

import { useEffect, useId, useRef } from "react";
import { useModalFocus } from "./focus";

/**
 * A real confirmation dialog, replacing `window.confirm`.
 *
 * `ux-principles.md` reserves modals for exactly two cases — destructive confirmations and
 * critical blocking decisions — and this component serves both of ours: deleting a row, and
 * closing a drawer that has unsaved changes.
 *
 * Cancel takes focus rather than confirm, so a reflexive Return does the safe thing.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();

  useModalFocus(panelRef, open);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        onClick={onCancel}
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-lg border border-rule-strong bg-surface p-5 shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        <p
          id={messageId}
          className="mt-2 text-[0.875rem] leading-relaxed text-ink-muted"
        >
          {message}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          {/* Ordered so the safe choice takes focus first. */}
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink transition-colors hover:border-rule-strong hover:bg-surface-raised"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "rounded px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
              destructive
                ? "border border-priority-a bg-priority-a/10 text-priority-a hover:bg-priority-a/20"
                : "border border-select-edge bg-select text-ink hover:brightness-105",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
