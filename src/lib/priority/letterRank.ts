import type { PriorityLetter } from "@/db/schema";

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

const LETTER_INDEX: Record<PriorityLetter, number> = { A: 0, B: 1, C: 2, D: 3 };

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
   * Every item carrying `letter`, in rank order, excluding `excludeId`.
   *
   * Reads the **whole** list rather than whatever the grid is showing. A date filter or a
   * search must never cause a renumber that only accounts for visible rows — that would
   * silently collapse the ranks of everything hidden.
   */
  function itemsInLetter(items: T[], letter: PriorityLetter, excludeId?: string): T[] {
    return items
      .filter((item) => read(item).letter === letter && item.id !== excludeId)
      .sort((a, b) => (read(a).rank ?? 0) - (read(b).rank ?? 0));
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

  /** Drop out of the ranking, closing the gap left behind. */
  function planClear(items: T[], id: string): LetterAssignment[] {
    const item = items.find((entry) => entry.id === id);
    if (!item) return [];

    const letter = read(item).letter;
    if (letter === null) return [];

    return [
      { id, letter: null, rank: null },
      ...renumber(itemsInLetter(items, letter, id), letter),
    ];
  }

  /**
   * Move `dragId` to sit `zone` of `targetId`, renumbering both the letter it leaves and
   * the letter it joins.
   *
   * Dropping onto a row in a different letter changes the item's letter — that is how you
   * demote an A2 to a B. Dropping onto an **unranked** row unranks the dragged item, which
   * is the drag equivalent of clearing the cell.
   *
   * Returns every assignment to persist, or `[]` when the drop is a no-op.
   */
  function planDrop(
    items: T[],
    dragId: string,
    targetId: string,
    zone: LetterDropZone,
  ): LetterAssignment[] {
    if (dragId === targetId) return [];

    const dragged = items.find((item) => item.id === dragId);
    const target = items.find((item) => item.id === targetId);
    if (!dragged || !target) return [];

    const destination = read(target).letter;

    // Dropped among the unranked: leave the ranking entirely.
    if (destination === null) return planClear(items, dragId);

    const members = itemsInLetter(items, destination, dragId);
    const targetIndex = members.findIndex((item) => item.id === targetId);
    if (targetIndex === -1) return [];

    const insertAt = zone === "before" ? targetIndex : targetIndex + 1;
    members.splice(insertAt, 0, dragged);

    return [
      ...renumber(members, destination),
      ...compactSourceLetter(items, dragged, destination),
    ];
  }

  /**
   * Drop onto a letter's group header: the item becomes that letter's **rank 1** and
   * everything below shifts down.
   *
   * The header sits above the group's rows, so "on the header" reads as "above them all".
   * It is also the only way to reach an empty letter, which is exactly the case the user
   * hits first: drag onto A when nothing is an A, and it becomes A1.
   */
  function planDropOnLetter(
    items: T[],
    dragId: string,
    letter: PriorityLetter,
  ): LetterAssignment[] {
    const dragged = items.find((item) => item.id === dragId);
    if (!dragged) return [];

    const members = itemsInLetter(items, letter, dragId);
    members.unshift(dragged);

    return [
      ...renumber(members, letter),
      ...compactSourceLetter(items, dragged, letter),
    ];
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
   * Order two items: letter first, then rank. Unranked items sort **after** every ranked
   * one and tie with each other, leaving the caller free to break that tie however the view
   * wants (the chooser uses score; a day list uses insertion order).
   */
  function compare(a: T, b: T): number {
    const left = read(a);
    const right = read(b);

    if (left.letter === null && right.letter === null) return 0;
    if (left.letter === null) return 1;
    if (right.letter === null) return -1;

    if (left.letter !== right.letter) {
      return LETTER_INDEX[left.letter] - LETTER_INDEX[right.letter];
    }
    return (left.rank ?? 0) - (right.rank ?? 0);
  }

  return { compare, itemsInLetter, planAssign, planClear, planDrop, planDropOnLetter };
}
