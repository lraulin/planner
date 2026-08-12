import { isSettled } from "./completionCascade";
import type { OutlineNode } from "./types";

/**
 * The Projects grid's "Tasks" column: open tasks over all tasks under a project
 * (`3/7`). Empty when the project has no tasks at all — a blank cell, not `0/0`.
 *
 * Counts every task in the **subtree**, not only direct children: a project whose work is
 * filed under sub-projects still needs one number, and a direct-only walk would under-count
 * as soon as anyone nested a task one level deeper.
 *
 * Pure, and lives next to the other tree walks, so a wrong walk can be caught without
 * mounting the grid. "Active" means not settled (`isSettled`) — the same finished pair the
 * rest of the app uses, so this column cannot invent a third definition of open work.
 */
export function taskRatio(projectId: string, nodes: readonly OutlineNode[]): string {
  let total = 0;
  let active = 0;
  const byParent = new Map<string | null, OutlineNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const stack = [...(byParent.get(projectId) ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "task") {
      total += 1;
      if (!isSettled(node.state)) active += 1;
    }
    for (const child of byParent.get(node.id) ?? []) stack.push(child);
  }
  if (total === 0) return "";
  return `${active}/${total}`;
}
