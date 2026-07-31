"use client";

import { useState } from "react";
import type { PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import { formatPriority, parsePriority } from "@/lib/tree/format";

/**
 * The **TC Priority** cell — the Task Chooser's own flat ranking, edited by typing.
 *
 * Deliberately not `PriorityCell`. That one stores what you type verbatim, including a
 * bare "A". Here a letter always resolves to a position, so what you type is a *request*
 * that the ranking rules answer: "A" lands at the end of A, "A2" inserts at position 2 and
 * pushes the rest down, and the cell then shows the rank you actually got. Clearing it
 * drops the item out of the ranking entirely.
 *
 * The placement rules live in `src/lib/chooser/tcPriority.ts`; this only collects input.
 */

const PRIORITY_COLOR: Record<PriorityLetter, string> = {
  A: "text-priority-a",
  B: "text-priority-b",
  C: "text-priority-c",
  D: "text-priority-d",
};

export function TcPriorityCell({
  node,
  onAssign,
}: {
  node: OutlineNode;
  /** `letter === null` clears the ranking; `rank === null` means "end of that letter". */
  onAssign: (letter: PriorityLetter | null, rank: number | null) => void;
}) {
  const current = formatPriority(node.tcPriorityLetter, node.tcPriorityRank);
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);

  // The stored value moves under us whenever a drag renumbers the letter, so the input
  // follows it unless the user is mid-edit.
  const [lastSeen, setLastSeen] = useState(current);
  if (current !== lastSeen) {
    setLastSeen(current);
    setValue(current);
  }

  function commit() {
    const parsed = parsePriority(value);

    if (!parsed) {
      setInvalid(true);
      setValue(current);
      return;
    }

    setInvalid(false);
    if (parsed.letter === node.tcPriorityLetter && parsed.rank === null) {
      // "A" typed over an existing A means "leave it where it is", not "send it to the
      // bottom of A" — retyping the letter you can already see should be a no-op.
      setValue(current);
      return;
    }
    onAssign(parsed.letter, parsed.rank);
  }

  return (
    <input
      value={value}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        setInvalid(false);
        setValue(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(current);
          setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      aria-label="Task Chooser priority — A, B, C or D, with an optional position"
      aria-invalid={invalid}
      placeholder="—"
      maxLength={3}
      className={[
        "tabular w-full border-none bg-transparent text-center text-[0.8125rem] font-medium uppercase outline-none placeholder:text-ink-faint/50",
        invalid
          ? "text-priority-a"
          : node.tcPriorityLetter
            ? PRIORITY_COLOR[node.tcPriorityLetter]
            : "text-ink-faint",
      ].join(" ")}
    />
  );
}
