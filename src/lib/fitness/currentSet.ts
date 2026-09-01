/**
 * Which set is being lifted right now: first incomplete, round-major inside a group.
 *
 * Derived, not stored. A fully completed history session has no current set.
 */

import type { DraftExercise, DraftGroup } from "./sessionDraft";
import { groupSessionItems, type SessionItem } from "./sessionGroups";

export type SetTarget = {
  blockIndex: number;
  setIndex: number;
};

type Item = SessionItem<DraftExercise, DraftGroup>;

/**
 * The first incomplete set within one top-level item — a straight exercise, or a whole
 * group read round-major. Null when the item is finished.
 */
function firstIncompleteInItem(item: Item): SetTarget | null {
  if (item.kind === "exercise") {
    const setIndex = item.member.sets.findIndex((s) => !s.completed);
    return setIndex >= 0 ? { blockIndex: item.index, setIndex } : null;
  }
  for (let round = 0; round < item.rounds; round += 1) {
    for (const member of item.members) {
      const set = member.member.sets[round];
      if (set && !set.completed) return { blockIndex: member.index, setIndex: round };
    }
  }
  return null;
}

function itemContainingKey(items: readonly Item[], key: string): Item | null {
  for (const item of items) {
    if (item.kind === "exercise") {
      if (item.member.key === key) return item;
      continue;
    }
    if (item.members.some((m) => m.member.key === key)) return item;
  }
  return null;
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

/**
 * Where the lifter is. The **active** item wins — the block last touched, keyed by
 * `DraftExercise.key` so it survives a reorder or a removal — because the bench being
 * taken is no reason to be dragged back to exercise A. With nothing active, or when the
 * active item is finished or gone, this is the first incomplete set in session order,
 * exactly as before.
 */
export function currentSetTarget(
  exercises: readonly DraftExercise[],
  groups: readonly DraftGroup[],
  activeKey: string | null = null,
): SetTarget | null {
  const items = groupSessionItems(exercises, groups);

  if (activeKey) {
    const active = itemContainingKey(items, activeKey);
    const inActive = active ? firstIncompleteInItem(active) : null;
    if (inActive) return inActive;
  }

  for (const item of items) {
    const target = firstIncompleteInItem(item);
    if (target) return target;
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
  activeKey: string | null = null,
): {
  exerciseName: string;
  setNumber: number;
  setCount: number;
  target: SetTarget;
} | null {
  const target = currentSetTarget(exercises, groups, activeKey);
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
  activeKey: string | null = null,
): { exerciseName: string; setNumber: number } | null {
  const next = currentSetTarget(exercises, groups, activeKey);
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
