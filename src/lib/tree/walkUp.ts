import type { OutlineNode } from "./types";

/**
 * Yield the starting node and each ancestor, nearest first.
 *
 * A parent cycle cannot be built through normal mutations (`moveNode` refuses them), but a
 * corrupt import or a hand-edited row must cost a wrong answer rather than a hung tab.
 * Every upward walk in the UI path should use this so that insurance lives in one place.
 */
export function* walkUp(
  start: OutlineNode | undefined,
  byId: Map<string, OutlineNode>,
): Generator<OutlineNode, void, void> {
  const seen = new Set<string>();
  let cur = start;
  while (cur) {
    if (seen.has(cur.id)) return;
    seen.add(cur.id);
    yield cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
}
