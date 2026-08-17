"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchContacts, resolveContactQuery } from "@/lib/contacts/match";
import type { ContactOption } from "@/lib/contacts/types";

const INPUT_CLASS =
  "min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] font-normal normal-case tracking-normal text-ink outline-none focus:border-select-edge disabled:opacity-50 md:min-h-0";

/** How many matches the open list will paint. The rest stay behind the filter. */
const LIST_LIMIT = 50;

type Row = { kind: "empty" } | { kind: "contact"; contact: ContactOption };

/**
 * Type-to-filter address-book picker. Replaces a `<select>` once the list is long
 * enough that scrolling it is slower than typing a name.
 *
 * A typed name that does not resolve uniquely reverts — creating a person still goes
 * through `/contacts`. Escape closes the list without closing the drawer (window-capture,
 * before Drawer's document-capture listener), same as the exercise picker.
 *
 * Pass `label` when the picker is the field (the Contacts-tab editor). Callers that already
 * wrap their own label omit it so the control stays a bare input.
 */
export function ContactSelect({
  value,
  onChange,
  contacts,
  disabled,
  id,
  label,
  emptyLabel = "(none)",
}: {
  value: string | null;
  onChange: (contactId: string | null) => void;
  contacts: readonly ContactOption[];
  disabled?: boolean;
  id?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? (label ? generatedId : undefined);

  const selected = contacts.find((contact) => contact.id === value) ?? null;
  const committedLabel = selected?.displayName ?? "";

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

  // Treat the committed label as "show everything" so focusing a filled field
  // lists the book instead of filtering down to the one already chosen.
  const filterQuery = query === committedLabel ? "" : query;
  const matches = useMemo(
    () => matchContacts(contacts, filterQuery),
    [contacts, filterQuery],
  );
  const visible = matches.slice(0, LIST_LIMIT);
  const hiddenCount = matches.length - visible.length;

  const rows = useMemo((): Row[] => {
    const next: Row[] = [];
    if (filterQuery.trim() === "") next.push({ kind: "empty" });
    for (const contact of visible) next.push({ kind: "contact", contact });
    return next;
  }, [filterQuery, visible]);

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
    // commitOrRevert reads the latest query via the closure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, contacts, committedLabel, value]);

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
    const trimmed = query.trim();
    if (!trimmed) {
      if (value !== null) onChange(null);
      setQuery("");
      return;
    }
    const resolved = resolveContactQuery(contacts, query);
    if (resolved) {
      if (resolved.id !== value) onChange(resolved.id);
      setQuery(resolved.displayName);
      return;
    }
    setQuery(committedLabel);
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    if (row.kind === "empty") {
      if (value !== null) onChange(null);
      setQuery("");
      closeList();
      return;
    }
    if (row.contact.id !== value) onChange(row.contact.id);
    setQuery(row.contact.displayName);
    closeList();
  }

  function openList(highlightSelected: boolean) {
    setOpen(true);
    if (highlightSelected) {
      const selectedIndex = rows.findIndex(
        (row) => row.kind === "contact" && row.contact.id === value,
      );
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }

  const input = (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        placeholder={emptyLabel}
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
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              openList(true);
              return;
            }
            setActive((current) =>
              rows.length === 0 ? 0 : (current + 1) % rows.length,
            );
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              openList(true);
              return;
            }
            setActive((current) =>
              rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length,
            );
            return;
          }
          if (event.key === "Enter") {
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
                const className = `flex min-h-tap w-full items-center px-3 text-left text-[0.8125rem] last:border-b-0 md:min-h-0 md:py-1.5 ${
                  activeRow ? "bg-surface-raised" : ""
                }`;

                if (row.kind === "empty") {
                  return (
                    <button
                      key="empty"
                      type="button"
                      data-active={activeRow}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(row)}
                      className={`${className} text-ink-faint`}
                    >
                      {emptyLabel}
                    </button>
                  );
                }

                const current = row.contact.id === value;
                return (
                  <button
                    key={row.contact.id}
                    type="button"
                    data-active={activeRow}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(row)}
                    onMouseEnter={() => setActive(index)}
                    className={`${className} ${current ? "font-medium text-ink" : "text-ink"}`}
                  >
                    {row.contact.displayName}
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

  if (!label) return input;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted"
      >
        {label}
      </label>
      {input}
    </div>
  );
}
