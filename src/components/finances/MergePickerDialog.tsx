"use client";

import { useState, type ReactNode } from "react";
import { NoMatches, SearchPickerDialog } from "@/components/detail/SearchPickerDialog";
import { toggledIn } from "@/lib/toggledIn";

/**
 * Tick the records a merge will consolidate — payees, supply items — from a searchable
 * list, for a phone that cannot Shift-click rows. Continue needs at least two; the next
 * step picks the survivor.
 */
export function MergePickerDialog<T extends { id: string; name: string }>({
  records,
  initiallySelected,
  title,
  description,
  placeholder,
  emptyText,
  matches = () => false,
  detail,
  onClose,
  onContinue,
}: {
  records: readonly T[];
  initiallySelected: ReadonlySet<string>;
  title: string;
  description: ReactNode;
  placeholder: string;
  /** Shown when the search matches nothing. */
  emptyText: string;
  /** Whether a record matches the lowercased, trimmed search; the name is checked first. */
  matches?: (record: T, needle: string) => boolean;
  /** The muted second line under a record's name. */
  detail: (record: T) => ReactNode;
  onClose: () => void;
  onContinue: (records: T[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    () =>
      new Set(
        [...initiallySelected].filter((id) => records.some((row) => row.id === id)),
      ),
  );
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? records.filter(
        (row) => row.name.toLocaleLowerCase().includes(needle) || matches(row, needle),
      )
    : records;

  function toggle(id: string) {
    setSelected((current) => toggledIn(current, id));
  }

  return (
    <SearchPickerDialog
      title={title}
      description={description}
      placeholder={placeholder}
      query={query}
      onQueryChange={setQuery}
      onClose={onClose}
      footerStart={
        <p className="text-[0.75rem] tabular-nums text-ink-muted">
          {selected.size} selected
        </p>
      }
      actions={
        <button
          type="button"
          disabled={selected.size < 2}
          onClick={() => onContinue(records.filter((row) => selected.has(row.id)))}
          className="min-h-tap rounded border border-select-edge bg-select/15 px-3 py-1.5 text-[0.8125rem] font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
        >
          Review merge
        </button>
      }
    >
      {filtered.map((record) => (
        <label
          key={record.id}
          className="flex min-h-tap cursor-pointer items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0 hover:bg-surface-raised md:min-h-0"
        >
          <input
            type="checkbox"
            checked={selected.has(record.id)}
            onChange={() => toggle(record.id)}
            className="size-4 accent-[var(--color-select-edge)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-medium text-ink">
              {record.name}
            </span>
            <span className="block truncate text-[0.75rem] text-ink-muted">
              {detail(record)}
            </span>
          </span>
        </label>
      ))}
      {filtered.length === 0 && <NoMatches>{emptyText}</NoMatches>}
    </SearchPickerDialog>
  );
}
