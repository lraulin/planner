"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadLatestForExerciseAction } from "@/app/fitness/actions";
import { Drawer } from "@/components/detail/Drawer";
import { useAutosave, type SaveStatus } from "@/components/notes/useAutosave";
import {
  currentSetCue,
  currentSetTarget,
  restAfterComplete,
  sessionSetProgress,
  setRowRole,
} from "@/lib/fitness/currentSet";
import { parseDurationSeconds } from "@/lib/fitness/duration";
import { formatSetsLabel } from "@/lib/fitness/format";
import { formatEquipmentBadge, usesPlateCalculator } from "@/lib/fitness/equipment";
import {
  addMember,
  joinWithNext,
  joinWithPrevious,
  patchGroup,
  pruneGroups,
  removeGroup,
  removeMember,
  ungroup,
  withMembers,
  type Grouping,
} from "@/lib/fitness/groupEdit";
import { beginHold, secondsHeld, type RunningHold } from "@/lib/fitness/hold";
import { formatMeasureTag } from "@/lib/fitness/measure";
import { addRound, extendMemberTo, removeRound } from "@/lib/fitness/rounds";
import { setColumns } from "@/lib/fitness/setColumns";
import {
  draftBlockFromCatalog,
  draftFromDetail,
  draftHasWork,
  draftToSessionInput,
  emptyDraftBlock,
  emptySetForExercise,
  planDraftFromDetail,
  setFromPrevious,
  setsFromHistory,
  toLocalDateTimeInput,
  type DraftExercise,
  type DraftGroup,
  type DraftSet,
  type SessionDraft,
} from "@/lib/fitness/sessionDraft";
import { groupSessionItems } from "@/lib/fitness/sessionGroups";
import type {
  ExerciseSummary,
  RepeatableTitle,
  SessionDetail,
  SessionInput,
  WorkoutSetView,
} from "@/lib/fitness/types";
import { ExerciseEditor } from "./ExerciseEditor";
import { ExerciseGroupBlock } from "./ExerciseGroupBlock";
import { ExerciseNotes, LastSessionHint } from "./ExerciseMeta";
import { ExercisePicker } from "./ExercisePicker";
import { RestTimer } from "./RestTimer";
import { SetHeader, SetRow } from "./SetRow";
import { TitlePicker } from "./TitlePicker";

/**
 * Strength session drawer. Select catalog exercises (configure elsewhere);
 * set grid adapts to equipment + unilateral. Autosaves like notes.
 */
