"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchThoughtsAction } from "@/app/(shell)/library/brain/actions";
import { BRAIN_SEARCH_ID } from "@/lib/brain/commands";
import type { ThoughtRef, ThoughtSearchHit } from "@/lib/brain/types";
import { typeColor } from "./ThoughtChip";

const DEBOUNCE_MS = 150;

/**
 * Type-to-jump. Empty shows the recently visited thoughts; typing matches names, then notes.
 * `/` focuses it from anywhere on the page (the `brain.search` command owns that key).
 */
export function ThoughtSearch({
  recent,
  onOpen,
}: {
  recent: ThoughtRef[];
  onOpen: (thoughtId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  /** The toolbar row clips overflow, so the list is `fixed` against the input's rect. */
  const [anchor, setAnchor] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [hits, setHits] = useState<ThoughtSearchHit[]>([]);
  const [row, setRow] = useState(0);
  const latest = useRef(0);
  const query = text.trim();

  useEffect(() => {
    if (!query) return;
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      void searchThoughtsAction(query).then((result) => {
        if (mine === latest.current && result.ok) setHits(result.data);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const rows: (ThoughtRef & { snippet?: string })[] = query ? hits : recent;
  const open = focused && rows.length > 0;
  const current = Math.min(row, Math.max(rows.length - 1, 0));

  function choose(index: number) {
    const picked = rows[index];
    if (!picked) return;
    onOpen(picked.id);
    setText("");
    inputRef.current?.blur();
  }

  return (
    <div className="relative min-w-0 flex-1 md:max-w-sm">
      <input
        ref={inputRef}
        id={BRAIN_SEARCH_ID}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Search thoughts"
        value={text}
        placeholder="Search thoughts  ( / )"
        onFocus={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor({ left: box.left, top: box.bottom + 4, width: box.width });
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          setText(event.target.value);
          setRow(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setText("");
            event.currentTarget.blur();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setRow(Math.min(current + 1, rows.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setRow(Math.max(current - 1, 0));
          } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            choose(current);
          }
        }}
        className="min-h-tap w-full rounded border border-rule-strong bg-surface px-3 py-1 text-base text-ink md:min-h-0 md:text-[0.8125rem]"
      />
      {open && anchor && (
        <ul
          id={listId}
          role="listbox"
          style={anchor}
          className="fixed z-30 max-h-80 overflow-auto rounded border border-rule-strong bg-surface shadow-lg"
        >
          {!query && (
            <li className="px-3 pt-2 text-[0.6875rem] uppercase tracking-wide text-ink-muted">
              Recent
            </li>
          )}
          {rows.map((hit, index) => (
            <li
              key={hit.id}
              role="option"
              aria-selected={index === current}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              className={`flex min-h-tap cursor-pointer items-center gap-2 px-3 py-1.5 text-[0.875rem] ${
                index === current ? "bg-select" : "hover:bg-surface-raised"
              }`}
            >
              <span
                className="size-2.5 flex-none rounded-full"
                style={{ background: typeColor(hit.color) }}
              />
              <span className="truncate text-ink">{hit.name}</span>
              {hit.snippet && (
                <span className="truncate text-[0.75rem] text-ink-muted">
                  {hit.snippet}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {focused && query && rows.length === 0 && anchor && (
        <p
          style={anchor}
          className="fixed z-30 rounded border border-rule-strong bg-surface px-3 py-2 text-[0.8125rem] text-ink-muted shadow-lg"
        >
          No thought matches “{query}”.
        </p>
      )}
    </div>
  );
}
