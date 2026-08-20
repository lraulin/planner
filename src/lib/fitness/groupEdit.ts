/**
 * Editing which exercises are grouped. Pure, so the one invariant the whole feature rests
 * on — **a group's members are contiguous** — is enforced and tested here rather than
 * inferred from how the buttons happen to be wired.
 *
 * Contiguity is what lets a group have no sort key of its own. Every operation below either
 * preserves it or is a no-op.
 */

import { emptyDraftBlock, type DraftExercise, type DraftGroup } from "./sessionDraft";

export type Grouping = {
  groups: DraftGroup[];
  exercises: DraftExercise[];
};

function newGroup(): DraftGroup {
  return { id: crypto.randomUUID(), label: "", rest: "" };
}

/** Drop groups nothing points at — otherwise removing the last member leaves a ghost. */
export function pruneGroups({ groups, exercises }: Grouping): Grouping {
  const used = new Set(exercises.map((e) => e.groupId).filter(Boolean));
  return { groups: groups.filter((g) => used.has(g.id)), exercises };
}

function assign(
  exercises: readonly DraftExercise[],
  from: string | null,
  to: string | null,
): DraftExercise[] {
  return exercises.map((e) => (e.groupId === from ? { ...e, groupId: to } : e));
}

/**
 * Group the exercise at `index` with the one after it. Adjacent by definition, so whichever
 * of the four cases applies, the result is one contiguous span:
 * joining two loose lifts, extending a group by a neighbour, or merging two groups.
 */
export function joinWithNext(draft: Grouping, index: number): Grouping {
  const a = draft.exercises[index];
  const b = draft.exercises[index + 1];
  if (!a || !b) return draft;

  if (a.groupId && b.groupId) {
    if (a.groupId === b.groupId) return draft;
    // The first group's label and rest win; the second's row goes.
    return pruneGroups({
      groups: draft.groups,
      exercises: assign(draft.exercises, b.groupId, a.groupId),
    });
  }

  if (a.groupId) {
    return {
      groups: draft.groups,
      exercises: draft.exercises.map((e, i) =>
        i === index + 1 ? { ...e, groupId: a.groupId } : e,
      ),
    };
  }

  if (b.groupId) {
    return {
      groups: draft.groups,
      exercises: draft.exercises.map((e, i) =>
        i === index ? { ...e, groupId: b.groupId } : e,
      ),
    };
  }

  const group = newGroup();
  return {
    groups: [...draft.groups, group],
    exercises: draft.exercises.map((e, i) =>
      i === index || i === index + 1 ? { ...e, groupId: group.id } : e,
    ),
  };
}

export function joinWithPrevious(draft: Grouping, index: number): Grouping {
  return index <= 0 ? draft : joinWithNext(draft, index - 1);
}

/** Break the group apart, keeping every member and every set where it is. */
export function ungroup(draft: Grouping, groupId: string): Grouping {
  return pruneGroups({
    groups: draft.groups,
    exercises: assign(draft.exercises, groupId, null),
  });
}

/** Delete the group *and* the exercises in it — the destructive one. */
export function removeGroup(draft: Grouping, groupId: string): Grouping {
  return pruneGroups({
    groups: draft.groups,
    exercises: draft.exercises.filter((e) => e.groupId !== groupId),
  });
}

/** Drop one member; the group survives unless that was the last of them. */
export function removeMember(draft: Grouping, index: number): Grouping {
  return pruneGroups({
    groups: draft.groups,
    exercises: draft.exercises.filter((_, i) => i !== index),
  });
}

/** A new blank member, placed at the end of the group's span so it stays contiguous. */
export function addMember(draft: Grouping, groupId: string): Grouping {
  const last = draft.exercises.reduce(
    (found, e, i) => (e.groupId === groupId ? i : found),
    -1,
  );
  if (last === -1) return draft;

  const block: DraftExercise = { ...emptyDraftBlock(), groupId };
  const exercises = [...draft.exercises];
  exercises.splice(last + 1, 0, block);
  return { groups: draft.groups, exercises };
}

export function patchGroup(
  draft: Grouping,
  groupId: string,
  patch: Partial<Omit<DraftGroup, "id">>,
): Grouping {
  return {
    groups: draft.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    exercises: draft.exercises,
  };
}

/**
 * Run a round operation over a group's members and splice the result back into the flat
 * list. The members keep their positions, so contiguity survives the round math.
 */
export function withMembers(
  draft: Grouping,
  groupId: string,
  update: (members: DraftExercise[]) => DraftExercise[],
): Grouping {
  const indexes = draft.exercises.flatMap((e, i) => (e.groupId === groupId ? [i] : []));
  if (indexes.length === 0) return draft;

  const updated = update(indexes.map((i) => draft.exercises[i]));
  const exercises = [...draft.exercises];
  indexes.forEach((target, j) => {
    if (updated[j]) exercises[target] = updated[j];
  });
  return { groups: draft.groups, exercises };
}
