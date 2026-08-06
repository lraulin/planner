import type { OutlineNode } from "./types";

/** Return the selected root and its complete descendant branch, or mark a stale root. */
export function zoomBranch(
  nodes: readonly OutlineNode[],
  rootId: string | null,
): { nodes: OutlineNode[]; stale: boolean } {
  if (!rootId) return { nodes: [...nodes], stale: false };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (!byId.has(rootId)) return { nodes: [], stale: true };

  const kept = new Set<string>([rootId]);
  for (const node of nodes) {
    let parentId = node.parentId;
    while (parentId) {
      if (parentId === rootId) {
        kept.add(node.id);
        break;
      }
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }

  return {
    stale: false,
    nodes: nodes
      .filter((node) => kept.has(node.id))
      .map((node) =>
        node.id === rootId ? { ...node, hidden: false, depth: 0 } : node,
      ),
  };
}

/** The URL root for one level out, or null when the current zoom is already top-level. */
export function zoomOutRoot(
  nodes: readonly OutlineNode[],
  rootId: string | null,
): string | null {
  if (!rootId) return null;
  return nodes.find((node) => node.id === rootId)?.parentId ?? null;
}
