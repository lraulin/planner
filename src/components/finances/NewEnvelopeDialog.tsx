"use client";

import { useId, useState, useTransition } from "react";
import { createBudgetCategoryAction } from "@/app/finances/actions";
import { ModalShell } from "@/components/detail/ModalShell";
import type { EnvelopeKind } from "@/db/schema";

const TITLES: Record<Exclude<EnvelopeKind, "bill">, string> = {
  income: "New income",
  spending: "New envelope",
  savings: "New savings",
};

const FIELD =
  "min-h-tap rounded border border-rule bg-surface px-2 text-base text-ink md:min-h-0 md:py-1 md:text-[0.8125rem]";

/**
 * Name a new income / spending / savings envelope from a Register row.
 *
 * Bills go through Track as bill — they need a cadence this form does not collect.
 */
export function NewEnvelopeDialog({
  kind,
  onClose,
  onCreated,
}: {
  kind: Exclude<EnvelopeKind, "bill">;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-md">
      <form
        className="flex flex-col gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() === "") return;
          setError(null);
          startTransition(async () => {
            const result = await createBudgetCategoryAction(null, name.trim(), kind);
            if (!result.ok || !result.id) {
              setError(result.ok ? "Could not create the envelope." : result.error);
              return;
            }
            onCreated(result.id, name.trim());
          });
        }}
      >
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          {TITLES[kind]}
        </h2>
        <label className="flex flex-col gap-1 text-[0.75rem] text-ink-muted">
          Call it
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            aria-label="Name for this envelope"
            className={FIELD}
          />
        </label>
        {error && <p className="text-[0.75rem] text-priority-a">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-tap rounded border border-rule px-3 text-[0.8125rem] text-ink hover:border-rule-strong hover:bg-surface-raised md:min-h-0 md:py-1.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || name.trim() === ""}
            className="min-h-tap rounded border border-select-edge bg-select px-3 text-[0.8125rem] font-medium text-ink disabled:opacity-50 md:min-h-0 md:py-1.5"
          >
            {pending ? "Saving…" : "Create"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
