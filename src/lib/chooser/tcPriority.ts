import type { PriorityLetter } from "@/db/schema";
import {
  letterRankEngine,
  PRIORITY_LETTERS,
  type LetterAssignment,
  type LetterDropZone,
} from "@/lib/priority/letterRank";
import type { OutlineNode } from "@/lib/tree/types";

/**
 * Task Chooser priority — the flat, hand-maintained ranking across every currently
 * available task, in the spirit of a Franklin Covey master task list.
 *
 * The outline's own priority is **relative to siblings**: "the second most important task
 * in this project". This one is **relative to everything you could do right now**: "the
 * second most important thing available". Those routinely disagree, which is why it is a
 * separate field (`nodes.tcPriorityLetter` / `tcPriorityRank`) and why dragging here never
 * touches the outline.
 *
 * The ranking *rules* live in `src/lib/priority/letterRank.ts`, shared with the daily task
 * list, which ranks a different question with the same mechanics. This module is the
 * adapter that binds them to the node fields and to `nodeId`-shaped assignments.
 */

export const TC_LETTERS: PriorityLetter[] = PRIORITY_LETTERS;

/** One node's new place in the ranking, ready to persist. */
export type TcAssignment = {
  nodeId: string;
  letter: PriorityLetter | null;
  rank: number | null;
};

/** Anything carrying a TC priority. Keeps these helpers usable from tests and the grid. */
type Ranked = Pick<OutlineNode, "id" | "tcPriorityLetter" | "tcPriorityRank">;

/** Where a drop lands relative to the target row. Mirrors the grid's own drop zones. */
export type TcDropZone = LetterDropZone;

const engine = letterRankEngine<Ranked>((node) => ({
  letter: node.tcPriorityLetter,
  rank: node.tcPriorityRank,
}));

function toTc(assignments: LetterAssignment[]): TcAssignment[] {
  return assignments.map(({ id, letter, rank }) => ({ nodeId: id, letter, rank }));
}

/**
 * Order two nodes by TC priority: letter first, then rank. Unranked nodes sort **after**
 * every ranked one and tie with each other, which the chooser breaks by score.
 */
export function compareTcPriority(a: Ranked, b: Ranked): number {
  return engine.compare(a, b);
}

/** Every node carrying `letter`, in rank order, excluding `excludeId`. */
export function itemsInLetter(
  nodes: Ranked[],
  letter: PriorityLetter,
  excludeId?: string,
): Ranked[] {
  return engine.itemsInLetter(nodes, letter, excludeId);
}

/**
 * Move one or more nodes to sit `zone` of `targetId`, renumbering both the letter they
 * leave and the letter they join. Multi-drag passes a block; dropping onto an unranked
 * row unranks every dragged node.
 */
export function planTcDrop(
  nodes: Ranked[],
  dragId: string | readonly string[],
  targetId: string,
  zone: TcDropZone,
): TcAssignment[] {
  return toTc(engine.planDrop(nodes, dragId, targetId, zone));
}

/**
 * Drop onto a letter's group header: the node(s) become that letter's top ranks and
 * everything below shifts down. The only way to reach an empty letter.
 */
export function planTcDropOnLetter(
  nodes: Ranked[],
  dragId: string | readonly string[],
  letter: PriorityLetter,
): TcAssignment[] {
  return toTc(engine.planDropOnLetter(nodes, dragId, letter));
}

/** Assign by typing: bare letter appends, `A1` inserts and pushes down, `null` unranks. */
export function planTcAssign(
  nodes: Ranked[],
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): TcAssignment[] {
  return toTc(engine.planAssign(nodes, nodeId, letter, rank));
}

/** Drop out of the ranking, closing the gap left behind. Multi-drag passes a block. */
export function planTcClear(
  nodes: Ranked[],
  nodeId: string | readonly string[],
): TcAssignment[] {
  return toTc(engine.planClear(nodes, nodeId));
}
