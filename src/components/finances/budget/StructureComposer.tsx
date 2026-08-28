"use client";

import { useRef, useState, useTransition } from "react";

import {
  createBudgetCategoryAction,
  createCategoryGroupAction,
} from "@/app/finances/actions";
import type { EnvelopeKind } from "@/db/schema";

/** What one press of `+` is about to create, and where. */
export type ComposerTarget = {
  /** `group` creates a category group; anything else creates an envelope of that `kind`. */
  what: "envelope" | "group";
  /** The section this lands in — an envelope's kind, or the new group's own. */
  kind: EnvelopeKind;
  /** The group it goes inside, or the section root. */
  groupId: string | null;
  /** That group's name, for the label — the user has to be able to see where this lands. */
  groupName: string | null;
  /** The target group's nesting depth, so the strip lines up with the rows it will join. */
  depth: number;
};

const KIND_NOUNS: Record<EnvelopeKind, string> = {
  income: "income envelope",
  spending: "envelope",
  bill: "bill",
  savings: "savings envelope",
};

function composerNoun(target: ComposerTarget): string {
  return target.what === "group" ? "group" : KIND_NOUNS[target.kind];
}

/**
 * The one-line create strip under a budget section's grid.
 *
 * **Not a draft row inside the grid**, which is where Actual and YNAB put it. Our budget
 * tables are real `DataGrid`s with live sort, filter, grouping and collapse, so a draft row
 * would be reordered out from under the cursor the moment it had a name — the failure
 * `components/ux-principles.md` names as "do not move the world while the user is still
 * typing". The gesture is preserved; only the input's position differs. See
 * `agent-os/specs/2026-08-28-1527-inline-budget-structure/` D4.
 *
 * **Enter creates and stays open**, cleared and refocused, because envelopes are made in
 * runs — five at a time when a section is first laid out — and a strip that closed after
 * each one would cost a click per envelope. Escape closes it.
 *
 * The host keys this on its target, so pressing `+` on a different group remounts the strip
 * with an empty, focused input rather than leaving the old text behind.
 */
export function StructureComposer({
  target,
  onCreated,
  onClose,
}: {
  target: ComposerTarget;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const noun = composerNoun(target);
  const label = target.groupName ? `New ${noun} in ${target.groupName}` : `New ${noun}`;

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    setError(null);
    startTransition(async () => {
      const result =
        target.what === "group"
          ? await createCategoryGroupAction(trimmed, target.kind, target.groupId)
          : await createBudgetCategoryAction(target.groupId, trimmed, target.kind);
      if (!result.ok) {
        setError(result.error ?? "Could not create it.");
        return;
      }
      setName("");
      onCreated();
      inputRef.current?.focus();
    });
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2 text-[0.8125rem]"
      style={{ paddingLeft: `calc(0.75rem + ${target.depth * 0.75}rem)` }}
    >
      <label className="shrink-0 text-ink-muted" htmlFor="budget-composer">
        {label}
      </label>
      <input
        id="budget-composer"
        ref={inputRef}
        autoFocus
        value={name}
        disabled={pending}
        placeholder="Name"
        className="min-w-0 flex-1 rounded border border-rule bg-surface px-2 py-1 text-ink"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      />
      <button
        type="button"
        disabled={pending || name.trim() === ""}
        onClick={submit}
        className="shrink-0 rounded border border-rule px-2 py-1 text-ink hover:bg-surface-raised disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded border border-rule px-2 py-1 text-ink-muted hover:bg-surface-raised"
      >
        Done
      </button>
      {error ? (
        <p role="alert" className="w-full text-[var(--chart-spend)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
