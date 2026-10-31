"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchThoughtsAction } from "@/app/(shell)/library/brain/actions";
import type { LinkRelation } from "@/lib/brain/links";
import type { ThoughtSearchHit } from "@/lib/brain/types";
import { ThoughtOption } from "./ThoughtChip";

const LABELS: Record<LinkRelation, string> = {
  child: "child",
  parent: "parent",
  jump: "jump",
};

const DEBOUNCE_MS = 150;

/**
 * "Add child / parent / jump" on the active thought, or on whichever thought a gate drag began at. Typing searches existing thoughts, and
 * choosing one links it; Enter on text that matches nothing creates a new thought already
 * linked. Offering the existing ones first is what keeps this from minting a duplicate of a
 * thought that was already there.
 */
export function AddLinkInput({
  relation,
  activeId,
  onChoose,
  onCreate,
  onCancel,
  placeholder,
  cancelOnBlur = false,
}: {
  relation: LinkRelation;
  activeId: string;
  onChoose: (otherId: string) => void;
  onCreate: (name: string) => void;
  onCancel: () => void;
  /** Replaces the toolbar wording where the input floats over the plex. */
  placeholder?: string;
  /** Drop an empty input when focus leaves it, for an input that appeared on a drag. */
  cancelOnBlur?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState("");
  const [hits, setHits] = useState<ThoughtSearchHit[]>([]);
  const [highlight, setHighlight] = useState(0);
  const latest = useRef(0);

  const query = text.trim();

  useEffect(() => {
    if (!query) return;
    const mine = ++latest.current;
    const timer = setTimeout(() => {
      void searchThoughtsAction(query).then((result) => {
        if (mine !== latest.current || !result.ok) return;
        setHits(result.data.filter((hit) => hit.id !== activeId));
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, activeId]);

  const shown = query ? hits : [];
  const exact = shown.findIndex(
    (hit) => hit.name.toLowerCase() === query.toLowerCase(),
  );
  // Rows are the hits, then "Create". Start on an exact match, else on Create, so Enter on
  // novel text creates and Enter on a name that exists links it.
  const rowCount = query ? shown.length + 1 : 0;
  const defaultRow = exact >= 0 ? exact : shown.length;
  const row = Math.min(
    highlight < 0 ? defaultRow : highlight,
    Math.max(rowCount - 1, 0),
  );

  function commit(index: number) {
    if (!query) return;
    if (index < shown.length) onChoose(shown[index].id);
    else onCreate(query);
  }

  return (
    <div className="relative">
      <input
        autoFocus
        role="combobox"
        aria-expanded={rowCount > 0}
        aria-controls={listId}
        aria-label={`Add ${LABELS[relation]}`}
        value={text}
        placeholder={
          placeholder ?? `Add ${LABELS[relation]}: find a thought or type a new one`
        }
        onBlur={() => {
          if (cancelOnBlur && !query) onCancel();
        }}
        onChange={(event) => {
          setText(event.target.value);
          setHighlight(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight(Math.min(row + 1, rowCount - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight(Math.max(row - 1, 0));
          } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            commit(row);
          }
        }}
        className="min-h-tap w-full rounded border border-select-edge bg-surface px-3 py-1.5 text-base text-ink md:text-[0.875rem]"
      />
      {rowCount > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded border border-rule-strong bg-surface shadow-lg"
        >
          {shown.map((hit, index) => (
            <ThoughtOption
              key={hit.id}
              thought={hit}
              active={index === row}
              onPick={() => commit(index)}
            />
          ))}
          <li
            role="option"
            aria-selected={row === shown.length}
            onMouseDown={(event) => {
              event.preventDefault();
              commit(shown.length);
            }}
            className={`flex min-h-tap cursor-pointer items-center px-3 py-1.5 text-[0.875rem] ${
              row === shown.length ? "bg-select" : "hover:bg-surface-raised"
            }`}
          >
            <span className="truncate text-ink">
              Create <strong>“{query}”</strong> as a new {LABELS[relation]}
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}
