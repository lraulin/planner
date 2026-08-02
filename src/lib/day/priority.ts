import type { PriorityLetter } from "@/db/schema";
import {
  letterRankEngine,
  PRIORITY_LETTERS,
  type LetterAssignment,
  type LetterDropZone,
} from "@/lib/priority/letterRank";
import type { DailyItemView } from "./types";

/**
 * The day list's ABC ranking.
 *
 * Same mechanics as the Task Chooser's TC Priority (`src/lib/chooser/tcPriority.ts`) — both
 * bind `src/lib/priority/letterRank.ts` — but a different question. TC Priority ranks
 * everything you *could* do. This ranks what you have decided to do *today*: A is
 * essential, B is important, C is optional. A task can sensibly be a B on the master list
 * and an A1 today, which is exactly why the two are stored separately.
 */

export const DAY_LETTERS: PriorityLetter[] = PRIORITY_LETTERS;

export type DayDropZone = LetterDropZone;

/** One row's new place in the day's ranking, ready to persist. */
export type DayAssignment = LetterAssignment;

type Ranked = Pick<DailyItemView, "id" | "priorityLetter" | "priorityRank">;

const engine = letterRankEngine<Ranked>((item) => ({
  letter: item.priorityLetter,
  rank: item.priorityRank,
}));

/**
 * Order two rows: letter first, then rank, unranked last.
 *
 * Unranked rows tie here; the day list breaks that tie with `sortKey`, so a line you have
 * just jotted and not yet prioritized keeps the position you typed it in rather than
 * jumping around.
 */
export function compareDayPriority(a: Ranked, b: Ranked): number {
  return engine.compare(a, b);
}

/** Every row carrying `letter`, in rank order, excluding `excludeId`. */
export function itemsInDayLetter(
  items: Ranked[],
  letter: PriorityLetter,
  excludeId?: string,
): Ranked[] {
  return engine.itemsInLetter(items, letter, excludeId);
}

/** Move one or more rows to sit `zone` of `targetId`. Multi-drag passes a block. */
export function planDayDrop(
  items: Ranked[],
  dragId: string | readonly string[],
  targetId: string,
  zone: DayDropZone,
): DayAssignment[] {
  return engine.planDrop(items, dragId, targetId, zone);
}

/** Drop onto a letter header: the row(s) become that letter's top ranks. */
export function planDayDropOnLetter(
  items: Ranked[],
  dragId: string | readonly string[],
  letter: PriorityLetter,
): DayAssignment[] {
  return engine.planDropOnLetter(items, dragId, letter);
}

/** Assign by typing: bare letter appends, `A1` inserts and pushes down, `null` unranks. */
export function planDayAssign(
  items: Ranked[],
  id: string,
  letter: PriorityLetter | null,
  rank: number | null,
): DayAssignment[] {
  return engine.planAssign(items, id, letter, rank);
}

/** Drop out of the ranking, closing the gap left behind. Multi-drag passes a block. */
export function planDayClear(
  items: Ranked[],
  id: string | readonly string[],
): DayAssignment[] {
  return engine.planClear(items, id);
}

/**
 * The day list's full sort: priority first, then insertion order.
 *
 * Completed rows are **not** moved to the bottom. Franklin Covey's day page keeps a checked
 * item exactly where it was so the page reads as a record of the day rather than a queue
 * that reshuffles under you every time you tick something off.
 */
export function sortDayItems<T extends Ranked & { sortKey: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const byPriority = compareDayPriority(a, b);
    if (byPriority !== 0) return byPriority;
    return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
  });
}
