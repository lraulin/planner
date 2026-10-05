"use client";

import { useId, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { isComposingKey } from "@/lib/keyboard";

/**
 * Ask for a scenario's name — New, Rename and Duplicate share it. A modal because there is
 * no row to type into yet (a new or copied scenario) and the rename has none worth editing in
 * place (the picker is a row of buttons).
 */
export function ScenarioNameDialog({
  title,
  description,
  initialName,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  initialName: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const titleId = useId();
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  function submit() {
    if (trimmed !== "") onSubmit(trimmed);
  }

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-sm">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            {description}
          </p>
        ) : null}
        <input
          autoFocus
          value={name}
          aria-label="Scenario name"
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !isComposingKey(event.nativeEvent)) {
              event.preventDefault();
              submit();
            }
          }}
          className="mt-4 min-h-tap w-full rounded border border-rule bg-surface px-3 py-2 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0 md:py-1.5"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={trimmed === ""}
            className="min-h-tap rounded bg-ink px-3 text-[0.8125rem] text-surface disabled:opacity-40 md:min-h-0 md:py-1.5"
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
