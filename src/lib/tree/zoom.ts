import type { OutlineNode } from "./types";
import { walkUp } from "./walkUp";

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
    if (node.id === rootId) continue;
    for (const ancestor of walkUp(node, byId)) {
      if (ancestor.id === rootId) {
        kept.add(node.id);
        break;
      }
    }
  }

  // Rebase the branch against its new root. Both `depth` and `hidden` are stated relative
  // to the whole tree, and zoom removes everything above the root from the screen — so the
  // levels above it must stop counting for indentation, and a collapsed ancestor up there
  // must stop hiding rows. Without this, zooming to an item inside a collapsed area (which
  // the item picker will happily find) renders the root alone with an empty branch under it.
  // Rows arrive parents-first, so one pass is enough.
  const depthById = new Map<string, number>();
  const hiddenById = new Map<string, boolean>();
  const out: OutlineNode[] = [];

  for (const node of nodes) {
    if (!kept.has(node.id)) continue;
    const parent =
      node.id === rootId || !node.parentId ? null : (byId.get(node.parentId) ?? null);
    const depth = parent ? (depthById.get(parent.id) ?? 0) + 1 : 0;
    const hidden = parent
      ? (hiddenById.get(parent.id) ?? false) || parent.collapsed === true
      : false;
    depthById.set(node.id, depth);
    hiddenById.set(node.id, hidden);
    out.push(
      depth === node.depth && hidden === node.hidden
        ? node
        : { ...node, depth, hidden },
    );
  }

  return { nodes: out, stale: false };
}

/** The URL root for one level out, or null when the current zoom is already top-level. */
export function zoomOutRoot(
  nodes: readonly OutlineNode[],
  rootId: string | null,
): string | null {
  if (!rootId) return null;
  return nodes.find((node) => node.id === rootId)?.parentId ?? null;
}
