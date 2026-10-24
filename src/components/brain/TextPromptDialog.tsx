"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";

/**
 * One text field in a dialog — rename a thought, label a link. A modal because the answer is
 * short and blocks nothing else (`modal-pattern.md`).
 */
export function TextPromptDialog({
  title,
  initial,
  placeholder,
  submitLabel = "Save",
  allowEmpty = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: string;
  placeholder?: string;
  submitLabel?: string;
  /** A link label may be cleared; a thought name may not. */
  allowEmpty?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [value, setValue] = useState(initial);
  const canSubmit = allowEmpty || value.trim() !== "";

  return (
    <ModalShell open onClose={onCancel} labelledBy={titleId} width="max-w-sm">
      <form
        className="p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit(value.trim());
        }}
      >
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        <input
          autoFocus
          value={value}
          placeholder={placeholder}
          aria-labelledby={titleId}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-3 min-h-tap w-full rounded border border-rule-strong bg-surface px-3 py-1.5 text-base text-ink md:text-[0.875rem]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-tap rounded border border-rule-strong px-3 py-1.5 text-[0.8125rem] text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-tap rounded bg-ink px-3 py-1.5 text-[0.8125rem] font-medium text-surface disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
