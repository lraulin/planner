"use client";

import { useId, useMemo, useState } from "react";

/** Searchable multi-payee field shared by commitment and schedule editors. */
export function PayeePickerField({
  label = "Payees",
  payees,
  value,
  onChange,
}: {
  label?: string;
  payees: readonly { id: string; name: string }[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const chosen = new Set(value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? payees.filter((payee) => payee.name.toLocaleLowerCase().includes(needle))
      : payees;
  }, [payees, query]);

  function toggle(id: string) {
    onChange(chosen.has(id) ? value.filter((entry) => entry !== id) : [...value, id]);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={searchId}
        className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      >
        {label}
      </label>
      <p className="truncate text-[0.75rem] text-ink-muted">
        {value.length === 0
          ? "No payees — this record matches no charges."
          : payees
              .filter((payee) => chosen.has(payee.id))
              .map((payee) => payee.name)
              .join(", ")}
      </p>
      <input
        id={searchId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search payees…"
        className="min-h-tap rounded border border-rule bg-surface px-2 py-1.5 text-base text-ink outline-none focus:border-select-edge md:min-h-0 md:text-[0.8125rem]"
      />
      <div className="max-h-44 overflow-y-auto rounded border border-rule">
        {filtered.map((payee) => (
          <label
            key={payee.id}
            className="flex min-h-tap cursor-pointer items-center gap-2 border-b border-rule px-2 py-1.5 text-[0.8125rem] text-ink last:border-b-0 hover:bg-surface-raised md:min-h-0"
          >
            <input
              type="checkbox"
              checked={chosen.has(payee.id)}
              onChange={() => toggle(payee.id)}
              className="size-4 accent-[var(--color-select-edge)]"
            />
            <span className="truncate">{payee.name}</span>
          </label>
        ))}
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-center text-[0.8125rem] text-ink-muted">
            No payees found.
          </p>
        ) : null}
      </div>
    </div>
  );
}
