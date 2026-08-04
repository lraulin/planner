"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Quick search for a grid.
 *
 * The input is **local** and the persisted value is written on a delay. Two reasons, and
 * both matter:
 *
 * - Every write to `grid:{tabId}` goes through the settings store and out to the server.
 *   Persisting a keystroke at a time would queue one round trip per character.
 * - `ux-principles.md` — do not move the world while the user is still typing. Narrowing on
 *   each keystroke is expected of a search box and stays; what must not happen is a write
 *   storm behind it, which is what makes the grid feel like it is fighting the cursor.
 *
 * The committed value still flows back down as `value`, so an external clear — the chip
 * bar's ×, or Clear all — resets the visible text rather than leaving a stale word in a box
 * that is no longer filtering anything.
 */
export function GridSearchBox({
  value,
  onChange,
  placeholder = "Search…",
  delayMs = 250,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delayMs?: number;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);

  // Adopt an externally-committed value (chip ×, Clear all, a reload) without clobbering
  // what the user is mid-way through typing: `value` only changes from outside once our own
  // debounced write has landed and matched it.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setDraft(value);
  }

  /**
   * Latest-callback ref, so the debounce timer is not restarted every time the host
   * re-renders with a new `onChange` identity — which would mean the write never lands
   * while the grid is busy re-rendering behind the typing.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChangeRef.current(draft), delayMs);
    return () => clearTimeout(timer);
  }, [draft, value, delayMs]);

  return (
    <div className="flex flex-none items-center gap-1.5">
      <label htmlFor={inputId} className="sr-only">
        Search this grid
      </label>
      <div className="relative flex items-center">
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 text-[0.75rem] text-ink-faint"
        >
          ⌕
        </span>
        <input
          id={inputId}
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || draft === "") return;
            // Escape clears the box and commits immediately — waiting out the debounce to
            // un-filter a grid feels broken.
            event.preventDefault();
            event.stopPropagation();
            setDraft("");
            onChangeRef.current("");
          }}
          placeholder={placeholder}
          // 16px on the input itself: anything smaller makes iOS zoom the page on focus.
          className="min-h-tap w-40 rounded border border-rule bg-surface py-1 pr-2 pl-6 text-[1rem] text-ink outline-none focus:border-select-edge md:min-h-0 md:w-44 md:text-[0.8125rem]"
        />
      </div>
    </div>
  );
}
