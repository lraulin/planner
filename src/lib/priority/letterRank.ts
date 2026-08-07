import type { PriorityLetter } from "@/db/schema";
import { comparePriorityOrder, rankOrderValue } from "./order";

/**
 * A hand-maintained ABCD ranking over a flat list, in the spirit of a Franklin Covey
 * priority column.
 *
 * Two lists in this app rank things this way and they are not the same list: the Task
 * Chooser's To-do view ranks everything you *could* do (`nodes.tcPriorityLetter`), and a
 * day's task list ranks what you have decided to do *today* (`dailyItems.priorityLetter`).
 * The rules are identical — the fields they live in are not — so the rules live here once
 * and each caller binds its own accessor.
 *
 * Two invariants callers can rely on:
 *
 * 1. **Ranks are dense.** Within a letter they run 1..n with no gaps and no ties. Gaps do
 *    appear when a ranked item is completed — nothing renumbers under you while you work —
 *    and the next drop into that letter cleans them up.
 * 2. **A letter always carries a rank.** There is no bare "A" here, unlike the outline's
 *    priority. Assigning a letter places the item somewhere in that letter's order, so
 *    there is always a number to show.
 *
 * Pure: every function takes the items it needs and returns assignments to persist. No
 * database, no `Date`.
 */

export const PRIORITY_LETTERS: PriorityLetter[] = ["A", "B", "C", "D"];

/** Where an item currently sits in the ranking. */
export type LetterRank = {
  letter: PriorityLetter | null;
  rank: number | null;
};

/** One item's new place in the ranking, ready to persist. */
export type LetterAssignment = LetterRank & { id: string };

/** Where a drop lands relative to the target row. Mirrors the grid's own drop zones. */
export type LetterDropZone = "before" | "after";

/**
 * Binds the ranking rules to one list's field names.
 *
 * `read` is the only thing that varies between callers: it pulls the letter and rank out of
 * whatever shape that list stores them in.
 */
