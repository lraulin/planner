"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/detail/Drawer";
import type { ExerciseSummary, SessionDetail, SessionInput } from "@/lib/fitness/types";

type DraftSet = { reps: string; weight: string; unit: string };
type DraftExercise = {
  key: string;
  exerciseId: string;
  exerciseName: string;
  sets: DraftSet[];
};

function emptySet(unit = "lb"): DraftSet {
  return { reps: "", weight: "", unit };
}

function draftFromDetail(detail: SessionDetail): {
  performedAt: string;
  title: string;
  notes: string;
  durationMinutes: string;
  exercises: DraftExercise[];
} {
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

function parseLocalInput(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

/**
 * Fast log / edit drawer for a multi-exercise strength session.
 * Parent owns open state and save/delete; this holds only the draft.
 */
export function SessionEditor({
  open,
  onClose,
  exercises,
  existing,
  seedExerciseId,
  onSave,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  exercises: ExerciseSummary[];
  existing: SessionDetail | null;
  seedExerciseId: string | null;
  onSave: (input: SessionInput) => void;
  busy: boolean;
  error: string | null;
}) {
  const seedName = useMemo(() => {
    if (!seedExerciseId) return "";
    return exercises.find((e) => e.id === seedExerciseId)?.name ?? "";
  }, [exercises, seedExerciseId]);

  const initial = useMemo(() => {
    if (existing) return draftFromDetail(existing);
    const seeded: DraftExercise[] = seedExerciseId
      ? [
          {
            key: crypto.randomUUID(),
            exerciseId: seedExerciseId,
            exerciseName: seedName,
            sets: [emptySet(), emptySet(), emptySet()],
          },
        ]
      : [
          {
            key: crypto.randomUUID(),
            exerciseId: "",
            exerciseName: "",
            sets: [emptySet(), emptySet(), emptySet()],
          },
        ];
    return {
      performedAt: toLocalInput(new Date()),
      title: "",
      notes: "",
      durationMinutes: "",
      exercises: seeded,
    };
    // Re-init when opening a different session or seed — parent remounts via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, seedExerciseId, open]);

  // Parent remounts this component with a `key` when session/seed changes, so local
  // state is initialised once from props — no sync effect needed.
  const [performedAt, setPerformedAt] = useState(initial.performedAt);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [blocks, setBlocks] = useState(initial.exercises);

  function updateBlock(index: number, patch: Partial<DraftExercise>) {
    setBlocks((current) =>
      current.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    );
  }

  function updateSet(blockIndex: number, setIndex: number, patch: Partial<DraftSet>) {
    setBlocks((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        return {
          ...b,
          sets: b.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)),
        };
      }),
    );
  }

  function handleSave() {
    const input: SessionInput = {
      performedAt: parseLocalInput(performedAt),
      title,
      notes,
      durationMinutes: durationMinutes.trim() === "" ? null : Number(durationMinutes),
      exercises: blocks.map((b) => {
        const known = exercises.find(
          (e) => e.id === b.exerciseId || e.name === b.exerciseName.trim(),
        );
        return {
          exerciseId: known?.id || b.exerciseId || undefined,
          exerciseName: b.exerciseName.trim() || known?.name,
          sets: b.sets
            .filter((s) => s.reps.trim() !== "" || s.weight.trim() !== "")
            .map((s) => ({
              reps: s.reps.trim() === "" ? null : Number(s.reps),
              weight: s.weight.trim() === "" ? null : Number(s.weight),
              unit: s.unit || "lb",
            })),
        };
      }),
    };
    onSave(input);
  }

  return (
    <Drawer open={open} onClose={onClose} labelledBy="session-editor-title">
      <div className="flex h-full flex-col">
        <header className="flex flex-none items-center justify-between border-b border-rule px-4 py-3">
          <h2 id="session-editor-title" className="text-sm font-semibold text-ink">
            {existing ? "Edit session" : "Log session"}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-rule px-3 py-1 text-[0.8125rem] text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="rounded bg-ink px-3 py-1 text-[0.8125rem] font-medium text-surface disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && (
            <p className="rounded border border-priority-a/40 bg-priority-a/10 px-3 py-2 text-[0.8125rem] text-priority-a">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              When
              <input
                type="datetime-local"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
                className="rounded border border-rule bg-surface px-2 py-1.5 text-[0.875rem] text-ink normal-case tracking-normal"
              />
            </label>
            <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
              Duration (min)
              <input
                type="number"
                min={0}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
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
              onChange={(e) => setTitle(e.target.value)}
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
                    onClick={() => setBlocks((c) => c.filter((_, i) => i !== bi))}
                    className="pb-1.5 text-[0.75rem] text-ink-faint hover:text-priority-a"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="space-y-1">
                <div className="grid grid-cols-[2rem_1fr_1fr_4rem] gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
                  <span>#</span>
                  <span>Reps</span>
                  <span>Weight</span>
                  <span>Unit</span>
                </div>
                {block.sets.map((set, si) => (
                  <div
                    key={si}
                    className="grid grid-cols-[2rem_1fr_1fr_4rem] items-center gap-1"
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
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  updateBlock(bi, {
                    sets: [...block.sets, emptySet(block.sets[0]?.unit ?? "lb")],
                  })
                }
                className="mt-2 text-[0.75rem] text-ink-muted hover:text-ink"
              >
                + Add set
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setBlocks((c) => [
                ...c,
                {
                  key: crypto.randomUUID(),
                  exerciseId: "",
                  exerciseName: "",
                  sets: [emptySet(), emptySet(), emptySet()],
                },
              ])
            }
            className="text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            + Add exercise
          </button>

          <label className="flex flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
