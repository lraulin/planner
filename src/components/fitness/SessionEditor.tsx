"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLatestForExerciseAction } from "@/app/fitness/actions";
import { Drawer } from "@/components/detail/Drawer";
import { useAutosave, type SaveStatus } from "@/components/notes/useAutosave";
import {
  elapsedSince,
  formatDurationClock,
  parseDurationSeconds,
} from "@/lib/fitness/duration";
import { formatEquipmentBadge, usesPlateCalculator } from "@/lib/fitness/equipment";
import { formatSetsLabel, parseWeight } from "@/lib/fitness/format";
import { formatMeasureTag } from "@/lib/fitness/measure";
import { plateHint } from "@/lib/fitness/plates";
import { gridTemplate, setColumns, type SetColumn } from "@/lib/fitness/setColumns";
import {
  draftBlockFromCatalog,
  draftToSessionInput,
  emptyDraftBlock,
  emptySetForExercise,
  setFromPrevious,
  setsFromHistory,
  type DraftExercise,
  type DraftSet,
  type SessionDraft,
} from "@/lib/fitness/sessionDraft";
import type {
  ExerciseHistoryEntry,
  ExerciseSummary,
  SessionDetail,
  SessionInput,
  WorkoutSetView,
} from "@/lib/fitness/types";
import { bumpWeight, weightStep } from "@/lib/fitness/weightStep";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExercisePicker } from "./ExercisePicker";
import { HoldTimer } from "./HoldTimer";
import { RestTimer } from "./RestTimer";

function draftFromDetail(
  detail: SessionDetail,
  catalog: ExerciseSummary[],
): SessionDraft {
  return {
    performedAt: toLocalInput(detail.performedAt),
    title: detail.title,
    notes: detail.notes,
    durationMinutes:
      detail.durationMinutes == null ? "" : String(detail.durationMinutes),
    exercises: detail.exercises.map((ex) => {
      const cat = catalog.find((c) => c.id === ex.exerciseId);
      const equipment = cat?.equipment ?? ex.equipment;
      const measure = cat?.measure ?? ex.measure;
      const unilateral = cat?.unilateral ?? ex.unilateral;
      const barWeight = cat?.barWeight ?? ex.barWeight;
      return {
        key: ex.id,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        equipment,
        measure,
        barWeight,
        unilateral,
        notes: ex.notes,
        sets: ex.sets.map((s) => ({
          reps: s.reps == null ? "" : String(s.reps),
          repsLeft: s.repsLeft == null ? "" : String(s.repsLeft),
          repsRight: s.repsRight == null ? "" : String(s.repsRight),
          duration: s.durationSeconds == null ? "" : String(s.durationSeconds),
          weight: s.weight == null ? "" : String(s.weight),
          unit:
            equipment === "bodyweight" ? "bw" : s.unit === "bw" ? "lb" : s.unit || "lb",
        })),
      };
    }),
  };
}

type RunningHold = { blockKey: string; setIndex: number; startedAt: number };

/**
 * Wall-clock reads for the hold stopwatch, outside any component so React's purity rule
 * is satisfied — a clock read during render is exactly what that rule is guarding.
 */
function beginHold(blockKey: string, setIndex: number): RunningHold {
  return { blockKey, setIndex, startedAt: Date.now() };
}

function secondsHeld(hold: RunningHold): number {
  return elapsedSince(hold.startedAt, Date.now());
}

function toLocalInput(date: Date): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Strength session drawer. Select catalog exercises (configure elsewhere);
 * set grid adapts to equipment + unilateral. Autosaves like notes.
 */
