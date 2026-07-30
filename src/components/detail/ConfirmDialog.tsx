"use client";

import { useId } from "react";
import { ModalShell } from "./ModalShell";

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
  const titleId = useId();
  const messageId = useId();

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      labelledBy={titleId}
      describedBy={messageId}
      role="alertdialog"
      width="max-w-sm"
    >
      <div className="p-5">
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
    </ModalShell>
  );
}
