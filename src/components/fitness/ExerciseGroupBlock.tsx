"use client";

import { useMemo } from "react";
import { formatEquipmentBadge, usesPlateCalculator } from "@/lib/fitness/equipment";
import { holdStartedAt, type RunningHold } from "@/lib/fitness/hold";
import { formatMeasureTag } from "@/lib/fitness/measure";
import { roundRows } from "@/lib/fitness/rounds";
import { setColumns } from "@/lib/fitness/setColumns";
import type { DraftExercise, DraftGroup, DraftSet } from "@/lib/fitness/sessionDraft";
import type { SessionItemMember } from "@/lib/fitness/sessionGroups";
import type { ExerciseSummary, WorkoutSetView } from "@/lib/fitness/types";
import { ExerciseNotes, LastSessionHint } from "./ExerciseMeta";
import { ExercisePicker } from "./ExercisePicker";
import { SetHeader, SetRow } from "./SetRow";

const LABEL_PRESETS = ["Superset", "Circuit", "Drop set", "Giant set"];

/**
 * A superset, circuit or mechanical drop set, logged the way it is performed: **round
 * major**. Round 1 lists every member, then round 2 does, so nothing has to be scrolled
 * past mid-circuit.
 *
 * Each member keeps its own derived set columns, so a timed carry and a rep exercise sit in
 * one group without either losing a field. What moves out of the rounds is anything that is
 * a fact about the exercise rather than about one round — the day's note and the "last
 * time" hint — which live in the member strip above.
 */
