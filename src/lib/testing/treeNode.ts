import type { NodeType } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";

/**
 * Just enough of an outline node for a walk over ids, parents and types. The rest of the
 * row is left out on purpose, so the cast lives here rather than in every tree test.
 */
export function treeNode(
  id: string,
  parentId: string | null,
  type: NodeType = "task",
): OutlineNode {
  return { id, parentId, type, name: id, depth: 0 } as OutlineNode;
}
