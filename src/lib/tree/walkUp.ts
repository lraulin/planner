/**
 * Yield the starting node and each ancestor, nearest first.
 *
 * A parent cycle cannot be built through normal mutations (`moveNode` refuses them), but a
 * corrupt import or hand-edited row must cost a wrong answer rather than a hung tab.
 * Every upward walk in the UI path should use this so that insurance lives in one place.
 *
 * Generic over anything with `id` + `parentId` so DnD, zoom, and the outline share one loop.
 */
export function* walkUp<T extends { id: string; parentId: string | null }>(
  start: T | undefined,
  byId: ReadonlyMap<string, T>,
): Generator<T, void, void> {
  const seen = new Set<string>();
  let cur = start;
  while (cur) {
    if (seen.has(cur.id)) return;
    seen.add(cur.id);
    yield cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
}

/**
 * Ancestors that currently hide `nodeId` — the ones View in Outline must expand so
 * the row is actually on screen. Self is never included: collapsing the target does
 * not hide it.
 *
 * Unknown id → empty. Same cycle insurance as `walkUp`.
 */
export function collapsedAncestorIds<
  T extends { id: string; parentId: string | null; collapsed: boolean },
>(nodes: readonly T[], nodeId: string): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const start = byId.get(nodeId);
  if (!start) return [];
  const ids: string[] = [];
  for (const ancestor of walkUp(start, byId)) {
    if (ancestor.id === nodeId) continue;
    if (ancestor.collapsed) ids.push(ancestor.id);
  }
  return ids;
}