export function SessionEditor({
  open,
  onClose,
  exercises: catalogProp,
  existing,
  seedExerciseId,
  onCreate,
  onUpdate,
  onPersisted,
  onCatalogChange,
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
  onPersisted?: (sessionId: string) => void;
  /** Refresh parent list when an exercise is created/edited from here. */
  onCatalogChange?: () => void;
}) {
  /** Local adds/edits from ExerciseEditor until parent refreshes. */
  const [catalogOverlay, setCatalogOverlay] = useState<ExerciseSummary[]>([]);
  const catalog = useMemo(() => {
    const byId = new Map(catalogProp.map((e) => [e.id, e]));
    for (const e of catalogOverlay) byId.set(e.id, e);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogProp, catalogOverlay]);

  const initial = useMemo(() => {
    if (existing) return draftFromDetail(existing, catalogProp);
    const seed = seedExerciseId
      ? catalogProp.find((e) => e.id === seedExerciseId)
      : null;
    return {
      performedAt: toLocalInput(new Date()),
      title: "",
      notes: "",
      durationMinutes: "",
      exercises: [seed ? draftBlockFromCatalog(seed) : emptyDraftBlock()],
    } satisfies SessionDraft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, seedExerciseId, open]);

  const [performedAt, setPerformedAt] = useState(initial.performedAt);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [blocks, setBlocks] = useState(initial.exercises);
  const sessionIdRef = useRef<string | null>(existing?.id ?? null);
  const [sessionId, setSessionId] = useState<string | null>(existing?.id ?? null);
  const [exerciseEditor, setExerciseEditor] = useState<{
    exercise: ExerciseSummary | null;
    blockIndex: number;
    seedName?: string;
  } | null>(null);

  /**
   * The one running hold stopwatch, by block key and set index. Holding it here rather
   * than inside the row is what keeps a second start from leaving the first counting,
   * and what lets closing the drawer end it.
   */
  const [runningHold, setRunningHold] = useState<RunningHold | null>(null);

  const idCatalog = useMemo(
    () => catalog.map((e) => ({ id: e.id, name: e.name })),
    [catalog],
  );

  const buildDraft = useCallback((): SessionDraft => {
    return { performedAt, title, notes, durationMinutes, exercises: blocks };
  }, [performedAt, title, notes, durationMinutes, blocks]);

  const save = useCallback(
    async (draft: SessionDraft) => {
      const input = draftToSessionInput(draft, idCatalog);
      if (!input) return { ok: true as const };

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
    [idCatalog, onCreate, onUpdate, onPersisted],
  );

  const { status, schedule, flush, retry } = useAutosave(save);

  const queueSave = useCallback(
    (next: SessionDraft) => {
      if (sessionIdRef.current || draftToSessionInput(next, idCatalog)) {
        schedule(next);
      }
    },
    [idCatalog, schedule],
  );

  function patchMeta(partial: Partial<SessionDraft>) {
    if (partial.performedAt !== undefined) setPerformedAt(partial.performedAt);
    if (partial.title !== undefined) setTitle(partial.title);
    if (partial.notes !== undefined) setNotes(partial.notes);
    if (partial.durationMinutes !== undefined) {
      setDurationMinutes(partial.durationMinutes);
    }
    queueSave({
      performedAt:
        partial.performedAt !== undefined ? partial.performedAt : performedAt,
      title: partial.title !== undefined ? partial.title : title,
      notes: partial.notes !== undefined ? partial.notes : notes,
      durationMinutes:
        partial.durationMinutes !== undefined
          ? partial.durationMinutes
          : durationMinutes,
      exercises: blocks,
    });
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

  function selectExercise(blockIndex: number, exerciseId: string) {
    if (!exerciseId) {
      setBlocksAndSave((current) =>
        current.map((b, i) => (i === blockIndex ? emptyDraftBlock() : b)),
      );
      return;
    }
    const ex = catalog.find((e) => e.id === exerciseId);
    if (!ex) return;
    setBlocksAndSave((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        return {
          ...draftBlockFromCatalog(ex, b.key),
          sets:
            b.sets.length > 0 &&
            b.sets.some((s) => s.reps || s.weight || s.repsLeft || s.duration)
              ? // Keep filled sets when switching? safer reset to empty for equipment change
                [emptySetForExercise(ex)]
              : [emptySetForExercise(ex)],
        };
      }),
    );
  }

  function commitHold(hold: RunningHold) {
    const seconds = secondsHeld(hold);
    if (seconds <= 0) return;
    setBlocksAndSave((current) =>
      current.map((b) =>
        b.key === hold.blockKey
          ? {
              ...b,
              sets: b.sets.map((s, j) =>
                j === hold.setIndex ? { ...s, duration: String(seconds) } : s,
              ),
            }
          : b,
      ),
    );
  }

  function startHold(blockKey: string, setIndex: number) {
    // Starting a second hold records the first rather than dropping it on the floor.
    if (runningHold) commitHold(runningHold);
    setRunningHold(beginHold(blockKey, setIndex));
  }

  function stopHold() {
    if (runningHold) commitHold(runningHold);
    setRunningHold(null);
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
        return {
          ...b,
          sets: nextSets.length > 0 ? nextSets : [emptySetForExercise(b)],
        };
      }),
    );
  }

  function addSet(blockIndex: number) {
    setBlocksAndSave((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        const last = b.sets[b.sets.length - 1];
        return {
          ...b,
          sets: [...b.sets, setFromPrevious(last, b)],
        };
      }),
    );
  }

  function copyLastSets(blockIndex: number, historySets: WorkoutSetView[]) {
    setBlocksAndSave((current) =>
      current.map((b, i) => {
        if (i !== blockIndex) return b;
        return { ...b, sets: setsFromHistory(historySets, b) };
      }),
    );
  }

  function handleExerciseSaved(saved: ExerciseSummary) {
    setCatalogOverlay((current) => {
      const idx = current.findIndex((e) => e.id === saved.id);
      if (idx >= 0) {
        const next = [...current];
        next[idx] = saved;
        return next;
      }
      return [...current, saved];
    });
    // Close config and land back on the log with this exercise selected on the block.
    if (exerciseEditor) {
      const bi = exerciseEditor.blockIndex;
      const wasNew = exerciseEditor.exercise === null;
      setBlocksAndSave((current) =>
        current.map((b, i) => {
          if (i !== bi) return b;
          // New exercise: start clean sets. Edit: keep entered sets, refresh metadata.
          if (wasNew) {
            return {
              ...draftBlockFromCatalog(saved, b.key),
              sets: [emptySetForExercise(saved)],
            };
          }
          return {
            ...b,
            exerciseId: saved.id,
            exerciseName: saved.name,
            equipment: saved.equipment,
            measure: saved.measure,
            barWeight: saved.barWeight,
            unilateral: saved.unilateral,
            sets: b.sets.map((s) => ({
              ...s,
              unit:
                saved.equipment === "bodyweight"
                  ? "bw"
                  : s.unit === "bw"
                    ? "lb"
                    : s.unit,
            })),
          };
        }),
      );
    }
    setExerciseEditor(null);
    onCatalogChange?.();
  }

  const closeAfterFlush = useCallback(() => {
    // A hold you never stopped is not a set you did — drop it rather than racing the
    // flush below to get its seconds into the draft.
    setRunningHold(null);
    void flush();
    onClose();
  }, [flush, onClose]);

  return (
    <>
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
              <ExerciseBlock
                key={block.key}
                block={block}
                catalog={catalog}
                canRemove={blocks.length > 1}
                sessionId={sessionId}
                onSelect={(id) => selectExercise(bi, id)}
                onRemove={() => setBlocksAndSave((c) => c.filter((_, i) => i !== bi))}
                onNewExercise={(seedName) =>
                  setExerciseEditor({ exercise: null, blockIndex: bi, seedName })
                }
                onEditExercise={() => {
                  const ex = catalog.find((e) => e.id === block.exerciseId);
                  if (ex) setExerciseEditor({ exercise: ex, blockIndex: bi });
                }}
                runningHoldSetIndex={
                  runningHold?.blockKey === block.key ? runningHold.setIndex : null
                }
                runningHoldStartedAt={runningHold?.startedAt ?? null}
                onStartHold={(si) => startHold(block.key, si)}
                onStopHold={stopHold}
                onUpdateSet={(si, patch) => updateSet(bi, si, patch)}
                onRemoveSet={(si) => removeSet(bi, si)}
                onAddSet={() => addSet(bi)}
                onCopyLast={(sets) => copyLastSets(bi, sets)}
                onUpdateNotes={(notes) =>
                  setBlocksAndSave((current) =>
                    current.map((b, i) => (i === bi ? { ...b, notes } : b)),
                  )
                }
              />
            ))}

            <button
              type="button"
              onClick={() => setBlocksAndSave((c) => [...c, emptyDraftBlock()])}
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
          </div>

          <RestTimer />
        </div>
      </Drawer>

      <ExerciseEditor
        open={exerciseEditor !== null}
        exercise={exerciseEditor?.exercise ?? null}
        seedName={exerciseEditor?.seedName}
        onClose={() => setExerciseEditor(null)}
        onSaved={handleExerciseSaved}
      />
    </>
  );
}

