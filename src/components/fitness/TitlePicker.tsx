"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { titlesMatch } from "@/lib/fitness/titleMatch";
import type { RepeatableTitle } from "@/lib/fitness/types";

/**
 * Type-to-filter list of titles this person has already used. Same interaction family as
 * ExercisePicker: Escape closes the list, not the session drawer.
 */
export function TitlePicker({
  titles,
  value,
  onChange,
  onSelectTitle,
  placeholder = "Push, Upper, …",
}: {
  titles: readonly RepeatableTitle[];
  value: string;
  onChange: (title: string) => void;
  onSelectTitle: (title: RepeatableTitle) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter((t) => t.title.toLowerCase().includes(q));
  }, [titles, value]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  function pick(title: RepeatableTitle) {
    onSelectTitle(title);
    setOpen(false);
  }

  function commitTyped() {
    const match = titles.find((t) => titlesMatch(t.title, value));
    if (match) pick(match);
    else setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const chosen = matches[active];
            if (chosen) pick(chosen);
            else commitTyped();
          }
        }}
        className="w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
      />
      {open && matches.length > 0 ? (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-rule bg-surface shadow-md"
        >
          {matches.map((title, i) => (
            <button
              key={title.sessionId}
              type="button"
              role="option"
              data-active={i === active}
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(title)}
              className={`flex w-full items-center justify-between px-2 py-2 text-left text-[0.875rem] ${
                i === active ? "bg-select" : "hover:bg-shell"
              }`}
            >
              <span className="font-medium text-ink">{title.title}</span>
              <span className="font-mono text-[0.75rem] text-ink-faint">
                {title.exerciseCount} {title.exerciseCount === 1 ? "lift" : "lifts"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
