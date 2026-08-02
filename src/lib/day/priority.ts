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
 * Whether a day line is settled work (done or deliberately not doing it).
 *
 * Both completed and cancelled stamp `completedAt` so the open-day unique index drops them
 * and they no longer forward. Cancelled is distinguished only by `state` (X vs check).
 */
export function isDayItemSettled(item: {
  state?: string;
  completedAt?: Date | null;
}): boolean {
  return (
    item.completedAt != null || item.state === "completed" || item.state === "cancelled"
  );
}

/**
 * The day list's full sort: open work first (by priority, then insertion order), settled
 * lines last.
 *
 * Completed and cancelled share the bottom of each priority group so finishing or dropping
 * a line does not leave a dead check in the middle of what you still mean to do. Within
 * open and settled, order is still priority then `sortKey`.
 */
export function sortDayItems<
  T extends Ranked & { sortKey: string; state?: string; completedAt?: Date | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aSettled = isDayItemSettled(a);
    const bSettled = isDayItemSettled(b);
    if (aSettled !== bSettled) return aSettled ? 1 : -1;
    const byPriority = compareDayPriority(a, b);
    if (byPriority !== 0) return byPriority;
    return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
  });
}
