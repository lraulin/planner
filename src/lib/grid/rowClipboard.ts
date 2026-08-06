import { isSelfOrDescendant } from "@/lib/tree/dnd";
import { canNest } from "@/lib/tree/hierarchy";
import type { NodeType } from "@/db/schema";

/**
 * Achieve's `Pickup Row(s)` — rows marked for relocation, waiting for somewhere to land.
 *
 * **A cut, not a copy.** Achieve's verb marks rows to be *moved*, and `moveNode` already
 * reparents, repositions and refuses cycles, so this whole feature adds no mutation. Pasting a
 * *duplicate* would mean deep-copying a subtree — new server work, and deliberately not here.
 *
 * The buffer is not the system clipboard. It holds node ids, which mean nothing outside this
 * app, and it deliberately survives navigating between modules: picking rows up on the Outline
 * and dropping them on Tasks is the move that is hard to do by dragging.
 */
export type RowClipboard = {
  ids: readonly string[];
  /** For the label — "Paste 3 rows" is worth saying before you commit to it. */
  count: number;
};

/** One row, as much of it as the paste guard needs. `OutlineNode` satisfies it. */
export type ClipboardNode = { id: string; parentId: string | null; type: NodeType };

export type PasteTarget =
  /** Under the target row. */
  | { at: "child"; targetId: string }
  /** Beside the target row, as its next sibling. */
  | { at: "after"; targetId: string };

/**
 * Why this paste is refused, or `null` when it is legal.
 *
 * A sentence rather than a boolean because every one of these is a real state a user lands in,
 * and `navigation.md` asks for the reason on the disabled row: "Paste" greyed with no
 * explanation is indistinguishable from a broken menu.
 */
export function pasteRefusal(
  nodes: readonly ClipboardNode[],
  clipboard: RowClipboard | null,
  target: PasteTarget | null,
): string | null {
  if (!clipboard || clipboard.ids.length === 0) return "Nothing has been picked up";
  if (!target) return "Select a row to paste beside";

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const targetNode = byId.get(target.targetId);
  if (!targetNode) return "That row is no longer here";

  // Where the rows would actually end up: under the target, or under the target's parent.
  const parentId = target.at === "child" ? target.targetId : targetNode.parentId;
  const parentType = parentId ? (byId.get(parentId)?.type ?? null) : null;

  for (const id of clipboard.ids) {
    const node = byId.get(id);
    // A picked-up row that has since been deleted, or that belongs to a tree this module does
    // not load. Silently skipping it would move some of the selection and not the rest.
    if (!node) return "Some of the picked-up rows are no longer here";

    // The cycle check `moveNode` performs server-side, done here so the menu can say so before
    // the click rather than after it.
    if (isSelfOrDescendant(byId, id, parentId)) {
      return "Cannot paste a row inside itself";
    }

    // Only ever fires for a real parent: `canNest` lets the top level host anything, which is
    // deliberate — see `hierarchy.ts`.
    if (!canNest(node.type, parentType)) return "Those rows cannot go under this one";
  }

  return null;
}

export type PasteMove = {
  nodeId: string;
  parentId: string | null;
  /** `null` means "first among the new siblings" — pasting as a child of an empty row. */
  afterSiblingId: string | null;
};

/**
 * The moves a paste performs, in order — or `null` when `pasteRefusal` would refuse it.
 *
 * Each row lands **after the previous one**, so a block picked up in order arrives in that
 * order. Anchoring every row to the same sibling instead reverses the block, which is the kind
 * of thing that looks like a shuffle rather than a bug.
 */
export function pasteMoves(
  nodes: readonly ClipboardNode[],
  clipboard: RowClipboard | null,
  target: PasteTarget | null,
): PasteMove[] | null {
  if (!clipboard || !target || pasteRefusal(nodes, clipboard, target) !== null) {
    return null;
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentId =
    target.at === "child"
      ? target.targetId
      : (byId.get(target.targetId)?.parentId ?? null);

  const moves: PasteMove[] = [];
  let after = target.at === "after" ? target.targetId : null;
  for (const nodeId of clipboard.ids) {
    moves.push({ nodeId, parentId, afterSiblingId: after });
    after = nodeId;
  }
  return moves;
}
