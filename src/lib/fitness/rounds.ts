/**
 * Round operations for a group (superset / circuit / mechanical drop set).
 *
 * A round is a set index: round N is set N of every member. That is what lets rounds be
 * derived rather than stored, and it is also the invariant these functions exist to protect
 * — if a member's sets ever stopped lining up with the rounds, every logged number would be
 * attributed to the wrong round.
 *
 * Two consequences:
 * - **Adding a round levels the group.** Every member ends with the same set count, so no
 *   member can acquire a hole in the middle of its sets.
 * - **A member may stop early.** Trailing shortfall is honest data — you ran out of time on
 *   the last round — and renders as a gap rather than a missing row.
 */

import {
  emptySetForExercise,
  setFromPrevious,
  type DraftExercise,
  type DraftSet,
} from "./sessionDraft";
import { groupRounds } from "./sessionGroups";

export type RoundRow = {
  member: DraftExercise;
  /** Position within the group, not within the session. */
  memberIndex: number;
  /** Null when this member stopped before this round. */
  set: DraftSet | null;
  /** Index into `member.sets`; equals the zero-based round. */
  setIndex: number;
};

/** Rows for one round, one per member, in group order. */
export function roundRows(
  members: readonly DraftExercise[],
  round: number,
): RoundRow[] {
  return members.map((member, memberIndex) => ({
    member,
    memberIndex,
    set: member.sets[round] ?? null,
    setIndex: round,
  }));
}

/**
 * Append a round. Members that had stopped early are levelled up first with **blank**
 * sets — those are skipped rounds, not repeats of their last effort — and only the new
 * round copies the member's previous set.
 */
export function addRound(members: readonly DraftExercise[]): DraftExercise[] {
  const target = groupRounds(members) + 1;
  return members.map((member) => {
    const last = member.sets[member.sets.length - 1];
    const filler = Array.from({ length: target - 1 - member.sets.length }, () =>
      emptySetForExercise(member),
    );
    return {
      ...member,
      sets: [...member.sets, ...filler, setFromPrevious(last, member)],
    };
  });
}

/**
 * Drop one round from every member, keeping the rest aligned. A member never drops below a
 * single set — the editor always has a row to type into.
 */
export function removeRound(
  members: readonly DraftExercise[],
  round: number,
): DraftExercise[] {
  return members.map((member) => {
    if (round >= member.sets.length) return { ...member };
    const sets = member.sets.filter((_, i) => i !== round);
    return {
      ...member,
      sets: sets.length > 0 ? sets : [emptySetForExercise(member)],
    };
  });
}

/**
 * Give one member a row for a round it had stopped before — the gap cell's affordance.
 * Intervening rounds fill with blanks, which persist as skipped rounds rather than
 * collapsing and shifting later sets onto the wrong round.
 */
export function extendMemberTo(
  members: readonly DraftExercise[],
  memberIndex: number,
  round: number,
): DraftExercise[] {
  return members.map((member, i) => {
    if (i !== memberIndex || round < member.sets.length) return { ...member };
    const filler = Array.from({ length: round + 1 - member.sets.length }, () =>
      emptySetForExercise(member),
    );
    return { ...member, sets: [...member.sets, ...filler] };
  });
}
