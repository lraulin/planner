"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/detail/Drawer";
import { useAutosave, type SaveStatus } from "@/components/notes/useAutosave";
import {
  draftToSessionInput,
  emptySet,
  setFromPrevious,
  type DraftExercise,
  type DraftSet,
  type SessionDraft,
} from "@/lib/fitness/sessionDraft";
import type { ExerciseSummary, SessionDetail, SessionInput } from "@/lib/fitness/types";

function draftFromDetail(detail: SessionDetail): SessionDraft {
  return {
    performedAt: toLocalInput(detail.performedAt),
    title: detail.title,
    notes: detail.notes,
    durationMinutes:
      detail.durationMinutes == null ? "" : String(detail.durationMinutes),
    exercises: detail.exercises.map((ex) => ({
      key: ex.id,
      exerciseId: ex.exerciseId,
      exerciseName: ex.exerciseName,
      sets: ex.sets.map((s) => ({
        reps: s.reps == null ? "" : String(s.reps),
        weight: s.weight == null ? "" : String(s.weight),
        unit: s.unit || "lb",
      })),
    })),
  };
}

function toLocalInput(date: Date): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newExerciseBlock(
  exerciseId = "",
  exerciseName = "",
  unit = "lb",
): DraftExercise {
  return {
    key: crypto.randomUUID(),
    exerciseId,
    exerciseName,
    // One empty row to start — "Add set" copies the previous numbers.
    sets: [emptySet(unit)],
  };
}

/**
 * Strength session drawer. Autosaves like notes: there is no Save button to gate
 * entry between sets. First valid draft creates the session; later edits replace.
 * Closing flushes any pending debounce.
 */
