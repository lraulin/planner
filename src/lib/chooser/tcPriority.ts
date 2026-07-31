import type { PriorityLetter } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";

/**
 * Task Chooser priority — the flat, hand-maintained ranking across every currently
 * available task, in the spirit of a Franklin Covey daily list.
 *
 * The outline's own priority is **relative to siblings**: "the second most important task
 * in this project". This one is **relative to everything you could do right now**: "the
 * second most important thing today". Those routinely disagree, which is why it is a
 * separate field (`nodes.tcPriorityLetter` / `tcPriorityRank`) and why dragging here never
 * touches the outline.
 *
 * Two invariants the rest of the app can rely on:
 *
 * 1. **Ranks are dense.** Within a letter they run 1..n with no gaps and no ties. Gaps do
 *    appear when a ranked task is completed — nothing renumbers under you while you work —
 *    and the next drop into that letter cleans them up.
 * 2. **A letter always carries a rank.** There is no bare "A" here, unlike the outline's
 *    priority. Assigning a letter places the item somewhere in that letter's order, so
 *    there is always a number to show.
 *
 * Pure: every function takes the nodes it needs and returns assignments to persist. No
 * database, no `Date`.
 */

export const TC_LETTERS: PriorityLetter[] = ["A", "B", "C", "D"];

const LETTER_INDEX: Record<PriorityLetter, number> = { A: 0, B: 1, C: 2, D: 3 };

/** One node's new place in the ranking, ready to persist. */
export type TcAssignment = {
  nodeId: string;
  letter: PriorityLetter | null;
  rank: number | null;
};

/** Anything carrying a TC priority. Keeps these helpers usable from tests and the grid. */
type Ranked = Pick<OutlineNode, "id" | "tcPriorityLetter" | "tcPriorityRank">;

/**
 * Order two items by TC priority: letter first, then rank. Unranked items sort **after**
 * every ranked one and tie with each other, leaving the caller free to break that tie
 * however the view wants (the chooser uses score).
 */
export function compareTcPriority(a: Ranked, b: Ranked): number {
  const aLetter = a.tcPriorityLetter;
  const bLetter = b.tcPriorityLetter;

  if (aLetter === null && bLetter === null) return 0;
  if (aLetter === null) return 1;
  if (bLetter === null) return -1;

  if (aLetter !== bLetter) return LETTER_INDEX[aLetter] - LETTER_INDEX[bLetter];
  return (a.tcPriorityRank ?? 0) - (b.tcPriorityRank ?? 0);
}

/**
 * Every node carrying `letter`, in rank order, excluding `excludeId`.
 *
 * Reads the **whole** node list rather than whatever the grid is showing. A date filter or
 * a search must never cause a renumber that only accounts for visible rows — that would
 * silently collapse the ranks of everything hidden.
 */
export function itemsInLetter(
  nodes: Ranked[],
  letter: PriorityLetter,
  excludeId?: string,
): Ranked[] {
  return nodes
    .filter((node) => node.tcPriorityLetter === letter && node.id !== excludeId)
    .sort((a, b) => (a.tcPriorityRank ?? 0) - (b.tcPriorityRank ?? 0));
}

/**
 * Renumber a letter's members densely from 1, emitting only the ones whose rank actually
 * moves. Keeping the diff minimal matters: this is what gets written to the database, and
 * a drag at the bottom of a long A list should not rewrite every row above it.
 */
function renumber(ordered: Ranked[], letter: PriorityLetter): TcAssignment[] {
  const out: TcAssignment[] = [];
  ordered.forEach((node, index) => {
    const rank = index + 1;
    if (node.tcPriorityLetter === letter && node.tcPriorityRank === rank) return;
    out.push({ nodeId: node.id, letter, rank });
  });
  return out;
}

/** Where a drop lands relative to the target row. Mirrors the grid's own drop zones. */
export type TcDropZone = "before" | "after";

/**
 * Move `dragId` to sit `zone` of `targetId`, renumbering both the letter it leaves and the
 * letter it joins.
 *
 * Dropping onto a row in a different letter changes the item's letter — that is how you
 * demote an A2 to a B. Dropping onto an **unranked** row unranks the dragged item, which
 * is the drag equivalent of clearing the cell.
 *
 * Returns every assignment to persist, or `[]` when the drop is a no-op.
 */
export function planTcDrop(
  nodes: Ranked[],
  dragId: string,
  targetId: string,
  zone: TcDropZone,
): TcAssignment[] {
  if (dragId === targetId) return [];

  const dragged = nodes.find((node) => node.id === dragId);
  const target = nodes.find((node) => node.id === targetId);
  if (!dragged || !target) return [];

  const destination = target.tcPriorityLetter;

  // Dropped among the unranked: leave the ranking entirely.
  if (destination === null) return planTcClear(nodes, dragId);

  const members = itemsInLetter(nodes, destination, dragId);
  const targetIndex = members.findIndex((node) => node.id === targetId);
  if (targetIndex === -1) return [];

  const insertAt = zone === "before" ? targetIndex : targetIndex + 1;
  members.splice(insertAt, 0, dragged);

  return [
    ...renumber(members, destination),
    ...compactSourceLetter(nodes, dragged, destination),
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
export function planTcDropOnLetter(
  nodes: Ranked[],
  dragId: string,
  letter: PriorityLetter,
): TcAssignment[] {
  const dragged = nodes.find((node) => node.id === dragId);
  if (!dragged) return [];

  const members = itemsInLetter(nodes, letter, dragId);
  members.unshift(dragged);

  return [...renumber(members, letter), ...compactSourceLetter(nodes, dragged, letter)];
}

/**
 * Assign by typing, the keyboard path onto the same rules.
 *
 * - `"A"` (no rank) appends to the end of A — you know it is an A, not yet where in A.
 * - `"A1"` inserts at that position and pushes the rest down; a rank past the end clamps
 *   to the end rather than leaving a gap.
 * - `null` unranks.
 */
export function planTcAssign(
  nodes: Ranked[],
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): TcAssignment[] {
  if (letter === null) return planTcClear(nodes, nodeId);

  const dragged = nodes.find((node) => node.id === nodeId);
  if (!dragged) return [];

  const members = itemsInLetter(nodes, letter, nodeId);
  // A bare letter means "somewhere in this letter" — the end is the honest answer.
  const requested = rank === null ? members.length + 1 : rank;
  const insertAt = Math.min(Math.max(requested, 1), members.length + 1) - 1;
  members.splice(insertAt, 0, dragged);

  return [...renumber(members, letter), ...compactSourceLetter(nodes, dragged, letter)];
}

/** Drop out of the ranking, closing the gap left behind. */
export function planTcClear(nodes: Ranked[], nodeId: string): TcAssignment[] {
  const node = nodes.find((entry) => entry.id === nodeId);
  if (!node || node.tcPriorityLetter === null) return [];

  const letter = node.tcPriorityLetter;
  return [
    { nodeId, letter: null, rank: null },
    ...renumber(itemsInLetter(nodes, letter, nodeId), letter),
  ];
}

/**
 * When an item leaves a letter, close the gap it left. No-op when it never had a letter or
 * is staying put — that is what keeps a reorder *within* a letter from touching anything
 * outside it.
 */
function compactSourceLetter(
  nodes: Ranked[],
  moved: Ranked,
  destination: PriorityLetter,
): TcAssignment[] {
  const source = moved.tcPriorityLetter;
  if (source === null || source === destination) return [];
  return renumber(itemsInLetter(nodes, source, moved.id), source);
}
