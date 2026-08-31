/**
 * Which set is being lifted right now: first incomplete, round-major inside a group.
 *
 * Derived, not stored. A fully completed history session has no current set.
 */

import type { DraftExercise, DraftGroup } from "./sessionDraft";
import { groupSessionItems } from "./sessionGroups";

export type SetTarget = {
  blockIndex: number;
  setIndex: number;
};

export function sameSetTarget(a: SetTarget | null, b: SetTarget | null): boolean {
  if (a == null || b == null) return a === b;
  return a.blockIndex === b.blockIndex && a.setIndex === b.setIndex;
}

export function setRowRole(
  target: SetTarget | null,
  blockIndex: number,
  setIndex: number,
  completed: boolean,
): "upcoming" | "current" | "done" {
  if (completed) return "done";
  if (target && target.blockIndex === blockIndex && target.setIndex === setIndex) {
    return "current";
  }
  return "upcoming";
}

export function currentSetTarget(
  exercises: readonly DraftExercise[],
  groups: readonly DraftGroup[],
): SetTarget | null {
  const items = groupSessionItems(exercises, groups);
  for (const item of items) {
    if (item.kind === "exercise") {
      const setIndex = item.member.sets.findIndex((s) => !s.completed);
      if (setIndex >= 0) return { blockIndex: item.index, setIndex };
      continue;
    }
    for (let round = 0; round < item.rounds; round += 1) {
      for (const member of item.members) {
        const set = member.member.sets[round];
        if (set && !set.completed) {
          return { blockIndex: member.index, setIndex: round };
        }
      }
    }
  }
  return null;
}

export function sessionSetProgress(exercises: readonly DraftExercise[]): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const block of exercises) {
    for (const set of block.sets) {
      total += 1;
      if (set.completed) done += 1;
    }
  }
  return { done, total };
}

export function currentSetCue(
  exercises: readonly DraftExercise[],
  groups: readonly DraftGroup[],
): {
  exerciseName: string;
  setNumber: number;
  setCount: number;
  target: SetTarget;
} | null {
  const target = currentSetTarget(exercises, groups);
  if (!target) return null;
  const block = exercises[target.blockIndex];
  if (!block) return null;
  return {
    exerciseName: block.exerciseName.trim() || "Exercise",
    setNumber: target.setIndex + 1,
    setCount: block.sets.length,
    target,
  };
}

/**
 * After checking a set (draft already updated), whether rest should start, and for whom.
 * Straight sets rest whenever work remains. Groups rest only after the last member of a
 * round — the next current set is a later round or a different item.
 */
export function restAfterComplete(
  exercises: readonly DraftExercise[],
  groups: readonly DraftGroup[],
  justCompleted: SetTarget,
): { exerciseName: string; setNumber: number } | null {
  const next = currentSetTarget(exercises, groups);
  if (!next) return null;

  const completed = exercises[justCompleted.blockIndex];
  const nextBlock = exercises[next.blockIndex];
  if (!completed || !nextBlock) return null;

  const groupId = completed.groupId;
  if (
    groupId &&
    groups.some((g) => g.id === groupId) &&
    nextBlock.groupId === groupId &&
    next.setIndex === justCompleted.setIndex
  ) {
    return null;
  }

  return {
    exerciseName: nextBlock.exerciseName.trim() || "Exercise",
    setNumber: next.setIndex + 1,
  };
}

export function sessionIsIncomplete(
  exercises: readonly { sets: readonly { completed: boolean }[] }[],
): boolean {
  return exercises.some((block) => block.sets.some((set) => !set.completed));
}