export function SessionEditor({
  open,
  onClose,
  exercises,
  existing,
  seedExerciseId,
  onCreate,
  onUpdate,
  onPersisted,
}: {
  open: boolean;
  onClose: () => void;
  exercises: ExerciseSummary[];
  existing: SessionDetail | null;
  seedExerciseId: string | null;
  onCreate: (
    input: SessionInput,
  ) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onUpdate: (
    sessionId: string,
    input: SessionInput,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Fired after first create so the parent can track the open session id. */
  onPersisted?: (sessionId: string) => void;
}) {
  const seedName = useMemo(() => {
    if (!seedExerciseId) return "";
    return exercises.find((e) => e.id === seedExerciseId)?.name ?? "";
  }, [exercises, seedExerciseId]);

  const initial = useMemo(() => {
    if (existing) return draftFromDetail(existing);
    const seeded = seedExerciseId
      ? [newExerciseBlock(seedExerciseId, seedName)]
      : [newExerciseBlock()];
    return {
      performedAt: toLocalInput(new Date()),
      title: "",
      notes: "",
      durationMinutes: "",
      exercises: seeded,
    } satisfies SessionDraft;
    // Parent remounts via key when session/seed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, seedExerciseId, open]);

  const [performedAt, setPerformedAt] = useState(initial.performedAt);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [blocks, setBlocks] = useState(initial.exercises);
  /** Session id once created or when editing an existing row. */
  const sessionIdRef = useRef<string | null>(existing?.id ?? null);
  const [sessionId, setSessionId] = useState<string | null>(existing?.id ?? null);

  const catalog = useMemo(
    () => exercises.map((e) => ({ id: e.id, name: e.name })),
    [exercises],
  );

  const buildDraft = useCallback((): SessionDraft => {
    return { performedAt, title, notes, durationMinutes, exercises: blocks };
  }, [performedAt, title, notes, durationMinutes, blocks]);

  const save = useCallback(
    async (draft: SessionDraft) => {
      const input = draftToSessionInput(draft, catalog);
      if (!input) {
        // Nothing durable yet — stay idle, don't surface an error.
        return { ok: true as const };
      }

      const id = sessionIdRef.current;
      if (id) {
        const result = await onUpdate(id, input);
        return result.ok
          ? { ok: true as const }
          : { ok: false as const, error: result.error };
      }

      const result = await onCreate(input);
      if (!result.ok) return { ok: false as const, error: result.error };

      sessionIdRef.current = result.id;
      setSessionId(result.id);
      onPersisted?.(result.id);
      return { ok: true as const };
    },
    [catalog, onCreate, onUpdate, onPersisted],
  );

  const { status, schedule, flush, retry } = useAutosave(save);

  const queueSave = useCallback(
    (next: SessionDraft) => {
      // Only schedule when there is something to write, or when a session already
      // exists (so clearing sets eventually fails validation rather than lying about
      // "saved" on a no-op — draftToSessionInput null short-circuits as ok:true only
      // before first create).
      if (sessionIdRef.current || draftToSessionInput(next, catalog)) {
        schedule(next);
      }
    },
    [catalog, schedule],
  );

  function patchMeta(partial: Partial<SessionDraft>) {
    if (partial.performedAt !== undefined) setPerformedAt(partial.performedAt);
    if (partial.title !== undefined) setTitle(partial.title);
    if (partial.notes !== undefined) setNotes(partial.notes);
    if (partial.durationMinutes !== undefined) {
      setDurationMinutes(partial.durationMinutes);
    }
    const next: SessionDraft = {
      performedAt:
        partial.performedAt !== undefined ? partial.performedAt : performedAt,
      title: partial.title !== undefined ? partial.title : title,
      notes: partial.notes !== undefined ? partial.notes : notes,
      durationMinutes:
        partial.durationMinutes !== undefined
          ? partial.durationMinutes
          : durationMinutes,
      exercises: blocks,
    };
    queueSave(next);
  }

  function setBlocksAndSave(
    updater: DraftExercise[] | ((current: DraftExercise[]) => DraftExercise[]),
  ) {
    setBlocks((current) => {
      const nextBlocks = typeof updater === "function" ? updater(current) : updater;
      queueSave({
        performedAt,
        title,
        notes,
        durationMinutes,
        exercises: nextBlocks,
      });
      return nextBlocks;
    });
  }

  function updateBlock(index: number, patch: Partial<DraftExercise>) {
    setBlocksAndSave((current) =>
      current.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );
  }

  function updateSet(blockIndex: number, setIndex: number, patch: Partial<DraftSet>) {
    setBlocksAndSave((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        return {
          ...b,
          sets: b.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)),
        };
      }),
    );
  }

  function removeSet(blockIndex: number, setIndex: number) {
    setBlocksAndSave((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        const nextSets = b.sets.filter((_, j) => j !== setIndex);
        // Keep one empty row so the table never disappears mid-workout.
        return {
          ...b,
          sets: nextSets.length > 0 ? nextSets : [emptySet(b.sets[0]?.unit ?? "lb")],
        };
      }),
    );
  }

  function addSet(blockIndex: number) {
    setBlocksAndSave((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        const last = b.sets[b.sets.length - 1];
        return { ...b, sets: [...b.sets, setFromPrevious(last)] };
      }),
    );
  }

  const closeAfterFlush = useCallback(() => {
    void flush();
    onClose();
  }, [flush, onClose]);

  return (
    <Drawer open={open} onClose={closeAfterFlush} labelledBy="session-editor-title">
      <div className="flex h-full flex-col">
        <header className="flex flex-none items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <div className="min-w-0">
            <h2 id="session-editor-title" className="text-sm font-semibold text-ink">
              {sessionId ? "Session" : "Log session"}
            </h2>
            <SaveLine
              status={status}
              persisted={sessionId !== null}
              onRetry={() => retry(buildDraft())}
            />
          </div>
          <button
            type="button"
            onClick={closeAfterFlush}
            className="rounded bg-ink px-3 py-1 text-[0.8125rem] font-medium text-surface"
          >
            Done
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              When
              <input
                type="datetime-local"
                value={performedAt}
                onChange={(e) => patchMeta({ performedAt: e.target.value })}
                className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              Duration (min)
              <input
                type="number"
                min={0}
                value={durationMinutes}
                onChange={(e) => patchMeta({ durationMinutes: e.target.value })}
                className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Title
            <input
              type="text"
              value={title}
              placeholder="Push, Upper, …"
              onChange={(e) => patchMeta({ title: e.target.value })}
              className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
            />
          </label>

          {blocks.map((block, bi) => (
            <div key={block.key} className="rounded border border-rule bg-shell/40 p-3">
              <div className="mb-2 flex items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Exercise
                  <input
                    list="fitness-exercise-catalog"
                    value={block.exerciseName}
                    onChange={(e) => {
                      const name = e.target.value;
                      const match = exercises.find(
                        (ex) => ex.name.toLowerCase() === name.toLowerCase(),
                      );
                      updateBlock(bi, {
                        exerciseName: name,
                        exerciseId: match?.id ?? "",
                      });
                    }}
                    placeholder="Bench Press"
                    className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
                  />
                </label>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBlocksAndSave((c) => c.filter((_, i) => i !== bi))
                    }
                    className="pb-1.5 text-[0.75rem] text-ink-faint hover:text-priority-a"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <div className="grid grid-cols-[2rem_1fr_1fr_4rem_2rem] gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
                  <span>#</span>
                  <span>Reps</span>
                  <span>Weight</span>
                  <span>Unit</span>
                  <span />
                </div>
                {block.sets.map((set, si) => (
                  <div
                    key={si}
                    className="grid grid-cols-[2rem_1fr_1fr_4rem_2rem] items-center gap-1"
                  >
                    <span className="font-mono text-[0.75rem] text-ink-faint">
                      {si + 1}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={set.reps}
                      onChange={(e) => updateSet(bi, si, { reps: e.target.value })}
                      className="rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.8125rem] text-ink"
                    />
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={set.weight}
                      onChange={(e) => updateSet(bi, si, { weight: e.target.value })}
                      className="rounded border border-rule bg-surface px-2 py-1 font-mono text-[0.8125rem] text-ink"
                    />
                    <select
                      value={set.unit}
                      onChange={(e) => updateSet(bi, si, { unit: e.target.value })}
                      className="rounded border border-rule bg-surface px-1 py-1 text-[0.75rem] text-ink"
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeSet(bi, si)}
                      title="Delete set"
                      aria-label={`Delete set ${si + 1}`}
                      className="flex h-7 w-7 items-center justify-center rounded text-ink-faint hover:bg-priority-a/10 hover:text-priority-a"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(bi)}
                className="mt-2 text-[0.75rem] text-ink-muted hover:text-ink"
              >
                + Add set
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setBlocksAndSave((c) => [...c, newExerciseBlock()])}
            className="text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            + Add exercise
          </button>

          <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Notes
            <textarea
              value={notes}
              onChange={(e) => patchMeta({ notes: e.target.value })}
              rows={3}
              className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
            />
          </label>

          <datalist id="fitness-exercise-catalog">
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.name} />
            ))}
          </datalist>
        </div>
      </div>
    </Drawer>
  );
}

function SaveLine({
  status,
  persisted,
  onRetry,
}: {
  status: SaveStatus;
  persisted: boolean;
  onRetry: () => void;
}) {
  if (status.state === "saving") {
    return <p className="mt-0.5 text-[0.6875rem] text-ink-faint">Saving…</p>;
  }
  if (status.state === "error") {
    return (
      <p className="mt-0.5 text-[0.6875rem] text-priority-a">
        {status.message}{" "}
        <button
          type="button"
          onClick={onRetry}
          className="underline hover:no-underline"
        >
          Retry
        </button>
      </p>
    );
  }
  if (status.state === "saved" || persisted) {
    return (
      <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
        {status.state === "saved" ? "Saved" : "Autosaves as you log"}
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
      Autosaves once you enter a set
    </p>
  );
}
