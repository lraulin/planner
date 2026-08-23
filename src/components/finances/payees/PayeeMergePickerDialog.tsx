"use client";

import { useId, useMemo, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import type { PayeeRow } from "@/lib/finances/payees/queries";

/** Searchable path for choosing the identities a merge will consolidate. */
export function PayeeMergePickerDialog({
  payees,
  initiallySelected,
  onClose,
  onContinue,
}: {
  payees: readonly PayeeRow[];
  initiallySelected: ReadonlySet<string>;
  onClose: () => void;
  onContinue: (payees: PayeeRow[]) => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    () =>
      new Set(
        [...initiallySelected].filter((id) => payees.some((row) => row.id === id)),
      ),
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return payees;
    return payees.filter(
      (row) =>
        row.name.toLocaleLowerCase().includes(needle) ||
        row.aliases.some((alias) => alias.toLocaleLowerCase().includes(needle)),
    );
  }, [payees, query]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-lg">
      <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Select payees to merge
        </h2>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          Choose at least two duplicate identities. You will choose the survivor and
          review every moved reference next.
        </p>

        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search names or bank spellings…"
          className="mt-4 min-h-tap rounded border border-rule bg-surface px-3 py-2 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded border border-rule">
          {filtered.map((payee) => (
            <label
              key={payee.id}
              className="flex min-h-tap cursor-pointer items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0 hover:bg-surface-raised md:min-h-0"
            >
              <input
                type="checkbox"
                checked={selected.has(payee.id)}
                onChange={() => toggle(payee.id)}
                className="size-4 accent-[var(--color-select-edge)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-ink">
                  {payee.name}
                </span>
                <span className="block truncate text-[0.75rem] text-ink-muted">
                  {payee.aliases.join(", ") || "No bank spellings"}
                </span>
              </span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-ink-muted">
              No payees match that search.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[0.75rem] tabular-nums text-ink-muted">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-tap rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised md:min-h-0"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selected.size < 2}
              onClick={() =>
                onContinue(payees.filter((payee) => selected.has(payee.id)))
              }
              className="min-h-tap rounded border border-select-edge bg-select/15 px-3 py-1.5 text-[0.8125rem] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
            >
              Review merge
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
