"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  continueListOnEnter,
  indentOnTab,
  toggleWrap,
  type EditResult,
} from "@/lib/notes/editing";
import { MarkdownPreview } from "./MarkdownPreview";

/**
 * A markdown textarea with an Edit / Preview toggle.
 *
 * **This component owns no persistence.** It is controlled — `value` in, `onChange` out —
 * so the note drawer can wrap it in autosave while the node detail forms keep their
 * draft-then-Save flow. Building the debounce in here would have made it unusable on the
 * forms, which is most of where it ends up.
 *
 * Edit and Preview are a toggle rather than a split pane because the drawer caps at 720px
 * (`drawer-pattern.md`) — a good measure for prose, too narrow for two columns.
 *
 * The keyboard behaviour lives in `src/lib/notes/editing.ts`: it is cursor arithmetic, and
 * cursor arithmetic belongs where it can be tested.
 */
export function MarkdownEditor({
  value,
  onChange,
  ariaLabel = "Markdown",
  rows = 18,
  autoFocus = false,
  toolbarExtra,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
  rows?: number;
  autoFocus?: boolean;
  /** Rendered at the right of the toggle strip — the drawer puts its save status there. */
  toolbarExtra?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Set by an edit helper; applied after React has painted the new value. */
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const selection = pendingSelection.current;
    if (!selection || mode !== "edit") return;
    pendingSelection.current = null;
    // The textarea is controlled, so the caret must be restored *after* the re-render;
    // setting it inside the key handler would be overwritten by React's own value write.
    textareaRef.current?.setSelectionRange(selection.start, selection.end);
  }, [value, mode]);

  const applyEdit = useCallback(
    (result: EditResult | null) => {
      if (!result) return false;
      pendingSelection.current = result.selection;
      onChange(result.text);
      return true;
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const target = event.currentTarget;
      const selection = { start: target.selectionStart, end: target.selectionEnd };

      if (event.key === "Enter" && !event.shiftKey) {
        if (applyEdit(continueListOnEnter(target.value, selection))) {
          event.preventDefault();
        }
        return;
      }

      if (event.key === "Tab") {
        // Tab would otherwise leave the textarea, making a nested list impossible to write
        // without the mouse.
        if (applyEdit(indentOnTab(target.value, selection, event.shiftKey))) {
          event.preventDefault();
        } else if (!event.shiftKey) {
          event.preventDefault();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const marker =
          event.key === "b" || event.key === "B"
            ? "**"
            : event.key === "i" || event.key === "I"
              ? "_"
              : null;
        if (marker) {
          event.preventDefault();
          applyEdit(toggleWrap(target.value, selection, marker));
        }
      }
    },
    [applyEdit],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 pb-1.5">
        <div
          role="tablist"
          aria-label="Editor mode"
          className="flex overflow-hidden rounded border border-rule"
        >
          {(["edit", "preview"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              onClick={() => setMode(option)}
              className={[
                "min-h-tap px-3 text-[0.75rem] leading-none capitalize transition-colors md:min-h-0 md:px-2.5 md:py-1",
                mode === option
                  ? "bg-select font-medium text-ink"
                  : "text-ink-muted hover:bg-surface-raised hover:text-ink",
              ].join(" ")}
            >
              {option}
            </button>
          ))}
        </div>

        {mode === "edit" && (
          <span className="hidden text-[0.6875rem] text-ink-faint sm:inline">
            ⌘B bold · ⌘I italic · Tab indent
          </span>
        )}

        <div className="ml-auto">{toolbarExtra}</div>
      </div>

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          value={value}
          rows={rows}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel}
          spellCheck
          className="min-h-0 flex-1 resize-y rounded border border-rule bg-surface px-2.5 py-2 font-mono text-[0.8125rem] leading-relaxed text-ink outline-none focus:border-select-edge"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded border border-rule bg-surface px-3 py-2.5">
          <MarkdownPreview source={value} />
        </div>
      )}
    </div>
  );
}
