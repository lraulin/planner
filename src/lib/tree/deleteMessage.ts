import { KIND_LABELS, kindOfNode } from "./hierarchy";
import type { OutlineNode } from "./types";

/**
 * What the delete confirmation says about a row.
 *
 * Shared rather than written per host, because the sentence that matters is the branch warning:
 * deleting a project takes its tasks with it, and a dialog that only names the project is how you
 * lose work you did not know was attached. Six modules now offer Delete; six copies of this
 * sentence would eventually disagree about whether the children are mentioned at all.
 */
export function nodeDeleteMessage(node: OutlineNode | null): string {
  if (!node) return "";
  const label = node.name || `This ${KIND_LABELS[kindOfNode(node)].toLowerCase()}`;
  return node.hasChildren
    ? `${label} and all ${node.childCount} items under it will be deleted. This cannot be undone.`
    : `${label} will be deleted. This cannot be undone.`;
}

/** The dialog's title, e.g. "Delete this project?". */
export function nodeDeleteTitle(node: OutlineNode | null): string {
  const kind = node ? KIND_LABELS[kindOfNode(node)].toLowerCase() : "row";
  return `Delete this ${kind}?`;
}
