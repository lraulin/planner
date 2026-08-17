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
import { ExercisePicker } from "@/components/fitness/ExercisePicker";
import { useDateFormatter } from "@/components/settings/SettingsProvider";
import { formatFullDateKey } from "@/lib/dateFormat";
import { localDateKey } from "@/lib/schedule/geometry";

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
  const formatDate = useDateFormatter();
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
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Linked exercise
          </span>
          <ExercisePicker
            catalog={catalog}
            value={exerciseId ?? ""}
            onChange={(id) => onChange(id === "" ? null : id)}
            allowEmpty
            emptyLabel="(none — plan only)"
          />
          <span className="text-[0.75rem] font-normal normal-case tracking-normal text-ink-faint">
            Links this task as a reminder. Cancelling or deleting the task does not
            erase workout history.
          </span>
        </div>
      </FieldGrid>

      {exerciseId && (
        <div className="mt-3 rounded border border-rule bg-shell/40 px-3 py-2">
          {latest ? (
            <>
              <div className="text-[0.75rem] text-ink-faint">Last logged</div>
              <div
                title={formatFullDateKey(localDateKey(new Date(latest.performedAt)))}
                className="truncate font-mono text-[0.8125rem] text-ink"
              >
                {formatDate(localDateKey(new Date(latest.performedAt)))} ·{" "}
                {formatSetsLabel(latest.sets)}
              </div>
            </>
          ) : (
            <div className="text-[0.8125rem] text-ink-muted">
              No sessions logged yet.
            </div>
          )}
          <Link
            href={`/fitness/log?exercise=${exerciseId}`}
            className="mt-2 inline-block text-[0.8125rem] font-medium text-ink underline-offset-2 hover:underline"
          >
            Log workout →
          </Link>
        </div>
      )}
    </Section>
  );
}
