/**
 * The app's one "is this node inside that one?" check, in the two shapes callers need.
 *
 * Every reparenting path asks the same question before it writes — Outline drag, Move to…,
 * the row clipboard's paste, the Inbox organizer's filing, note nesting — and each one had
 * grown its own copy of the walk. Four of the five had dropped the same detail.
 *
 * **The visited set is not an optimization.** A `parent_id` cycle is reachable: ACHXML
 * import writes the parent link straight from the file's own `ParentTaskId` /
 * `ParentProjectId` without validating it (`lib/achieve/import.ts`), so a corrupt export
 * puts one in the database directly. `derive.ts` already chooses a truncated tree over a
 * hung tab for exactly that reason. Without the set these walks never terminate, and the
 * three that read the database do it by issuing unbounded queries inside an open
 * transaction — a pinned connection, not a slow page.
 *
 * A cycle answers `false` for any ancestor not on the ring, which is the safe direction:
 * the caller refuses nothing it should have allowed, and the ring itself is still caught
 * because the ancestor is reached before the walk closes.
 */

/** True when `nodeId` is `ancestorId` itself or sits somewhere beneath it, in memory. */
export function isSelfOrDescendantIn(
  byId: ReadonlyMap<string, { parentId: string | null }>,
  ancestorId: string,
  nodeId: string | null,
): boolean {
  const seen = new Set<string>();
  let current = nodeId;
  while (current !== null) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/**
 * The same question where the parent link has to be fetched.
 *
 * `parentOf` returns the row's parent id, or `undefined` when there is no such row —
 * which ends the walk as "not a descendant", the answer a missing destination deserves.
 * Taking the lookup as a function is also what lets the cycle case be tested without a
 * database.
 */
export async function isSelfOrDescendantVia(
  ancestorId: string,
  nodeId: string | null,
  parentOf: (id: string) => Promise<string | null | undefined>,
): Promise<boolean> {
  const seen = new Set<string>();
  let current = nodeId;
  while (current !== null) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = (await parentOf(current)) ?? null;
  }
  return false;
}

/**
 * Every id in the subtree rooted at `rootId`, breadth-first, including the root.
 *
 * The downward twin of the walks above, and it needs the visited set for the same reason —
 * `taskRatio.ts` spells the consequence out: unguarded this is not a crash but a hang. The
 * database walks are worse than the synchronous one it describes, because each turn of the
 * loop issues another query inside the caller's open transaction.
 *
 * `childrenOf` is handed one frontier and returns the rows parented to anything in it. Rows
 * already visited are dropped before the next round, so a `parent_id` ring terminates once
 * it closes rather than cycling forever.
 */
export async function subtreeIdsVia(
  rootId: string,
  childrenOf: (frontier: readonly string[]) => Promise<readonly { id: string }[]>,
): Promise<string[]> {
  const seen = new Set<string>([rootId]);
  let frontier: string[] = [rootId];

  while (frontier.length > 0) {
    const children = await childrenOf(frontier);
    frontier = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      frontier.push(child.id);
    }
  }

  return [...seen];
}
