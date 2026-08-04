"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSessionAction,
  deleteExerciseAction,
  deleteSessionAction,
  replaceSessionAction,
} from "@/app/fitness/actions";
import { ConfirmDialog } from "@/components/detail/ConfirmDialog";
import { ErrorBanner, TabToolbar, ToolbarButton } from "@/components/tabs/tabChrome";
import { formatEquipmentBadge } from "@/lib/fitness/equipment";
import {
  fitnessExerciseEditPath,
  fitnessExerciseNewPath,
  fitnessExercisesPath,
  fitnessLogPath,
  fitnessSessionPath,
  fitnessSessionsPath,
} from "@/lib/fitness/routes";
import type {
  ExerciseSummary,
  SessionDetail,
  SessionInput,
  SessionSummary,
} from "@/lib/fitness/types";
import { ExerciseEditor } from "./ExerciseEditor";
import { SessionEditor } from "./SessionEditor";

type Mode = "sessions" | "exercises";

function formatWhen(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Fitness tab: session history + exercise catalog. View state is driven by the URL
 * so reload keeps you on sessions / exercises / log / open editor.
 */
export function FitnessView({
  mode,
  initialSessions,
  initialExercises,
  openLog,
  seedExerciseId,
  initialSessionDetail,
  openExerciseId,
}: {
  mode: Mode;
  initialSessions: SessionSummary[];
  initialExercises: ExerciseSummary[];
  openLog: boolean;
  seedExerciseId: string | null;
  initialSessionDetail: SessionDetail | null;
  /** null = closed; `"new"` or exercise id = open catalog editor */
  openExerciseId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const editorOpen = openLog || initialSessionDetail !== null;
  const editing = initialSessionDetail;
  const seed = initialSessionDetail ? null : seedExerciseId;
  const editorInstanceKey = initialSessionDetail
    ? initialSessionDetail.id
    : openLog
      ? `new-${seedExerciseId ?? "blank"}`
      : "closed";

  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const [pendingDeleteExercise, setPendingDeleteExercise] =
    useState<ExerciseSummary | null>(null);
  const [, startTransition] = useTransition();

  const sessions = initialSessions;
  const exercises = initialExercises;

  const exerciseEditorTarget: ExerciseSummary | null | "new" =
    openExerciseId === null
      ? null
      : openExerciseId === "new"
        ? "new"
        : (exercises.find((e) => e.id === openExerciseId) ?? null);

  const goSessions = useCallback(() => {
    router.push(fitnessSessionsPath());
  }, [router]);

  const goExercises = useCallback(() => {
    router.push(fitnessExercisesPath());
  }, [router]);

  const openNewLog = useCallback(
    (exerciseId: string | null = null) => {
      setError(null);
      router.push(fitnessLogPath(exerciseId));
    },
    [router],
  );

  const openExisting = useCallback(
    (sessionId: string) => {
      setError(null);
      router.push(fitnessSessionPath(sessionId));
    },
    [router],
  );

  const closeSessionEditor = useCallback(() => {
    router.push(fitnessSessionsPath());
  }, [router]);

  const openNewExercise = useCallback(() => {
    router.push(fitnessExerciseNewPath());
  }, [router]);

  const openEditExercise = useCallback(
    (exercise: ExerciseSummary) => {
      router.push(fitnessExerciseEditPath(exercise.id));
    },
    [router],
  );

  const closeExerciseEditor = useCallback(() => {
    router.push(fitnessExercisesPath());
  }, [router]);

  const handleCreate = useCallback(
    async (input: SessionInput) => {
      setError(null);
      const result = await createSessionAction(input);
      if (!result.ok) {
        setError(result.error);
        return { ok: false as const, error: result.error };
      }
      if (!result.id) {
        const message = "Session was created without an id.";
        setError(message);
        return { ok: false as const, error: message };
      }
      // Pin the URL to this session so reload keeps the open log.
      router.replace(fitnessSessionPath(result.id));
      router.refresh();
      return { ok: true as const, id: result.id };
    },
    [router],
  );

  const handleUpdate = useCallback(
    async (sessionId: string, input: SessionInput) => {
      setError(null);
      const result = await replaceSessionAction(sessionId, input);
      if (!result.ok) {
        setError(result.error);
        return { ok: false as const, error: result.error };
      }
      router.refresh();
      return { ok: true as const };
    },
    [router],
  );

  const handlePersisted = useCallback(
    (sessionId: string) => {
      // First autosave of a new log: move /fitness/log → /fitness/sessions/:id
      router.replace(fitnessSessionPath(sessionId));
    },
    [router],
  );

  function confirmDeleteSession() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    startTransition(async () => {
      const result = await deleteSessionAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing?.id === id) {
        router.push(fitnessSessionsPath());
      }
      router.refresh();
    });
  }

  function confirmDeleteExercise() {
    if (!pendingDeleteExercise) return;
    const id = pendingDeleteExercise.id;
    setPendingDeleteExercise(null);
    startTransition(async () => {
      const result = await deleteExerciseAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (openExerciseId === id) {
        router.push(fitnessExercisesPath());
      }
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabToolbar>
        <div className="flex items-center gap-1 rounded border border-rule p-0.5">
          <button
            type="button"
            onClick={goSessions}
            className={`rounded px-2.5 py-1 text-[0.8125rem] ${
              mode === "sessions" ? "bg-surface font-medium text-ink" : "text-ink-muted"
            }`}
          >
            Sessions
          </button>
          <button
            type="button"
            onClick={goExercises}
            className={`rounded px-2.5 py-1 text-[0.8125rem] ${
              mode === "exercises"
                ? "bg-surface font-medium text-ink"
                : "text-ink-muted"
            }`}
          >
            Exercises
          </button>
        </div>
        {mode === "exercises" ? (
          <ToolbarButton onClick={openNewExercise}>New exercise</ToolbarButton>
        ) : (
          <ToolbarButton onClick={() => openNewLog(null)}>Log session</ToolbarButton>
        )}
      </TabToolbar>

      {error && !editorOpen && <ErrorBanner message={error} />}

      <div className="min-h-0 flex-1 overflow-auto">
        {mode === "sessions" ? (
          sessions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              body="Log a workout with sets and reps. History lives here — not on outline tasks — so cancelling a plan never wipes what you lifted."
              actionLabel="Log first session"
              onAction={() => openNewLog(null)}
            />
          ) : (
            <ul className="divide-y divide-rule">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-shell/50"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openExisting(session.id)}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[0.875rem] font-medium text-ink">
                        {session.title || "Workout"}
                      </span>
                      <span className="font-mono text-[0.75rem] text-ink-faint">
                        {formatWhen(session.performedAt)}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {session.exerciseLabels.map((label) => (
                        <li
                          key={label}
                          className="font-mono text-[0.8125rem] text-ink-muted"
                        >
                          {label}
                        </li>
                      ))}
                    </ul>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(session)}
                    className="shrink-0 text-[0.75rem] text-ink-faint hover:text-priority-a"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : exercises.length === 0 ? (
          <EmptyState
            title="No exercises yet"
            body="Create an exercise and set equipment (barbell, dumbbell, club, mace, or bodyweight). Then pick it when you log a session."
            actionLabel="New exercise"
            onAction={openNewExercise}
          />
        ) : (
          <ul className="divide-y divide-rule">
            {exercises.map((ex) => (
              <li
                key={ex.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-shell/50"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openEditExercise(ex)}
                >
                  <div className="text-[0.875rem] font-medium text-ink">{ex.name}</div>
                  <div className="text-[0.75rem] text-ink-faint">
                    {formatEquipmentBadge(ex.equipment, ex.barWeight, ex.unilateral)}
                    {ex.notes ? ` · ${ex.notes}` : ""}
                  </div>
                </button>
                <ToolbarButton onClick={() => openNewLog(ex.id)}>Log</ToolbarButton>
                <button
                  type="button"
                  onClick={() => openEditExercise(ex)}
                  className="text-[0.75rem] text-ink-muted hover:text-ink"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteExercise(ex)}
                  className="text-[0.75rem] text-ink-faint hover:text-priority-a"
                  title="Only unused exercises can be deleted"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SessionEditor
        key={editorInstanceKey}
        open={editorOpen}
        onClose={closeSessionEditor}
        exercises={exercises}
        existing={editing}
        seedExerciseId={seed}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onPersisted={handlePersisted}
        onCatalogChange={() => router.refresh()}
      />

      <ExerciseEditor
        open={exerciseEditorTarget !== null || openExerciseId === "new"}
        exercise={
          exerciseEditorTarget === "new" || openExerciseId === "new"
            ? null
            : exerciseEditorTarget
        }
        onClose={closeExerciseEditor}
        onSaved={() => {
          router.push(fitnessExercisesPath());
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this session?"
        message="Only this log entry and its sets will be removed. The exercise catalog and other sessions stay."
        confirmLabel="Delete session"
        destructive
        onConfirm={confirmDeleteSession}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingDeleteExercise !== null}
        title="Delete this exercise?"
        message="Exercises with workout history cannot be deleted — rename them instead. Unused catalog entries can be removed."
        confirmLabel="Delete exercise"
        destructive
        onConfirm={confirmDeleteExercise}
        onCancel={() => setPendingDeleteExercise(null)}
      />
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-6 py-12">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="max-w-md text-[0.875rem] text-ink-muted">{body}</p>
      <ToolbarButton onClick={onAction}>{actionLabel}</ToolbarButton>
    </div>
  );
}
