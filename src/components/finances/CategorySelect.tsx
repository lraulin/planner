"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  categoryPickerChoices,
  categoryPickerSections,
  commitCategoryPicker,
  defaultCategoryPickerChoice,
  type EnvelopeCatalog,
} from "@/lib/finances/budget/groupEnvelopeOptions";
import type { EnvelopeKind } from "@/db/schema";

/**
 * The Category picker: a typeahead whose open list is organised the way the Budget page
 * is — the four types, then nested budget groups, then envelopes — with New {type}… last
 * in each type.
 *
 * It is not a `<select>` because HTML cannot nest `<optgroup>`, so "groups within types"
 * is unreachable with a dropdown; and because finding one envelope among fifty is a
 * search, not a scroll.
 *
 * Keystrokes never write. Enter or a click commits the highlighted row, Escape restores
 * the previous value, and blur commits the highlight only when it is an envelope —
 * wandering off the field must not open a create dialog.
 *
 * Specs: `agent-os/specs/2026-08-26-1151-category-picker-typeahead/` and
 * `agent-os/specs/2026-08-29-1605-hidden-categories-in-picker/` (hidden envelopes stay
 * in the open list, marked).
 */
export function CategorySelect({
  catalog,
  value,
  onChange,
  onCreate,
  disabled = false,
  ariaLabel,
  className,
}: {
  catalog: EnvelopeCatalog;
  value: string | null;
  onChange: (categoryId: string | null) => void;
  onCreate: (kind: EnvelopeKind) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // Whether the draft is the user's typing or just the envelope this row already has.
  // Opening puts the current name in the field *selected*, so the next keystroke replaces
  // it — but filtering by it would open the list on a single row and hide the tree the
  // picker exists to show.
  const [typed, setTyped] = useState(false);
  // The row the user arrowed to, by id rather than index: the list is rebuilt on every
  // keystroke, so an index would point at a different row than the one that was chosen.
  // `null` means "wherever the filter puts the highlight".
  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    above: boolean;
  } | null>(null);

  // The closed field shows the envelope's own name; the open list supplies the group
  // context, so the full `Food › Groceries` path would only be noise here.
  const selectedName =
    catalog.envelopes.find((envelope) => envelope.id === value)?.name ?? "";

  const sections = useMemo(
    () =>
      open
        ? categoryPickerSections(catalog.groups, catalog.envelopes, typed ? draft : "")
        : [],
    [open, catalog, draft, typed],
  );
  const choices = useMemo(() => categoryPickerChoices(sections), [sections]);

  const explicitIndex = activeId
    ? choices.findIndex((choice) => choice.id === activeId)
    : -1;
  const activeIndex =
    explicitIndex >= 0 ? explicitIndex : defaultCategoryPickerChoice(choices);
  const highlighted = activeIndex >= 0 ? choices[activeIndex] : null;

  // Measured before the first paint of the list, and again while the grid scrolls: the
  // Register's cells are `overflow-hidden`, so the list has to be a fixed-position
  // popover rather than a child of the cell (`components/data-grid`).
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - VIEWPORT_GUTTER;
      const above = rect.top - VIEWPORT_GUTTER;
      const openAbove = below < MIN_LIST_HEIGHT && above > below;
      const width = Math.min(
        Math.max(rect.width, MIN_LIST_WIDTH),
        window.innerWidth - 2 * VIEWPORT_GUTTER,
      );
      setAnchor({
        left: Math.min(rect.left, window.innerWidth - width - VIEWPORT_GUTTER),
        top: openAbove ? rect.top : rect.bottom,
        width,
        maxHeight: Math.min(MAX_LIST_HEIGHT, openAbove ? above : below),
        above: openAbove,
      });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openPicker() {
    if (disabled || open) return;
    setDraft(selectedName);
    setTyped(false);
    // Opens on the envelope this row already has, so Enter is a no-op rather than a move
    // to whatever sorts first.
    setActiveId(value);
    setOpen(true);
    // Selected rather than cleared, so the first keystroke replaces the current envelope
    // but Escape or a blur still has something to restore.
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function close() {
    setOpen(false);
    setAnchor(null);
    setActiveId(null);
    setDraft("");
    setTyped(false);
  }

  /**
   * The one write path. `allowCreate` is false on blur — see the header.
   *
   * Note what does *not* move the highlight: hovering. Blur commits it, so a highlight
   * that follows the pointer means dragging the mouse across the list and clicking
   * anywhere else silently refiles the transaction. It did, during verification. Hover
   * gets its own shading instead, and only typing and the arrow keys decide what Enter
   * or a blur will write.
   */
  function commit(allowCreate: boolean) {
    const result = commitCategoryPicker(draft, highlighted, allowCreate);
    close();
    switch (result.action) {
      case "clear":
        if (value !== null) onChange(null);
        return;
      case "envelope":
        if (result.id !== value) onChange(result.id);
        return;
      case "create":
        onCreate(result.envelopeKind);
        return;
      case "restore":
        return;
    }
  }

  function step(delta: number) {
    if (choices.length === 0) return;
    const from = activeIndex >= 0 ? activeIndex : 0;
    const next = (((from + delta) % choices.length) + choices.length) % choices.length;
    setActiveId(choices[next].id);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${baseId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlighted ? `${baseId}-${highlighted.id}` : undefined
        }
        aria-label={ariaLabel}
        disabled={disabled}
        placeholder="Categorize"
        value={open ? draft : selectedName}
        onFocus={openPicker}
        onClick={openPicker}
        onChange={(event) => {
          setDraft(event.target.value);
          setTyped(true);
          setActiveId(null);
          // Committing leaves the field focused but closed. Typing into it has to bring
          // the list back, or the keystroke lands in an inert input and is lost.
          setOpen(true);
        }}
        onBlur={() => {
          if (open) commit(false);
        }}
        onKeyDown={(event) => {
          if (!open) {
            // Same reason as `onChange`: a closed-but-focused field still has to answer
            // the arrow keys that open a combobox.
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              openPicker();
            }
            return;
          }
          switch (event.key) {
            case "ArrowDown":
              event.preventDefault();
              step(1);
              break;
            case "ArrowUp":
              event.preventDefault();
              step(-1);
              break;
            case "Enter":
              event.preventDefault();
              commit(true);
              break;
            case "Escape":
              event.preventDefault();
              // Stop here: in the drawer and the Set category modal, Escape would
              // otherwise close the surface behind the list as well.
              event.stopPropagation();
              close();
              break;
          }
        }}
        className={className}
      />

      {/*
        Portalled to the body, not merely `position: fixed`: the grid's virtualized rows
        sit under a `transform`, which makes that ancestor the containing block for fixed
        children — the list rendered a row-offset away from its own cell. A portal leaves
        the transform behind, and with it the cell's `overflow-hidden`.
      */}
      {open &&
        anchor &&
        createPortal(
          <div
            ref={listRef}
            id={`${baseId}-list`}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              left: anchor.left,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
              ...(anchor.above
                ? { bottom: window.innerHeight - anchor.top }
                : { top: anchor.top }),
            }}
            className="z-50 overflow-y-auto rounded border border-rule-strong bg-surface py-1 shadow-lg"
          >
            {sections.length === 0 ? (
              <p className="px-3 py-3 text-[0.8125rem] text-ink-faint">
                Nothing matches “{draft.trim()}”.
              </p>
            ) : (
              sections.map((entry) =>
                entry.rows.map((row) => {
                  if (row.kind === "heading") {
                    return (
                      <div
                        key={`${entry.section.kind}-${row.id}`}
                        // Groups indent to the same step as ungrouped envelopes, because
                        // that is exactly what they are on the Budget page: siblings.
                        style={{
                          paddingLeft: indent(row.scope === "type" ? 0 : row.depth + 1),
                        }}
                        className={`truncate pr-3 pt-2 ${
                          row.scope === "type"
                            ? "text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint"
                            : "text-[0.75rem] font-medium text-ink-muted"
                        }`}
                      >
                        {row.label}
                        {row.hidden ? (
                          <span className="font-normal text-ink-faint"> (hidden)</span>
                        ) : null}
                      </div>
                    );
                  }
                  const isActive = highlighted?.id === row.id;
                  return (
                    <button
                      key={`${entry.section.kind}-${row.id}`}
                      id={`${baseId}-${row.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      // The click has to survive the input's blur, which would otherwise
                      // commit the highlight and unmount the list before it lands.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (row.kind === "create") {
                          close();
                          onCreate(row.envelopeKind);
                          return;
                        }
                        close();
                        if (row.id !== value) onChange(row.id);
                      }}
                      style={{
                        paddingLeft: indent(row.kind === "create" ? 1 : row.depth + 1),
                      }}
                      className={`flex min-h-tap w-full items-center pr-3 text-left text-[0.8125rem] md:min-h-0 md:py-1 ${
                        row.kind === "create" ? "text-ink-muted" : "text-ink"
                      } ${isActive ? "bg-surface-raised" : "hover:bg-surface-raised/60"}`}
                    >
                      <span className="min-w-0 truncate">{row.label}</span>
                      {row.kind === "envelope" && row.hidden ? (
                        <span className="shrink-0 text-ink-faint"> (hidden)</span>
                      ) : null}
                    </button>
                  );
                }),
              )
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Slack at the window edge, so a list that just fits is not flush against it. */
const VIEWPORT_GUTTER = 8;
const MIN_LIST_WIDTH = 224;
const MIN_LIST_HEIGHT = 160;
const MAX_LIST_HEIGHT = 320;

/** Nesting is the only thing that says which group an envelope is in. */
function indent(depth: number): string {
  return `${0.75 + depth * 0.75}rem`;
}
