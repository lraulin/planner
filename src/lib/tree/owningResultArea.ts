import type { OutlineNode } from "./types";
import { walkUp } from "./walkUp";

/**
 * Nearest Result Area in a root→leaf ancestor chain (the shape `loadNodeChain` returns).
 * Walks from the leaf so a nested area wins over the one above it.
 */
export function owningResultAreaIdFromChain(
  chain: readonly { id: string; type: string }[] | null | undefined,
): string | null {
  if (!chain) return null;
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].type === "result_area") return chain[i].id;
  }
  return null;
}

/**
 * The nearest Result Area at or above a row — the life area the row belongs to.
 *
 * **At or above**, not strictly above: a Result Area's owner is itself. Goals and
 * projects walk up to the first `result_area` ancestor, which is what Achieve's
 * Result Area dropdown shows and what grouping by Result Area keys on.
 *
 * Nested areas stop at the nearest one, the same way `owningProjectId` stops at the
 * nearest project. A project filed under `Work → Career` belongs to Career.
 *
 * Returns `null` when nothing above the row is a Result Area — a real state (a loose
 * goal or project) and the empty value of the form dropdown.
 */
export function owningResultAreaId(
  nodes: readonly OutlineNode[],
  id: string | null,
): string | null {
  if (!id) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const current of walkUp(byId.get(id), byId)) {
    if (current.type === "result_area") return current.id;
  }
  return null;
}