function ExerciseBlock({
  block,
  catalog,
  canRemove,
  sessionId,
  onSelect,
  onRemove,
  onNewExercise,
  onEditExercise,
  runningHoldSetIndex,
  runningHoldStartedAt,
  onStartHold,
  onStopHold,
  onUpdateSet,
  onRemoveSet,
  onAddSet,
  onCopyLast,
  onUpdateNotes,
}: {
  block: DraftExercise;
  catalog: ExerciseSummary[];
  canRemove: boolean;
  sessionId: string | null;
  onSelect: (id: string) => void;
  onRemove: () => void;
  onNewExercise: (seedName: string) => void;
  onEditExercise: () => void;
  /** Which set in this block is being timed, if any. */
  runningHoldSetIndex: number | null;
  runningHoldStartedAt: number | null;
  onStartHold: (setIndex: number) => void;
  onStopHold: () => void;
  onUpdateSet: (setIndex: number, patch: Partial<DraftSet>) => void;
  onRemoveSet: (setIndex: number) => void;
  onAddSet: () => void;
  onCopyLast: (sets: WorkoutSetView[]) => void;
  onUpdateNotes: (notes: string) => void;
}) {
  const showPlates = usesPlateCalculator(block.equipment);
  const columns = useMemo(
    () =>
      setColumns({
        measure: block.measure,
        equipment: block.equipment,
        unilateral: block.unilateral,
      }),
    [block.measure, block.equipment, block.unilateral],
  );

  const sortedCatalog = useMemo(
    () =>
      [...catalog].sort((a, b) => {
        const byName = a.name.localeCompare(b.name);
        if (byName !== 0) return byName;
        return a.equipment.localeCompare(b.equipment);
      }),
    [catalog],
  );

  return (
    <div className="rounded border border-rule bg-shell/40 p-3">
      <div className="mb-1 flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
            Exercise
          </span>
          <ExercisePicker
            catalog={sortedCatalog}
            value={block.exerciseId}
            onChange={onSelect}
            onCreateNew={onNewExercise}
            emptyLabel="Select exercise…"
          />
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="pb-1.5 text-[0.75rem] text-ink-faint hover:text-priority-a"
          >
            Remove
          </button>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
        {block.exerciseId ? (
          <>
            <span className="text-ink-faint">
              {[
                formatEquipmentBadge(
                  block.equipment,
                  block.barWeight,
                  block.unilateral,
                ),
                formatMeasureTag(block.measure),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <button
              type="button"
              onClick={onEditExercise}
              className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Edit
            </button>
            <LastSessionHint
              exerciseId={block.exerciseId}
              excludeSessionId={sessionId}
              onCopy={onCopyLast}
            />
          </>
        ) : (
          <span className="text-ink-faint">
            Type to find an exercise, or add a new one
          </span>
        )}
      </div>

      {block.exerciseId && (
        <>
          <div className="space-y-1">
            <SetHeader columns={columns} />
            {block.sets.map((set, si) => (
              <SetRow
                key={si}
                index={si}
                set={set}
                columns={columns}
                showPlates={showPlates}
                barWeight={block.barWeight}
                holdStartedAt={runningHoldSetIndex === si ? runningHoldStartedAt : null}
                onStartHold={() => onStartHold(si)}
                onStopHold={onStopHold}
                onChange={(patch) => onUpdateSet(si, patch)}
                onRemove={() => onRemoveSet(si)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onAddSet}
            className="mt-2 text-[0.75rem] text-ink-muted hover:text-ink"
          >
            + Add set
          </button>
          <ExerciseNotes
            key={block.exerciseId}
            value={block.notes}
            onChange={onUpdateNotes}
          />
        </>
      )}
    </div>
  );
}

function SetHeader({ columns }: { columns: SetColumn[] }) {
  return (
    <div
      className="grid gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint"
      style={{ gridTemplateColumns: gridTemplate(columns) }}
    >
      {columns.map((column) => (
        <span key={column.key}>{column.label}</span>
      ))}
    </div>
  );
}

function SetRow({
  index,
  set,
  columns,
  showPlates,
  barWeight,
  holdStartedAt,
  onStartHold,
  onStopHold,
  onChange,
  onRemove,
}: {
  index: number;
  set: DraftSet;
  columns: SetColumn[];
  showPlates: boolean;
  barWeight: number;
  /** Non-null while this row's stopwatch is running. */
  holdStartedAt: number | null;
  onStartHold: () => void;
  onStopHold: () => void;
  onChange: (patch: Partial<DraftSet>) => void;
  onRemove: () => void;
}) {
  const unit = set.unit || "lb";
  // The widest rows squeeze the number fields, exactly as the hand-written grids did.
  const numberClass = `min-w-0 rounded border border-rule bg-surface ${
    columns.length >= 6 ? "px-1.5" : "px-2"
  } py-1 font-mono text-[0.8125rem] text-ink`;

  const hold = parseDurationSeconds(set.duration);

  function cell(column: SetColumn) {
    switch (column.key) {
      case "index":
        return (
          <span className="font-mono text-[0.75rem] text-ink-faint">{index + 1}</span>
        );

      case "reps":
        return (
          <input
            type="number"
            min={0}
            value={set.reps}
            onChange={(e) => onChange({ reps: e.target.value })}
            className={numberClass}
          />
        );

      case "repsLeft":
      case "repsRight": {
        const left = column.key === "repsLeft";
        return (
          <input
            type="number"
            min={0}
            value={left ? set.repsLeft : set.repsRight}
            onChange={(e) =>
              onChange(
                left ? { repsLeft: e.target.value } : { repsRight: e.target.value },
              )
            }
            placeholder={left ? "L" : "R"}
            className={numberClass}
          />
        );
      }

      case "duration":
        return (
          <div className="flex min-w-0 items-center gap-0.5">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={holdStartedAt == null ? set.duration : ""}
              onChange={(e) => onChange({ duration: e.target.value })}
              placeholder="sec"
              disabled={holdStartedAt != null}
              className={`${numberClass} flex-1`}
            />
            <HoldTimer
              startedAt={holdStartedAt}
              onStart={onStartHold}
              onStop={onStopHold}
            />
          </div>
        );

      case "weight":
        return (
          <div className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              title={`−${weightStep(unit)}`}
              onClick={() => onChange({ weight: bumpWeight(set.weight, unit, -1) })}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded border border-rule bg-surface text-[0.75rem] text-ink-muted hover:text-ink"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              step={weightStep(unit)}
              value={set.weight}
              onChange={(e) => onChange({ weight: e.target.value })}
              className="min-w-0 flex-1 rounded border border-rule bg-surface px-1.5 py-1 font-mono text-[0.8125rem] text-ink"
            />
            <button
              type="button"
              title={`+${weightStep(unit)}`}
              onClick={() => onChange({ weight: bumpWeight(set.weight, unit, 1) })}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded border border-rule bg-surface text-[0.75rem] text-ink-muted hover:text-ink"
            >
              +
            </button>
          </div>
        );

      case "unit":
        return (
          <select
            value={set.unit === "bw" ? "lb" : set.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className="rounded border border-rule bg-surface px-1 py-1 text-[0.75rem] text-ink"
          >
            <option value="lb">lb</option>
            <option value="kg">kg</option>
          </select>
        );

      case "delete":
        return (
          <button
            type="button"
            onClick={onRemove}
            title="Delete set"
            className="flex h-7 w-7 items-center justify-center rounded text-ink-faint hover:bg-priority-a/10 hover:text-priority-a"
          >
            ×
          </button>
        );
    }
  }

  return (
    <div className="space-y-0.5">
      <div
        className="grid items-center gap-1"
        style={{ gridTemplateColumns: gridTemplate(columns) }}
      >
        {columns.map((column) => (
          <Fragment key={column.key}>{cell(column)}</Fragment>
        ))}
      </div>
      {showPlates && (
        <PlateLine weight={set.weight} unit={unit} barWeightLb={barWeight} />
      )}
      {/* Seconds are what you type; the clock is only worth showing past a minute. */}
      {hold != null && hold >= 60 && (
        <p className="pl-8 font-mono text-[0.6875rem] text-ink-faint">
          {formatDurationClock(hold)}
        </p>
      )}
    </div>
  );
}

function PlateLine({
  weight,
  unit,
  barWeightLb,
}: {
  weight: string;
  unit: string;
  barWeightLb: number;
}) {
  const hint = plateHint(parseWeight(weight), unit, barWeightLb);
  if (!hint) return null;
  return <p className="pl-8 font-mono text-[0.6875rem] text-ink-faint">{hint}</p>;
}

function ExerciseNotes({
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

function LastSessionHint({
  exerciseId,
  excludeSessionId,
  onCopy,
}: {
  exerciseId: string;
  excludeSessionId: string | null;
  onCopy: (sets: WorkoutSetView[]) => void;
}) {
  const [fetched, setFetched] = useState<{
    exerciseId: string;
    excludeSessionId: string | null;
    entry: ExerciseHistoryEntry | null;
  } | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    const exclude = excludeSessionId;
    void loadLatestForExerciseAction(exerciseId, exclude).then((result) => {
      if (cancelled || !result.ok) return;
      setFetched({
        exerciseId,
        excludeSessionId: exclude,
        entry: (result.data as ExerciseHistoryEntry | null) ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseId, excludeSessionId]);

  const latest =
    fetched &&
    fetched.exerciseId === exerciseId &&
    fetched.excludeSessionId === excludeSessionId
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
