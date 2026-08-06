import type { OutlineNode } from "./types";

/**
 * The nearest project at or above a row — what `View project…` opens.
 *
 * **At or above**, not strictly above: right-clicking a project and asking to view the project
 * means this one, not the subproject's parent. Achieve's `View Project…` behaved the same way,
 * and the alternative greys the command on exactly the rows where it is most obvious.
 *
 * Subprojects mean the walk stops at the *first* project going up, so a task under
 * `Website → Phase 2` opens Phase 2 rather than Website. That is the project the task is filed
 * in; the one above it is where you would go next, and one step is what the command promises.
 *
 * Returns `null` for a row filed directly under a goal or result area — a real state, and the
 * reason the command is disabled with a sentence rather than hidden.
 */
export function owningProjectId(
  nodes: readonly OutlineNode[],
  id: string | null,
): string | null {
  if (!id) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  let current = byId.get(id);
  // A cycle cannot happen — `moveNode` rejects them server-side — but a bounded walk means a
  // corrupt row costs a wrong answer rather than a hung tab.
  for (let depth = 0; current && depth <= nodes.length; depth++) {
    if (current.type === "project") return current.id;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}
