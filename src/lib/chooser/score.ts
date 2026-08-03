import type { PriorityLetter } from "@/db/schema";
import { dayString, daysBetween } from "./dates";

/**
 * The Task Chooser's scoring formula.
 *
 * The manual (§8) names the factors — weighted priority including ancestors, deadline
 * proximity, target start/end proximity, a Focus bonus — but never publishes the
 * arithmetic. So we define one, additively, with every band a named weight the Settings
 * dialog can move. The total is rendered in a Score column: an ordering nobody can inspect
 * is one nobody will trust.
 *
 * Pure and free of `new Date()` — `today` arrives as `YYYY-MM-DD` from the caller, exactly
 * as `scheduleStatus()` already takes it, and is `null` on the server and before
 * hydration. A null `today` means "no date information": every date term scores zero, so
 * the server render and the first client paint agree and only the ranking's date component
 * settles in once the client knows what day it is.
 */

export type ChooserWeights = {
  /** Points for an A-priority item before its rank is subtracted. */
  priorityTop: number;
  /** Points dropped per letter: A → B → C → D. */
  priorityLetterStep: number;
  /** Points dropped per rank inside a letter, so A1 > A2 but A9 still beats B1. */
  priorityRankStep: number;

  /** Deadline (own or inherited) already past. */
  deadlineOverdue: number;
  deadlineToday: number;
  deadlineTomorrow: number;
  /** Flat bonus for a deadline inside `deadlineSoonDays`. */
  deadlineSoon: number;
  deadlineSoonDays: number;

  /** Target end date already past — work that has slipped. */
  targetEndPast: number;
  /** Target start date reached, so the work is meant to be underway. */
  targetStartReached: number;
  /**
   * Penalty when target start is still in the future (Achieve: future start demotes score).
   * Applied once for any future start; not scaled by how far out.
   */
  targetStartFuture: number;

  /**
   * Achieve's Focus flag (§3.10). Kept **below `priorityLetterStep`** in the defaults, so
   * focusing an item reorders it among its peers without promoting it past a whole
   * priority letter — a thumb on the scale, not a reprioritisation. Raise it past the
   * letter step in Settings if you want Focus to dominate.
   */
  focusBonus: number;

  /** Multiplied by the result area's 0–100 Importance. */
  importanceWeight: number;
};

/**
 * Bare letter (no rank) sorts **after** every ranked rank of that letter — Achieve's
 * outline priority rule. Scored as if rank were just past the spinner max.
 */
export const UNRANKED_RANK = 10;

/** Highest rank Achieve's rank spinner reaches; used to keep a letter's band from bleeding. */
const MAX_RANK = 9;

export const DEFAULT_WEIGHTS: ChooserWeights = {
  priorityTop: 100,
  priorityLetterStep: 20,
  priorityRankStep: 2,

  deadlineOverdue: 120,
  deadlineToday: 90,
  deadlineTomorrow: 60,
  deadlineSoon: 30,
  deadlineSoonDays: 7,

  targetEndPast: 25,
  targetStartReached: 10,
  targetStartFuture: 15,

  focusBonus: 15,

  importanceWeight: 0.2,
};

/** Everything the formula needs about one item, gathered by one ancestor walk. */
export type ScoreFacts = {
  /** Inherited priority (L.A.P.) — `derive()` computes it; see the note on `priorityScore`. */
  lapLetter: PriorityLetter | null;
  lapRank: number | null;
  focus: boolean;
  /** Earliest deadline on the item or any ancestor. */
  effectiveDeadline: Date | null;
  targetStart: Date | null;
  targetEnd: Date | null;
  /** Importance of the nearest result-area ancestor, 0–100. */
  areaImportance: number;
};

const LETTER_INDEX: Record<PriorityLetter, number> = { A: 0, B: 1, C: 2, D: 3 };

/**
 * Priority term, read off **L.A.P.** (inherited priority) rather than the item's own
 * letter. That is what produces the manual's rule that "sub-item priority ranks are
 * relative to the parent": reprioritising a project moves every task under it, and an
 * unprioritised task under an A1 project still outranks one under a C project.
 *
 * `priorityRankStep * MAX_RANK` stays below `priorityLetterStep` in the defaults, so the
 * worst A still beats the best B — ranks refine a letter, they do not cross it. Unranked
 * (bare letter) is worse than A9 but still beats B1.
 */
export function priorityScore(
  letter: PriorityLetter | null,
  rank: number | null,
  weights: ChooserWeights,
): number {
  if (letter === null) return 0;
  // Null rank → after every spinner rank. Numeric ranks clamp to 1..MAX_RANK so a stray
  // 50 cannot equal bare-letter scoring or cross into the next letter.
  const effectiveRank =
    rank === null ? UNRANKED_RANK : Math.min(Math.max(rank, 1), MAX_RANK);
  return (
    weights.priorityTop -
    LETTER_INDEX[letter] * weights.priorityLetterStep -
    (effectiveRank - 1) * weights.priorityRankStep
  );
}

/**
 * Deadline term. Bands rather than a curve, so what the number means stays sayable:
 * overdue, today, tomorrow, soon, or not yet worth thinking about.
 */
export function deadlineScore(
  deadline: Date | null,
  today: string | null,
  weights: ChooserWeights,
): number {
  if (!deadline || !today) return 0;

  const daysOut = daysBetween(today, dayString(deadline));

  if (daysOut < 0) return weights.deadlineOverdue;
  if (daysOut === 0) return weights.deadlineToday;
  if (daysOut === 1) return weights.deadlineTomorrow;
  if (daysOut <= weights.deadlineSoonDays) return weights.deadlineSoon;
  return 0;
}

/**
 * Target-date term. Halves are independent and add: past end, start reached, or future
 * start penalty (Achieve demotes work that is not yet meant to begin).
 */
export function targetDateScore(
  targetStart: Date | null,
  targetEnd: Date | null,
  today: string | null,
  weights: ChooserWeights,
): number {
  if (!today) return 0;
  let total = 0;

  if (targetEnd && daysBetween(today, dayString(targetEnd)) < 0) {
    total += weights.targetEndPast;
  }
  if (targetStart) {
    const startOut = daysBetween(today, dayString(targetStart));
    if (startOut <= 0) total += weights.targetStartReached;
    else total -= weights.targetStartFuture;
  }

  return total;
}

/**
 * The whole formula. Rounded, because the Score column shows it and a trailing `.4` from
 * the importance term would be noise.
 */
export function scoreItem(
  facts: ScoreFacts,
  today: string | null,
  weights: ChooserWeights,
): number {
  return Math.round(
    priorityScore(facts.lapLetter, facts.lapRank, weights) +
      deadlineScore(facts.effectiveDeadline, today, weights) +
      targetDateScore(facts.targetStart, facts.targetEnd, today, weights) +
      (facts.focus ? weights.focusBonus : 0) +
      facts.areaImportance * weights.importanceWeight,
  );
}
