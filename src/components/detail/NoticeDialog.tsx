"use client";

import { useId } from "react";
import { ModalShell } from "./ModalShell";

/**
 * A one-button notice. ConfirmDialog is for a choice (delete, discard). This is for
 * "that did not work" when there is no toast stack to put it on.
 */
export function NoticeDialog({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const messageId = useId();

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={messageId}
      role="dialog"
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
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-select-edge bg-select px-3 py-1.5 text-[0.8125rem] font-medium text-ink transition-colors hover:brightness-105"
          >
            OK
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