export function SessionEditor({
  open,
  onClose,
  exercises: catalogProp,
  existing,
  copyFrom,
  seedExerciseId,
  titles,
  onRepeatTitle,
  onCreate,
  onUpdate,
  onPersisted,
  onCatalogChange,
}: {
  open: boolean;
  onClose: () => void;
  exercises: ExerciseSummary[];
  existing: SessionDetail | null;
  /** Complete source session to copy as an unchecked plan. */
  copyFrom?: SessionDetail | null;
  seedExerciseId: string | null;
  titles?: readonly RepeatableTitle[];
  onRepeatTitle?: (sessionId: string, isIncomplete: boolean) => void;
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
    if (copyFrom) return planDraftFromDetail(copyFrom);
    const seed = seedExerciseId
      ? catalogProp.find((e) => e.id === seedExerciseId)
      : null;
    return {
      performedAt: toLocalDateTimeInput(new Date()),
      title: "",
      notes: "",
      durationMinutes: "",
      groups: [],
      exercises: [seed ? draftBlockFromCatalog(seed) : emptyDraftBlock()],
    } satisfies SessionDraft;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, copyFrom?.id, seedExerciseId, open]);

  const [performedAt, setPerformedAt] = useState(initial.performedAt);
  const [title, setTitle] = useState(initial.title);
  const [notes, setNotes] = useState(initial.notes);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  /**
   * Groups and exercises move together — a block's membership and the group it points at
   * are one fact — so they are one piece of state rather than two that must be kept in step.
   */
  const [grouping, setGrouping] = useState<Grouping>({
    groups: initial.groups,
    exercises: initial.exercises,
  });
  const blocks = grouping.exercises;
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

  /**
   * `RestTimer` has always offered this hook and nothing ever took it. Finishing a round is
   * the moment it was meant for.
   */
  const restStartRef = useRef<((seconds?: number) => void) | null>(null);
  const registerRestStart = useCallback((start: (seconds?: number) => void) => {
    restStartRef.current = start;
  }, []);
  const [restCue, setRestCue] = useState<string | null>(null);

  const currentTarget = useMemo(
    () => currentSetTarget(blocks, grouping.groups),
    [blocks, grouping.groups],
  );
  const liveCue = useMemo(
    () => currentSetCue(blocks, grouping.groups),
    [blocks, grouping.groups],
  );
  const progress = useMemo(() => sessionSetProgress(blocks), [blocks]);
  const reviewingHistory = existing !== null && currentTarget === null;
  const currentExerciseId = liveCue
    ? (blocks[liveCue.target.blockIndex]?.exerciseId ?? "")
    : "";
  const [fetchedLast, setFetchedLast] = useState<{
    exerciseId: string;
    label: string | null;
  } | null>(null);

  useEffect(() => {
    if (!currentExerciseId) return;
    let cancelled = false;
    const exerciseId = currentExerciseId;
    void loadLatestForExerciseAction(exerciseId, sessionId, title.trim() || null).then(
      (result) => {
        if (cancelled || !result.ok) return;
        const entry = result.data as { sets: WorkoutSetView[] } | null;
        setFetchedLast({
          exerciseId,
          label: entry?.sets.length ? formatSetsLabel(entry.sets) : null,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [currentExerciseId, sessionId, title]);

  const stickyLast =
    currentExerciseId && fetchedLast?.exerciseId === currentExerciseId
      ? fetchedLast.label
      : null;

  useEffect(() => {
    if (!open || !currentTarget) return;
    const el = document.querySelector(
      `[data-set-target="${currentTarget.blockIndex}-${currentTarget.setIndex}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, currentTarget]);

  const idCatalog = useMemo(
    () => catalog.map((e) => ({ id: e.id, name: e.name })),
    [catalog],
  );

  const buildDraft = useCallback((): SessionDraft => {
    return {
      performedAt,
      title,
      notes,
      durationMinutes,
      groups: grouping.groups,
      exercises: grouping.exercises,
    };
  }, [performedAt, title, notes, durationMinutes, grouping]);

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
      groups: grouping.groups,
      exercises: grouping.exercises,
    });
  }

  function setGroupingAndSave(updater: (current: Grouping) => Grouping) {
    setGrouping((current) => {
      const next = updater(current);
      queueSave({
        performedAt,
        title,
        notes,
        durationMinutes,
        groups: next.groups,
        exercises: next.exercises,
      });
      return next;
    });
  }

  function setBlocksAndSave(
    updater: DraftExercise[] | ((current: DraftExercise[]) => DraftExercise[]),
  ) {
    // Pruning here is what stops removing a group's last member leaving a ghost group.
    setGroupingAndSave((current) =>
      pruneGroups({
        groups: current.groups,
        exercises: typeof updater === "function" ? updater(current.exercises) : updater,
      }),
    );
  }

  function patchGroupAndSave(groupId: string, patch: Partial<Omit<DraftGroup, "id">>) {
    setGroupingAndSave((current) => patchGroup(current, groupId, patch));
  }

  function addRoundAndSave(groupId: string, rest: string) {
    setGroupingAndSave((current) => withMembers(current, groupId, addRound));
    /*
     * The round is over the moment the next one is queued up — that is the rest. A group
     * with no rest typed still starts the timer, at whatever duration the session has been
     * using; the group's own value is an override, not a precondition.
     */
    restStartRef.current?.(parseDurationSeconds(rest) ?? undefined);
  }

  function removeRoundAndSave(groupId: string, round: number) {
    setGroupingAndSave((current) =>
      withMembers(current, groupId, (members) => removeRound(members, round)),
    );
  }

  function extendMemberAndSave(groupId: string, memberIndex: number, round: number) {
    setGroupingAndSave((current) =>
      withMembers(current, groupId, (members) =>
        extendMemberTo(members, memberIndex, round),
      ),
    );
  }

  /** Blank a round rather than delete it — deleting would shift later rounds up a place. */
  function clearSet(blockIndex: number, setIndex: number) {
    setBlocksAndSave((current) =>
      current.map((b, i) =>
        i === blockIndex
          ? {
              ...b,
              sets: b.sets.map((s, j) => (j === setIndex ? emptySetForExercise(b) : s)),
            }
          : b,
      ),
    );
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

  function toggleComplete(blockIndex: number, setIndex: number, completed: boolean) {
    const nextExercises = grouping.exercises.map((b, i) => {
      if (i !== blockIndex) return b;
      return {
        ...b,
        sets: b.sets.map((s, j) => (j === setIndex ? { ...s, completed } : s)),
      };
    });
    const next = pruneGroups({
      groups: grouping.groups,
      exercises: nextExercises,
    });
    setGrouping(next);
    queueSave({
      performedAt,
      title,
      notes,
      durationMinutes,
      groups: next.groups,
      exercises: next.exercises,
    });
    if (!completed) return;
    const cue = restAfterComplete(next.exercises, next.groups, {
      blockIndex,
      setIndex,
    });
    if (!cue) {
      setRestCue(null);
      return;
    }
    setRestCue(`Resting for ${cue.exerciseName} — set ${cue.setNumber}`);
    const block = next.exercises[blockIndex];
    const group = block.groupId
      ? next.groups.find((g) => g.id === block.groupId)
      : null;
    restStartRef.current?.(parseDurationSeconds(group?.rest) ?? undefined);
  }

  function updateSet(blockIndex: number, setIndex: number, patch: Partial<DraftSet>) {
    if (typeof patch.completed === "boolean") {
      toggleComplete(blockIndex, setIndex, patch.completed);
      return;
    }
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

  function selectRepeatableTitle(entry: RepeatableTitle) {
    const draft = buildDraft();
    if (!draftHasWork(draft) && onRepeatTitle) {
      onRepeatTitle(entry.sessionId, entry.isIncomplete);
      return;
    }
    patchMeta({ title: entry.title });
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

          {liveCue && !reviewingHistory ? (
            <div className="flex-none border-b border-rule bg-shell/90 px-4 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold text-ink">
                  {liveCue.exerciseName} — Set {liveCue.setNumber} of {liveCue.setCount}
                </p>
                <p className="shrink-0 font-mono text-[0.75rem] text-ink-muted">
                  {progress.done} / {progress.total}
                </p>
              </div>
              {stickyLast ? (
                <p className="mt-0.5 font-mono text-[0.75rem] text-ink-faint">
                  Last time: {stickyLast}
                </p>
              ) : null}
            </div>
          ) : progress.total > 0 ? (
            <div className="flex-none border-b border-rule bg-shell/90 px-4 py-2">
              <p className="font-mono text-[0.75rem] text-ink-muted">
                {progress.done} / {progress.total} sets
              </p>
            </div>
          ) : null}

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
              <TitlePicker
                titles={titles ?? []}
                value={title}
                onChange={(next) => patchMeta({ title: next })}
                onSelectTitle={selectRepeatableTitle}
              />
            </label>

            {groupSessionItems(blocks, grouping.groups).map((item) => {
              if (item.kind === "group") {
                return (
                  <ExerciseGroupBlock
                    key={item.group.id}
                    letter={item.letter}
                    group={item.group}
                    members={item.members}
                    rounds={item.rounds}
                    catalog={catalog}
                    sessionId={sessionId}
                    runningHold={runningHold}
                    onPatchGroup={(patch) => patchGroupAndSave(item.group.id, patch)}
                    onUngroup={() =>
                      setGroupingAndSave((c) => ungroup(c, item.group.id))
                    }
                    onRemoveGroup={() =>
                      setGroupingAndSave((c) => removeGroup(c, item.group.id))
                    }
                    onAddRound={() => addRoundAndSave(item.group.id, item.group.rest)}
                    onRemoveRound={(round) => removeRoundAndSave(item.group.id, round)}
                    onExtendMember={(memberIndex, round) =>
                      extendMemberAndSave(item.group.id, memberIndex, round)
                    }
                    onAddMember={() =>
                      setGroupingAndSave((c) => addMember(c, item.group.id))
                    }
                    onRemoveMember={(bi) =>
                      setGroupingAndSave((c) => removeMember(c, bi))
                    }
                    onSelect={(bi, id) => selectExercise(bi, id)}
                    onNewExercise={(bi, seedName) =>
                      setExerciseEditor({ exercise: null, blockIndex: bi, seedName })
                    }
                    onEditExercise={(bi) => {
                      const ex = catalog.find((e) => e.id === blocks[bi]?.exerciseId);
                      if (ex) setExerciseEditor({ exercise: ex, blockIndex: bi });
                    }}
                    onUpdateSet={updateSet}
                    onClearSet={clearSet}
                    onCopyLast={copyLastSets}
                    onUpdateNotes={(bi, notes) =>
                      setBlocksAndSave((current) =>
                        current.map((b, i) => (i === bi ? { ...b, notes } : b)),
                      )
                    }
                    onStartHold={startHold}
                    onStopHold={stopHold}
                    currentTarget={currentTarget}
                    sessionTitle={title}
                  />
                );
              }

              const block = item.member;
              const bi = item.index;
              return (
                <ExerciseBlock
                  key={block.key}
                  letter={item.letter}
                  block={block}
                  catalog={catalog}
                  canRemove={blocks.length > 1}
                  canGroupWithPrevious={bi > 0}
                  canGroupWithNext={bi < blocks.length - 1}
                  onGroupWithPrevious={() =>
                    setGroupingAndSave((c) => joinWithPrevious(c, bi))
                  }
                  onGroupWithNext={() => setGroupingAndSave((c) => joinWithNext(c, bi))}
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
                  currentTarget={currentTarget}
                  blockIndex={bi}
                  sessionTitle={title}
                  onUpdateNotes={(notes) =>
                    setBlocksAndSave((current) =>
                      current.map((b, i) => (i === bi ? { ...b, notes } : b)),
                    )
                  }
                />
              );
            })}

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

          <RestTimer onRegisterStart={registerRestStart} cue={restCue} />
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
  letter,
  block,
  catalog,
  canRemove,
  canGroupWithPrevious,
  canGroupWithNext,
  onGroupWithPrevious,
  onGroupWithNext,
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
  currentTarget,
  blockIndex,
  sessionTitle,
}: {
  letter: string;
  block: DraftExercise;
  catalog: ExerciseSummary[];
  canRemove: boolean;
  canGroupWithPrevious: boolean;
  canGroupWithNext: boolean;
  onGroupWithPrevious: () => void;
  onGroupWithNext: () => void;
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
  currentTarget: { blockIndex: number; setIndex: number } | null;
  blockIndex: number;
  sessionTitle: string;
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
        <span className="pb-1.5 font-mono text-[0.8125rem] font-semibold text-ink-muted">
          {letter}
        </span>
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
              sessionTitle={sessionTitle}
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
                role={setRowRole(currentTarget, blockIndex, si, set.completed)}
                targetKey={`${blockIndex}-${si}`}
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
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onAddSet}
              className="text-[0.75rem] text-ink-muted hover:text-ink"
            >
              + Add set
            </button>
            {/* Joining a neighbour always yields a contiguous span, so grouping needs no
                drag affordance — and fitness has none to extend. */}
            {canGroupWithPrevious ? (
              <button
                type="button"
                onClick={onGroupWithPrevious}
                className="text-[0.75rem] text-ink-faint hover:text-ink"
              >
                ⌃ Group with previous
              </button>
            ) : null}
            {canGroupWithNext ? (
              <button
                type="button"
                onClick={onGroupWithNext}
                className="text-[0.75rem] text-ink-faint hover:text-ink"
              >
                ⌄ Group with next
              </button>
            ) : null}
          </div>
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
