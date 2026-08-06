import { KIND_LABELS, kindOfNode } from "./hierarchy";
import type { OutlineNode } from "./types";

/**
 * What the delete confirmation says about the rows it is about to remove.
 *
 * Shared rather than written per host, because the sentence that matters is the branch warning:
 * deleting a project takes its tasks with it, and a dialog that only names the project is how
 * you lose work you did not know was attached. Six modules offer Delete now; six copies of this
 * sentence would eventually disagree about whether the children are mentioned at all.
 *
 * The list is the **roots** of the selection (`selectionMoveRoots`) — a child selected alongside
 * its parent is already counted inside that parent's branch, and counting it twice would tell
 * you a five-row delete removes six things.
 */
export function nodeDeleteMessage(nodes: readonly OutlineNode[]): string {
  if (nodes.length === 0) return "";

  const under = nodes.reduce((total, node) => total + (node.childCount ?? 0), 0);

  if (nodes.length === 1) {
    const node = nodes[0];
    const label = node.name || `This ${KIND_LABELS[kindOfNode(node)].toLowerCase()}`;
    return under > 0
      ? `${label} and all ${under} items under it will be deleted. This cannot be undone.`
      : `${label} will be deleted. This cannot be undone.`;
  }

  // Names are deliberately left out past one row. Listing five titles makes a dialog you skim
  // instead of read, and the count is the fact that decides whether to go ahead.
  return under > 0
    ? `${nodes.length} items and all ${under} items under them will be deleted. This cannot be undone.`
    : `${nodes.length} items will be deleted. This cannot be undone.`;
}

/** The dialog's title, e.g. "Delete this project?" or "Delete these 3 items?". */
export function nodeDeleteTitle(nodes: readonly OutlineNode[]): string {
  if (nodes.length > 1) return `Delete these ${nodes.length} items?`;
  const kind = nodes[0] ? KIND_LABELS[kindOfNode(nodes[0])].toLowerCase() : "row";
  return `Delete this ${kind}?`;
}
