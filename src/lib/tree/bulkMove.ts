import type { NodeType } from "@/db/schema";
import { canNest, TYPE_LABELS } from "./hierarchy";
import type { OutlineNode } from "./types";

export type BulkMoveSkip = { id: string; name: string; reason: string };

export type BulkMovePlan = {
  legal: string[];
  skipped: BulkMoveSkip[];
};

/** Selected roots and everything under them — illegal Move to… destinations. */
export function moveExclusionIds(
  nodes: readonly OutlineNode[],
  rootIds: readonly string[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    if (out.has(id)) return;
    out.add(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  for (const id of rootIds) walk(id);
  return out;
}

function isSelfOrDescendant(
  byId: Map<string, OutlineNode>,
  ancestorId: string,
  nodeId: string,
): boolean {
  if (ancestorId === nodeId) return true;
  let current = byId.get(nodeId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

/**
 * Which selected roots can move under `parentId` (null = top level).
 *
 * Rank (`canNest`) and "into own descendant" are per-row. The host confirms when
 * `skipped` is non-empty and `legal` is not; a fully illegal destination is refused.
 */
export function planBulkMove(
  nodes: readonly OutlineNode[],
  rootIds: readonly string[],
  parentId: string | null,
): BulkMovePlan {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parent = parentId ? byId.get(parentId) : null;
  if (parentId !== null && !parent) {
    return {
      legal: [],
      skipped: rootIds.flatMap((id) => {
        const node = byId.get(id);
        return node
          ? [{ id, name: node.name, reason: "That destination does not exist." }]
          : [];
      }),
    };
  }
  const parentType: NodeType | null = parent?.type ?? null;
  const legal: string[] = [];
  const skipped: BulkMoveSkip[] = [];
  for (const id of rootIds) {
    const node = byId.get(id);
    if (!node) continue;
    if (parentId !== null && isSelfOrDescendant(byId, id, parentId)) {
      skipped.push({
        id,
        name: node.name,
        reason: "A node cannot be moved inside itself.",
      });
      continue;
    }
    if (!canNest(node.type, parentType)) {
      const parentLabel =
        parentType === null ? "the top level" : `a ${TYPE_LABELS[parentType]}`;
      skipped.push({
        id,
        name: node.name,
        reason: `A ${TYPE_LABELS[node.type]} cannot go under ${parentLabel}.`,
      });
      continue;
    }
    legal.push(id);
  }
  return { legal, skipped };
}
