"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  listExercisesAction,
  loadLatestForExerciseAction,
} from "@/app/fitness/actions";
import { formatSetsLabel } from "@/lib/fitness/format";
import type { ExerciseHistoryEntry, ExerciseSummary } from "@/lib/fitness/types";
import { FieldGrid, Section } from "@/components/detail/fields";

/**
 * Task form strip: link this plan task to a catalog exercise, show last logged sets,
 * deep-link into Fitness to log more. History never lives on the task.
 */
export function TaskFitnessPanel({
  exerciseId,
  onChange,
}: {
  exerciseId: string | null | undefined;
  onChange: (exerciseId: string | null) => void;
}) {
  const [catalog, setCatalog] = useState<ExerciseSummary[]>([]);
  const [latestById, setLatestById] = useState<
    Record<string, ExerciseHistoryEntry | null>
  >({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await listExercisesAction();
      if (cancelled || !result.ok || !Array.isArray(result.data)) return;
      setCatalog(result.data as ExerciseSummary[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!exerciseId) return;
    if (Object.prototype.hasOwnProperty.call(latestById, exerciseId)) return;

    let cancelled = false;
    startTransition(async () => {
      const result = await loadLatestForExerciseAction(exerciseId);
      if (cancelled || !result.ok) return;
      setLatestById((current) => ({
        ...current,
        [exerciseId]: (result.data as ExerciseHistoryEntry | null) ?? null,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseId, latestById]);

  const latest = exerciseId ? (latestById[exerciseId] ?? null) : null;

  return (
    <Section title="Fitness">
      <FieldGrid>
        <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted sm:col-span-2">
          Linked exercise
          <select
            value={exerciseId ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
            className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal outline-none focus:border-select-edge"
          >
            <option value="">(none — plan only)</option>
            {catalog.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
          <span className="text-[0.75rem] font-normal normal-case tracking-normal text-ink-faint">
            Links this task as a reminder. Cancelling or deleting the task does not
            erase workout history.
          </span>
        </label>
      </FieldGrid>

      {exerciseId && (
        <div className="mt-3 rounded border border-rule bg-shell/40 px-3 py-2">
          {latest ? (
            <>
              <div className="text-[0.75rem] text-ink-faint">Last logged</div>
              <div className="font-mono text-[0.8125rem] text-ink">
                {new Date(latest.performedAt).toLocaleDateString()} ·{" "}
                {formatSetsLabel(latest.sets)}
              </div>
            </>
          ) : (
            <div className="text-[0.8125rem] text-ink-muted">
              No sessions logged yet.
            </div>
          )}
          <Link
            href={`/fitness?log=1&exercise=${exerciseId}`}
            className="mt-2 inline-block text-[0.8125rem] font-medium text-ink underline-offset-2 hover:underline"
          >
            Log workout →
          </Link>
        </div>
      )}
    </Section>
  );
}
