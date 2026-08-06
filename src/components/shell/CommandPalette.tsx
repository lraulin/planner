"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/detail/ModalShell";
import { isModalOpen, isTypingTarget } from "@/lib/keyboard";
import {
  COMMAND_GROUP_LABELS,
  matchCommands,
  mergeCommands,
  type Command,
} from "@/lib/commands/registry";
import { formatBindings } from "@/lib/commands/bindings";
import { COMMAND_PALETTE_EVENT } from "./commandEvent";
import { useCommands } from "./CommandProvider";
import { useGlobalCommands } from "./globalCommands";

/**
 * `⌘K` — the Go menu, and the index of everything the app can do.
 *
 * Achieve reached all sixteen of its destinations through **Go** and kept only what you had
 * opened as tabs. We had the tabs without the Go menu, which is why eleven of them were
 * permanent. This is the missing half, and it also swallows the Actions / Tools / View menus:
 * one registry, listed here and rendered again behind each module's `⋯` (`registry.ts`).
 *
 * Built on `ModalShell` per `modal-pattern.md`, so it gets the roles, capture-phase Escape,
 * focus handling, and the below-`md` bottom sheet for free — though on a phone this is
 * reached only from the More sheet's Search row, since there is no `⌘K` on touch.
 *
 * Unmounted rather than hidden while closed, per the same standard: the query is a draft,
 * and the next `⌘K` should start empty rather than showing the last thing you searched for.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      // The same two guards `QuickCapture` uses: never steal a keystroke from something the
      // user is typing into, and never open on top of a drawer or a confirmation.
      if (isTypingTarget(event.target) || isModalOpen()) return;

      event.preventDefault();
      setOpen(true);
    }

    function onRequest() {
      setOpen(true);
    }

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_EVENT, onRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onRequest);
    };
  }, []);

  return open ? <PaletteDialog onClose={close} /> : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const global = useGlobalCommands();
  const contextual = useCommands();

  // Contextual last, so a view's own `grid.reset` replaces the global entry of that id
  // rather than appearing twice.
  const all = useMemo(() => mergeCommands(global, contextual), [global, contextual]);
  const results = useMemo(() => matchCommands(all, query), [all, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /** Next enabled row in `delta` direction, wrapping. `null` when nothing can be chosen. */
  function step(from: number, delta: number): number {
    const count = results.length;
    for (let i = 1; i <= count; i++) {
      const index = (((from + delta * i) % count) + count) % count;
      if (!results[index].disabled) return index;
    }
    return from;
  }

  function choose(command: Command | undefined) {
    if (!command || command.disabled) return;
    // Close first: a command that navigates should not leave the palette open over the new
    // page, and one that opens a dialog must not open it behind this one.
    onClose();
    command.run();
  }

  return (
    <ModalShell open onClose={onClose} labelledBy={titleId} width="max-w-lg">
      <h2 id={titleId} className="sr-only">
        Search modules and commands
      </h2>

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          // Typing moves the highlight back to the best match. Done here rather than in an
          // effect on `query`: the keystroke *is* the event, and an effect would be a second
          // render deciding what the first one already knew.
          setActive(0);
        }}
        placeholder="Go to a module, or run a command…"
        aria-label="Search modules and commands"
        // `isTypingTarget` is true in here, so the global `c` and `⌘K` handlers stand down
        // on their own — nothing extra is needed to type a "c".
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowDown":
              event.preventDefault();
              setActive((current) => step(current, 1));
              break;
            case "ArrowUp":
              event.preventDefault();
              setActive((current) => step(current, -1));
              break;
            case "Enter":
              event.preventDefault();
              choose(results[active]);
              break;
          }
        }}
        className="w-full border-b border-rule bg-transparent px-4 py-3 text-[0.9375rem] text-ink outline-none placeholder:text-ink-faint"
      />

      <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-[0.8125rem] text-ink-faint">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          results.map((command, index) => {
            // Group headings only when the list is still in group order — once a query has
            // ranked the results, "Go to" above a row is a claim about ordering that is no
            // longer true.
            const heading =
              query.trim() === "" && command.group !== results[index - 1]?.group
                ? COMMAND_GROUP_LABELS[command.group]
                : null;

            return (
              <div key={command.id}>
                {heading && (
                  <h3 className="px-4 pb-0.5 pt-2 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
                    {heading}
                  </h3>
                )}

                <button
                  type="button"
                  disabled={command.disabled}
                  title={command.title}
                  data-active={index === active}
                  onClick={() => choose(command)}
                  onMouseEnter={() => !command.disabled && setActive(index)}
                  className={`flex w-full items-center gap-6 px-4 py-1.5 text-left text-[0.8125rem] leading-6 ${
                    command.disabled
                      ? "cursor-not-allowed text-ink-faint"
                      : command.destructive
                        ? "text-priority-a"
                        : "text-ink"
                  } ${!command.disabled && index === active ? "bg-surface-raised" : ""}`}
                >
                  <span className="flex-1 truncate">{command.label}</span>
                  {formatBindings(command.bindings) && (
                    <span className="tabular flex-none text-[0.6875rem] text-ink-faint">
                      {formatBindings(command.bindings)}
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </ModalShell>
  );
}
