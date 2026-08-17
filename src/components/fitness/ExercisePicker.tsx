"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  exerciseOptionLabel,
  matchExercises,
  resolveExerciseQuery,
} from "@/lib/fitness/exerciseMatch";
import type { ExerciseSummary } from "@/lib/fitness/types";

type Row =
  | { kind: "empty" }
  | { kind: "exercise"; exercise: ExerciseSummary }
  | { kind: "create" };

/**
 * Type-to-filter catalog picker. Replaces a `<select>` once the list is long
 * enough that scrolling it is slower than typing "bench".
 *
 * A typed name that does not match does not create a row — that still goes
 * through ExerciseEditor, because equipment has to be chosen. Escape closes
 * the list without closing the session drawer (window-capture, before Drawer's
 * document-capture listener).
 */
export function ExercisePicker({
  catalog,
  value,
  onChange,
  onCreateNew,
  allowEmpty = true,
  emptyLabel = "Select exercise…",
  placeholder,
  id,
}: {
  catalog: readonly ExerciseSummary[];
  value: string;
  onChange: (exerciseId: string) => void;
  /** Opens the catalog editor. Receives the typed name when it is a draft. */
  onCreateNew?: (typedName: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
  id?: string;
}) {
  const selected = catalog.find((exercise) => exercise.id === value) ?? null;
  const committedLabel = selected ? exerciseOptionLabel(selected) : "";

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
  // lists the catalog instead of filtering down to the one already chosen.
  const filterQuery = query === committedLabel ? "" : query;
  const matches = useMemo(
    () => matchExercises(catalog, filterQuery),
    [catalog, filterQuery],
  );

  const rows = useMemo((): Row[] => {
    const next: Row[] = [];
    if (allowEmpty && filterQuery.trim() === "") next.push({ kind: "empty" });
    for (const exercise of matches) next.push({ kind: "exercise", exercise });
    if (onCreateNew) next.push({ kind: "create" });
    return next;
  }, [allowEmpty, filterQuery, matches, onCreateNew]);

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
    // commitOrRevert reads the latest query/catalog via the closure below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, catalog, committedLabel, allowEmpty, value]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Window capture runs before Drawer's document-capture Escape.
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
      if (allowEmpty && value !== "") onChange("");
      setQuery("");
      return;
    }
    const resolved = resolveExerciseQuery(catalog, query);
    if (resolved) {
      if (resolved.id !== value) onChange(resolved.id);
      setQuery(exerciseOptionLabel(resolved));
      return;
    }
    setQuery(committedLabel);
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    if (row.kind === "empty") {
      if (value !== "") onChange("");
      setQuery("");
      closeList();
      return;
    }
    if (row.kind === "create") {
      const typed =
        filterQuery.trim() && filterQuery !== committedLabel ? filterQuery.trim() : "";
      setQuery(committedLabel);
      closeList();
      onCreateNew?.(typed);
      return;
    }
    if (row.exercise.id !== value) onChange(row.exercise.id);
    setQuery(exerciseOptionLabel(row.exercise));
    closeList();
  }

  function openList(highlightSelected: boolean) {
    setOpen(true);
    if (highlightSelected) {
      const selectedIndex = rows.findIndex(
        (row) => row.kind === "exercise" && row.exercise.id === value,
      );
      setActive(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }

  const createLabel = (() => {
    const typed = filterQuery.trim();
    return typed ? `Add “${typed}”…` : "Add new exercise…";
  })();

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder ?? emptyLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          focusedRef.current = true;
          openList(true);
          inputRef.current?.select();
        }}
        onClick={() => {
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
        className="min-h-tap w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal outline-none focus:border-select-edge md:min-h-0"
      />

      {open && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded border border-rule-strong bg-surface shadow-lg"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-[0.8125rem] text-ink-faint">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            rows.map((row, index) => {
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

              if (row.kind === "create") {
                return (
                  <button
                    key="create"
                    type="button"
                    data-active={activeRow}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(row)}
                    className={`${className} border-t border-rule text-ink-muted`}
                  >
                    {createLabel}
                  </button>
                );
              }

              const current = row.exercise.id === value;
              return (
                <button
                  key={row.exercise.id}
                  type="button"
                  data-active={activeRow}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row)}
                  className={`${className} ${current ? "font-medium text-ink" : "text-ink"}`}
                >
                  {exerciseOptionLabel(row.exercise)}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
