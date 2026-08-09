import { groupByCategory, type GridRow, type TreeGridRows } from "./slice";
import type { OutlineNode } from "./types";

export type OutlineGridRows = TreeGridRows & {
  visibleNodes: OutlineNode[];
};

function nodeRows(nodes: readonly OutlineNode[]): GridRow[] {
  return nodes.map((node) => ({
    kind: "node",
    id: node.id,
    node,
    depth: node.depth,
  }));
}

/** Resolve current collapse state from DFS depth, including optimistic parent patches. */
function visibleAfterCollapse(nodes: readonly OutlineNode[]): OutlineNode[] {
  const visible: OutlineNode[] = [];
  let collapsedDepth: number | null = null;

  for (const node of nodes) {
    if (collapsedDepth !== null) {
      if (node.depth > collapsedDepth) continue;
      collapsedDepth = null;
    }

    visible.push(node);
    if (node.collapsed) collapsedDepth = node.depth;
  }

  return visible;
}

/**
 * Prepare the Outline's presentation rows separately from its narrowing candidates.
 *
 * A collapsed ancestor rolls descendants up; it does not remove them from the outline a
 * filter searches. Keeping both sets makes collapse → filter → expand produce the same rows
 * as expand → filter, while the currently collapsed grid still draws only the parent.
 */
export function outlineGridRows(
  nodes: readonly OutlineNode[],
  byCategory: boolean,
  byId: Map<string, OutlineNode>,
): OutlineGridRows {
  const visibleNodes = visibleAfterCollapse(nodes);
  return {
    visibleNodes,
    rows: byCategory ? groupByCategory(visibleNodes, byId) : nodeRows(visibleNodes),
    narrowingRows: nodeRows(nodes),
  };
}
