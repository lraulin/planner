"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isComposingKey } from "@/lib/keyboard";

const INPUT_CLASS =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink outline-none focus:border-select-edge disabled:opacity-50 md:min-h-0";

type Row<T> = { kind: "empty" } | { kind: "item"; item: T } | { kind: "create" };

/**
 * Type-to-filter picker over a list of records — contacts, exercises. Replaces a `<select>`
 * once the list is long enough that scrolling it is slower than typing a name.
 *
 * The input shows the chosen record's label. Focusing a filled field lists everything
 * rather than filtering down to the one already chosen. Leaving the field commits a typed
 * name that resolves to exactly one record and reverts anything else. Escape closes the
 * list without closing a surrounding drawer: it listens on window capture, ahead of the
 * Drawer's document-capture handler.
 *
 * `limit` caps how many matches the open list paints; the rest stay behind the filter.
 * `create` adds a last row that hands the typed name to an editor, for a record that
 * needs more than a name to exist.
 */
export function TypeaheadSelect<T extends { id: string }>({
  items,
  value,
  onChange,
  labelOf,
  match,
  resolve,
  allowEmpty = true,
  emptyLabel,
  placeholder,
  id,
  disabled,
  limit,
  create,
}: {
  items: readonly T[];
  /** The chosen record's id, or null for none. */
  value: string | null;
  onChange: (id: string | null) => void;
  labelOf: (item: T) => string;
  match: (items: readonly T[], query: string) => T[];
  resolve: (items: readonly T[], query: string) => T | null;
  allowEmpty?: boolean;
  /** The "none" row, and the placeholder when `placeholder` is not given. */
  emptyLabel: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  limit?: number;
  create?: { label: (typed: string) => string; onCreate: (typed: string) => void };
}) {
  const selected = items.find((item) => item.id === value) ?? null;
  const committedLabel = selected ? labelOf(selected) : "";

  const [query, setQuery] = useState(committedLabel);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const focusedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focusedRef.current) setQuery(committedLabel);
  }, [committedLabel]);

  const filterQuery = query === committedLabel ? "" : query;
  const matches = useMemo(() => match(items, filterQuery), [match, items, filterQuery]);
  const visible = limit === undefined ? matches : matches.slice(0, limit);
  const hiddenCount = matches.length - visible.length;

  const rows: Row<T>[] = [
    ...(allowEmpty && filterQuery.trim() === "" ? [{ kind: "empty" as const }] : []),
    ...visible.map((item) => ({ kind: "item" as const, item })),
    ...(create ? [{ kind: "create" as const }] : []),
  ];

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      commitOrRevert();
      closeList();
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // commitOrRevert reads the latest query and items through its closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, items, committedLabel, allowEmpty, value]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setQuery(committedLabel);
      closeList();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, committedLabel]);

  function closeList() {
    setOpen(false);
    focusedRef.current = false;
  }

  function commitOrRevert() {
    if (query === committedLabel) return;
    if (!query.trim()) {
      if (allowEmpty && value !== null) onChange(null);
      setQuery("");
      return;
    }
    const resolved = resolve(items, query);
    if (resolved) {
      if (resolved.id !== value) onChange(resolved.id);
      setQuery(labelOf(resolved));
      return;
    }
    setQuery(committedLabel);
  }

  function choose(row: Row<T> | undefined) {
    if (!row) return;
    if (row.kind === "empty") {
      if (value !== null) onChange(null);
      setQuery("");
      closeList();
      return;
    }
    if (row.kind === "create") {
      const typed =
        filterQuery.trim() && filterQuery !== committedLabel ? filterQuery.trim() : "";
      setQuery(committedLabel);
      closeList();
      create?.onCreate(typed);
      return;
    }
    if (row.item.id !== value) onChange(row.item.id);
    setQuery(labelOf(row.item));
    closeList();
  }

  function openList(highlightSelected: boolean) {
    setOpen(true);
    if (highlightSelected) {
      const selectedIndex = rows.findIndex(
        (row) => row.kind === "item" && row.item.id === value,
      );
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }

  function step(delta: 1 | -1) {
    if (!open) {
      openList(true);
      return;
    }
    setActive((current) =>
      rows.length === 0 ? 0 : (current + delta + rows.length) % rows.length,
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        placeholder={placeholder ?? emptyLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          focusedRef.current = true;
          openList(true);
          inputRef.current?.select();
        }}
        onClick={() => {
          if (disabled) return;
          // After a pick the input stays focused, so a second click would
          // otherwise just place the caret and leave the list closed.
          if (!open) {
            openList(true);
            inputRef.current?.select();
          }
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (open) {
            commitOrRevert();
            setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            step(event.key === "ArrowDown" ? 1 : -1);
            return;
          }
          if (event.key === "Enter") {
            if (isComposingKey(event.nativeEvent)) return;
            event.preventDefault();
            if (open) choose(rows[active]);
            return;
          }
          if (event.key === "Tab") {
            commitOrRevert();
            setOpen(false);
          }
        }}
        className={INPUT_CLASS}
      />

      {open && !disabled && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded border border-rule-strong bg-surface shadow-lg"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-[0.8125rem] text-ink-faint">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            <>
              {rows.map((row, index) => {
                const activeRow = index === active;
                const tone =
                  row.kind === "empty"
                    ? "text-ink-faint"
                    : row.kind === "create"
                      ? "border-t border-rule text-ink-muted"
                      : row.item.id === value
                        ? "font-medium text-ink"
                        : "text-ink";
                return (
                  <button
                    key={row.kind === "item" ? row.item.id : row.kind}
                    type="button"
                    data-active={activeRow}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(row)}
                    className={`flex min-h-tap w-full items-center px-3 text-left text-[0.8125rem] last:border-b-0 md:min-h-0 md:py-1.5 ${
                      activeRow ? "bg-surface-raised" : ""
                    } ${tone}`}
                  >
                    {row.kind === "empty"
                      ? emptyLabel
                      : row.kind === "create"
                        ? create?.label(filterQuery.trim())
                        : labelOf(row.item)}
                  </button>
                );
              })}
              {hiddenCount > 0 && (
                <p className="border-t border-rule px-3 py-1.5 text-[0.75rem] text-ink-faint">
                  {hiddenCount} more — keep typing
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
