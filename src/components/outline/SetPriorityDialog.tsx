"use client";

import { useId, useState } from "react";
import type { PriorityLetter } from "@/db/schema";
import { parsePriority } from "@/lib/tree/format";
import { ModalShell } from "@/components/detail/ModalShell";

/**
 * Give one priority to every selected row.
 *
 * The non-drag path to the same outcome, which `data-grid.md` requires ("never make drag the
 * only path to an outcome") and which is the only path at all below `md`, where drag is off.
 * It also answers the case drag cannot: a run of rows that carry no letter yet has nothing
 * to drag *against*, because a drop beside an unprioritized row assigns nothing.
 *
 * What you type is a request, not a value — the ranking engine answers it per sibling group,
 * and the block lands contiguously in outline order. See `setPriorityForNodes`.
 */
export function SetPriorityDialog({
  open,
  count,
  onApply,
  onCancel,
}: {
  open: boolean;
  /** Rows in the selection, for the heading — plural verbs act on what is selected. */
  count: number;
  onApply: (letter: PriorityLetter | null, rank: number | null) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const hintId = useId();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  // A fresh prompt each time it opens: the last thing typed is not a default worth keeping,
  // and a stale `A1` sitting in the box is one Enter away from re-ranking the wrong rows.
  // Adjusted during render rather than in an effect — the same idiom `LetterRankCell` uses
  // to follow a value that moved underneath it.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue("");
      setInvalid(false);
    }
  }

  function apply() {
    const parsed = parsePriority(value);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    onApply(parsed.letter, parsed.rank);
  }

  return (
    <ModalShell open={open} onClose={onCancel} labelledBy={titleId} width="max-w-md">
      <div className="p-5">
        <h2 id={titleId} className="text-[0.9375rem] font-semibold text-ink">
          Set priority on {count} {count === 1 ? "row" : "rows"}
        </h2>

        <p id={hintId} className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
          A letter puts them at the end of it; <strong>A1</strong> puts them at the top
          and pushes the rest down. Ranks follow outline order, and a rank past the end
          lands at the end. Leave it blank to clear the priority.
        </p>

        <input
          // Autofocus is right here: the dialog exists for one field, and reaching for the
          // mouse to click into it would cost more than the command saves.
          autoFocus
          value={value}
          onChange={(event) => {
            setInvalid(false);
            setValue(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
          aria-label="Priority"
          aria-describedby={hintId}
          aria-invalid={invalid}
          placeholder="A1"
          maxLength={3}
          className={[
            "mt-4 w-24 rounded border bg-surface px-2 py-1.5 text-center text-[0.9375rem] font-medium uppercase outline-none",
            invalid ? "border-priority-a text-priority-a" : "border-rule text-ink",
          ].join(" ")}
        />
        {invalid && (
          <p className="mt-1 text-[0.75rem] text-priority-a" role="alert">
            Must be A, B, C or D, optionally with a rank — like A1. Blank clears it.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-rule px-3 py-1.5 text-[0.8125rem] text-ink hover:bg-surface-raised"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded bg-select-edge px-3 py-1.5 text-[0.8125rem] text-white hover:brightness-95"
          >
            Set priority
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