export function ExerciseGroupBlock({
  letter,
  group,
  members,
  rounds,
  catalog,
  sessionId,
  runningHold,
  onPatchGroup,
  onUngroup,
  onRemoveGroup,
  onAddRound,
  onRemoveRound,
  onExtendMember,
  onAddMember,
  onRemoveMember,
  onSelect,
  onNewExercise,
  onEditExercise,
  onUpdateSet,
  onClearSet,
  onCopyLast,
  onUpdateNotes,
  onStartHold,
  onStopHold,
}: {
  letter: string;
  group: DraftGroup;
  members: SessionItemMember<DraftExercise>[];
  rounds: number;
  catalog: ExerciseSummary[];
  sessionId: string | null;
  runningHold: RunningHold | null;
  onPatchGroup: (patch: Partial<Omit<DraftGroup, "id">>) => void;
  onUngroup: () => void;
  onRemoveGroup: () => void;
  onAddRound: () => void;
  onRemoveRound: (round: number) => void;
  onExtendMember: (memberIndex: number, round: number) => void;
  onAddMember: () => void;
  /** All callbacks below address the member by its index in the flat block list. */
  onRemoveMember: (blockIndex: number) => void;
  onSelect: (blockIndex: number, exerciseId: string) => void;
  onNewExercise: (blockIndex: number, seedName: string) => void;
  onEditExercise: (blockIndex: number) => void;
  onUpdateSet: (blockIndex: number, setIndex: number, patch: Partial<DraftSet>) => void;
  onClearSet: (blockIndex: number, setIndex: number) => void;
  onCopyLast: (blockIndex: number, sets: WorkoutSetView[]) => void;
  onUpdateNotes: (blockIndex: number, notes: string) => void;
  onStartHold: (blockKey: string, setIndex: number) => void;
  onStopHold: () => void;
}) {
  const blocks = useMemo(() => members.map((m) => m.member), [members]);

  const columnsByMember = useMemo(
    () =>
      blocks.map((block) =>
        setColumns({
          measure: block.measure,
          equipment: block.equipment,
          unilateral: block.unilateral,
        }),
      ),
    [blocks],
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

  const ready = blocks.some((b) => b.exerciseId);
  const listId = `group-labels-${group.id}`;

  return (
    <div className="rounded border border-rule bg-shell/40 p-3">
      <div className="mb-2 flex items-end gap-2">
        <span className="pb-1.5 font-mono text-[0.8125rem] font-semibold text-ink-muted">
          {letter}
        </span>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Group
          <input
            type="text"
            list={listId}
            value={group.label}
            placeholder="Superset, circuit…"
            onChange={(e) => onPatchGroup({ label: e.target.value })}
            className="min-h-[2.75rem] rounded border border-rule bg-surface px-2 py-1.5 text-[1rem] text-ink normal-case tracking-normal"
          />
          <datalist id={listId}>
            {LABEL_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
        </label>
        <label className="flex w-24 flex-col gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
          Rest
          <input
            type="text"
            inputMode="numeric"
            value={group.rest}
            placeholder="90"
            onChange={(e) => onPatchGroup({ rest: e.target.value })}
            className="min-h-[2.75rem] rounded border border-rule bg-surface px-2 py-1.5 text-[1rem] text-ink normal-case tracking-normal"
          />
        </label>
      </div>

      <div className="mb-3 space-y-2 border-l-2 border-rule pl-2">
        {members.map((entry) => {
          const block = entry.member;
          return (
            <div key={block.key}>
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 font-mono text-[0.75rem] text-ink-faint">
                  {entry.label}
                </span>
                <div className="min-w-0 flex-1">
                  <ExercisePicker
                    catalog={sortedCatalog}
                    value={block.exerciseId}
                    onChange={(id) => onSelect(entry.index, id)}
                    onCreateNew={(seedName) => onNewExercise(entry.index, seedName)}
                    emptyLabel="Select exercise…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveMember(entry.index)}
                  title="Remove from group"
                  className="flex h-11 w-8 shrink-0 items-center justify-center text-[0.75rem] text-ink-faint hover:text-priority-a"
                >
                  ×
                </button>
              </div>

              {block.exerciseId ? (
                <div className="pl-9">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem]">
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
                      onClick={() => onEditExercise(entry.index)}
                      className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      Edit
                    </button>
                    <LastSessionHint
                      exerciseId={block.exerciseId}
                      excludeSessionId={sessionId}
                      onCopy={(sets) => onCopyLast(entry.index, sets)}
                    />
                  </div>
                  <ExerciseNotes
                    key={block.exerciseId}
                    value={block.notes}
                    onChange={(notes) => onUpdateNotes(entry.index, notes)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddMember}
          className="text-[0.75rem] text-ink-muted hover:text-ink"
        >
          + Add exercise to group
        </button>
      </div>

      {ready
        ? Array.from({ length: rounds }, (_, round) => (
            <div key={round} className="mb-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
                  Round {round + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveRound(round)}
                  title="Delete this round from every member"
                  className="flex h-8 w-8 items-center justify-center rounded text-ink-faint hover:bg-priority-a/10 hover:text-priority-a"
                >
                  ×
                </button>
              </div>

              {roundRows(blocks, round).map((row) => {
                const entry = members[row.memberIndex];
                const columns = columnsByMember[row.memberIndex];
                if (!entry.member.exerciseId) return null;

                // A member that stopped before this round: honest, and still loggable.
                if (row.set === null) {
                  return (
                    <button
                      key={entry.member.key}
                      type="button"
                      onClick={() => onExtendMember(row.memberIndex, round)}
                      className="flex min-h-[2.25rem] w-full items-center gap-2 rounded text-left text-[0.75rem] text-ink-faint hover:text-ink"
                    >
                      <span className="w-7 shrink-0 font-mono">{entry.label}</span>
                      <span>— tap to log this round</span>
                    </button>
                  );
                }

                return (
                  <div key={entry.member.key}>
                    {/* Members can measure different things, so a member names its own
                        columns in the first round — but only where they differ from the
                        member above, or a plain superset repeats one header per row. */}
                    {round === 0 && showsHeader(columnsByMember, row.memberIndex) ? (
                      <SetHeader columns={columns} />
                    ) : null}
                    <SetRow
                      index={round}
                      indexLabel={entry.label}
                      set={row.set}
                      columns={columns}
                      showPlates={usesPlateCalculator(entry.member.equipment)}
                      barWeight={entry.member.barWeight}
                      holdStartedAt={holdStartedAt(
                        runningHold,
                        entry.member.key,
                        round,
                      )}
                      onStartHold={() => onStartHold(entry.member.key, round)}
                      onStopHold={onStopHold}
                      onChange={(patch) => onUpdateSet(entry.index, round, patch)}
                      // Deleting one member's row would slide its later rounds up a place,
                      // so × blanks it instead: a round this member sat out.
                      onRemove={() => onClearSet(entry.index, round)}
                    />
                  </div>
                );
              })}
            </div>
          ))
        : null}

      <div className="flex flex-wrap items-center gap-4">
        {ready ? (
          <button
            type="button"
            onClick={onAddRound}
            className="text-[0.8125rem] font-medium text-ink-muted hover:text-ink"
          >
            + Add round
          </button>
        ) : null}
        <button
          type="button"
          onClick={onUngroup}
          className="text-[0.75rem] text-ink-faint hover:text-ink"
        >
          Ungroup
        </button>
        <button
          type="button"
          onClick={onRemoveGroup}
          className="text-[0.75rem] text-ink-faint hover:text-priority-a"
        >
          Remove group
        </button>
      </div>
    </div>
  );
}

function showsHeader(
  columnsByMember: ReturnType<typeof setColumns>[],
  memberIndex: number,
): boolean {
  if (memberIndex === 0) return true;
  const previous = columnsByMember[memberIndex - 1];
  const current = columnsByMember[memberIndex];
  return (
    previous.length !== current.length ||
    current.some((c, i) => c.key !== previous[i].key)
  );
}
