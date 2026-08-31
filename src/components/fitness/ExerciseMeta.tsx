"use client";

import { useEffect, useState } from "react";
import { loadLatestForExerciseAction } from "@/app/fitness/actions";
import { formatSetsLabel } from "@/lib/fitness/format";
import type { ExerciseHistoryEntry, WorkoutSetView } from "@/lib/fitness/types";

/**
 * The two per-exercise affordances that sit beside a block: the day's note for that lift,
 * and what it did last time. Both are facts about the exercise rather than about a set, so
 * in a group they live in the member strip above the rounds, not inside one.
 */
export function ExerciseNotes({
  value,
  onChange,
}: {
  value: string;
  onChange: (notes: string) => void;
}) {
  const [open, setOpen] = useState(value.trim() !== "");
  const snippet = value.trim().replace(/\s+/g, " ");
  const collapsedLabel = snippet.length > 48 ? `${snippet.slice(0, 47)}…` : snippet;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex max-w-full items-center gap-1.5 text-[0.75rem] text-ink-muted hover:text-ink"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>Notes</span>
        {!open && collapsedLabel ? (
          <span className="min-w-0 truncate font-normal text-ink-faint">
            {collapsedLabel}
          </span>
        ) : null}
      </button>
      {open ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder="Form, setup, how it felt…"
          className="mt-1 w-full rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink"
        />
      ) : null}
    </div>
  );
}

export function LastSessionHint({
  exerciseId,
  excludeSessionId,
  sessionTitle,
  onCopy,
}: {
  exerciseId: string;
  excludeSessionId: string | null;
  sessionTitle?: string | null;
  onCopy: (sets: WorkoutSetView[]) => void;
}) {
  const [fetched, setFetched] = useState<{
    exerciseId: string;
    excludeSessionId: string | null;
    sessionTitle: string | null;
    entry: ExerciseHistoryEntry | null;
  } | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    const exclude = excludeSessionId;
    const title = sessionTitle ?? null;
    void loadLatestForExerciseAction(exerciseId, exclude, title).then((result) => {
      if (cancelled || !result.ok) return;
      setFetched({
        exerciseId,
        excludeSessionId: exclude,
        sessionTitle: title,
        entry: (result.data as ExerciseHistoryEntry | null) ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseId, excludeSessionId, sessionTitle]);

  const latest =
    fetched &&
    fetched.exerciseId === exerciseId &&
    fetched.excludeSessionId === excludeSessionId &&
    fetched.sessionTitle === (sessionTitle ?? null)
      ? fetched.entry
      : null;

  if (!latest || latest.sets.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => onCopy(latest.sets)}
      title="Copy last session’s sets"
      className="font-mono text-[0.75rem] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
    >
      Last time: {formatSetsLabel(latest.sets)} · tap to copy
    </button>
  );
}