export function letterRankEngine<T extends { id: string }>(
  read: (item: T) => LetterRank,
) {
  /**
   * Order inside one letter: by rank, with a **bare** letter last. Same rule the grids sort
   * on (`lib/priority/order`), which is what keeps a drop pool in the order the user is
   * looking at — put bare first here and dropping onto the top B would renumber the row
   * displayed at the bottom of the Bs.
   *
   * A no-op for the Task Chooser and day lists, where a letter always carries a rank.
   */
  function byRank(a: T, b: T): number {
    return rankOrderValue(read(a).rank) - rankOrderValue(read(b).rank);
  }

  /**
   * Every item carrying `letter`, in rank order, excluding `excludeId`.
   *
   * Reads the **whole** list rather than whatever the grid is showing. A date filter or a
   * search must never cause a renumber that only accounts for visible rows — that would
   * silently collapse the ranks of everything hidden.
   */
  function itemsInLetter(items: T[], letter: PriorityLetter, excludeId?: string): T[] {
    return items
      .filter((item) => read(item).letter === letter && item.id !== excludeId)
      .sort(byRank);
  }

  /**
   * Renumber a letter's members densely from 1, emitting only the ones whose rank actually
   * moves. Keeping the diff minimal matters: this is what gets written to the database, and
   * a drag at the bottom of a long A list should not rewrite every row above it.
   */
  function renumber(ordered: T[], letter: PriorityLetter): LetterAssignment[] {
    const out: LetterAssignment[] = [];
    ordered.forEach((item, index) => {
      const rank = index + 1;
      const current = read(item);
      if (current.letter === letter && current.rank === rank) return;
      out.push({ id: item.id, letter, rank });
    });
    return out;
  }

  /**
   * When an item leaves a letter, close the gap it left. No-op when it never had a letter
   * or is staying put — that is what keeps a reorder *within* a letter from touching
   * anything outside it.
   */
  function compactSourceLetter(
    items: T[],
    moved: T,
    destination: PriorityLetter,
  ): LetterAssignment[] {
    const source = read(moved).letter;
    if (source === null || source === destination) return [];
    return renumber(itemsInLetter(items, source, moved.id), source);
  }

  /** Drop out of the ranking, closing the gap left behind. Accepts one id or a block. */
  function planClear(items: T[], id: string | readonly string[]): LetterAssignment[] {
    const ids = Array.isArray(id) ? [...id] : [id];
    if (ids.length === 0) return [];

    const dragSet = new Set(ids);
    const out: LetterAssignment[] = [];
    const sources = new Set<PriorityLetter>();

    for (const dragId of ids) {
      const item = items.find((entry) => entry.id === dragId);
      if (!item) continue;
      const letter = read(item).letter;
      if (letter === null) continue;
      sources.add(letter);
      out.push({ id: dragId, letter: null, rank: null });
    }

    for (const letter of sources) {
      out.push(
        ...renumber(
          items
            .filter((item) => read(item).letter === letter && !dragSet.has(item.id))
            .sort(byRank),
          letter,
        ),
      );
    }
    return out;
  }

  /**
   * Move one or more items as a contiguous block to sit `zone` of `targetId`.
   *
   * Display order of `dragIds` is preserved in the landing letter. Dropping onto a member
   * of the drag set is a no-op. Dropping onto an **unranked** row unranks every dragged
   * item.
   *
   * Single-id calls keep the historical behaviour; multi is the multi-drag path.
   */
  function planDrop(
    items: T[],
    dragId: string | readonly string[],
    targetId: string,
    zone: LetterDropZone,
  ): LetterAssignment[] {
    const dragIds = Array.isArray(dragId) ? [...dragId] : [dragId];
    if (dragIds.length === 0) return [];
    if (dragIds.includes(targetId)) return [];

    const dragSet = new Set(dragIds);
    const dragged = dragIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is T => item != null);
    if (dragged.length !== dragIds.length) return [];

    const target = items.find((item) => item.id === targetId);
    if (!target) return [];

    const destination = read(target).letter;
    if (destination === null) return planClear(items, dragIds);

    const members = items
      .filter((item) => read(item).letter === destination && !dragSet.has(item.id))
      .sort(byRank);
    const targetIndex = members.findIndex((item) => item.id === targetId);
    if (targetIndex === -1) return [];

    const insertAt = zone === "before" ? targetIndex : targetIndex + 1;
    members.splice(insertAt, 0, ...dragged);

    return [
      ...renumber(members, destination),
      ...compactSources(items, dragged, destination, dragSet),
    ];
  }

  /**
   * Drop onto a letter's group header: the dragged items become that letter's top ranks
   * (in drag order) and everything below shifts down.
   */
  function planDropOnLetter(
    items: T[],
    dragId: string | readonly string[],
    letter: PriorityLetter,
  ): LetterAssignment[] {
    const dragIds = Array.isArray(dragId) ? [...dragId] : [dragId];
    if (dragIds.length === 0) return [];

    const dragSet = new Set(dragIds);
    const dragged = dragIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is T => item != null);
    if (dragged.length !== dragIds.length) return [];

    const members = items
      .filter((item) => read(item).letter === letter && !dragSet.has(item.id))
      .sort(byRank);
    members.unshift(...dragged);

    return [
      ...renumber(members, letter),
      ...compactSources(items, dragged, letter, dragSet),
    ];
  }

  /**
   * Close gaps in every letter a moved block left, once per letter — multi-drag must not
   * renumber the same source letter once per item.
   */
  function compactSources(
    items: T[],
    dragged: T[],
    destination: PriorityLetter,
    dragSet: Set<string>,
  ): LetterAssignment[] {
    const sources = new Set<PriorityLetter>();
    for (const item of dragged) {
      const source = read(item).letter;
      if (source !== null && source !== destination) sources.add(source);
    }
    const out: LetterAssignment[] = [];
    for (const source of sources) {
      out.push(
        ...renumber(
          items
            .filter((item) => read(item).letter === source && !dragSet.has(item.id))
            .sort(byRank),
          source,
        ),
      );
    }
    return out;
  }

  /**
   * Assign by typing, the keyboard path onto the same rules.
   *
   * - `"A"` (no rank) appends to the end of A — you know it is an A, not yet where in A.
   * - `"A1"` inserts at that position and pushes the rest down; a rank past the end clamps
   *   to the end rather than leaving a gap.
   * - `null` unranks.
   */
  function planAssign(
    items: T[],
    id: string,
    letter: PriorityLetter | null,
    rank: number | null,
  ): LetterAssignment[] {
    if (letter === null) return planClear(items, id);

    const dragged = items.find((item) => item.id === id);
    if (!dragged) return [];

    const members = itemsInLetter(items, letter, id);
    // A bare letter means "somewhere in this letter" — the end is the honest answer.
    const requested = rank === null ? members.length + 1 : rank;
    const insertAt = Math.min(Math.max(requested, 1), members.length + 1) - 1;
    members.splice(insertAt, 0, dragged);

    return [
      ...renumber(members, letter),
      ...compactSourceLetter(items, dragged, letter),
    ];
  }

  /**
   * Order two items: letter first, then rank, with a bare letter after that letter's ranked
   * items — one rule, shared with the grids (`lib/priority/order`). Unlettered items sort
   * **after** every lettered one and tie with each other, leaving the caller free to break
   * that tie however the view wants (the chooser uses score; a day list uses insertion
   * order).
   */
  function compare(a: T, b: T): number {
    return comparePriorityOrder(read(a), read(b));
  }

  return { compare, itemsInLetter, planAssign, planClear, planDrop, planDropOnLetter };
}
