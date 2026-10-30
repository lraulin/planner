"use server";

import type { NodeState, PriorityLetter } from "@/db/schema";
import type { Position } from "@/lib/tree/types";
import { nodeFromKind, type NodeKind } from "@/lib/tree/hierarchy";
import {
  convertNode,
  createNode,
  deleteNode,
  expandThroughDepth,
  renameNode,
  setAllCollapsed,
  setCollapsed,
  setDeadline,
  setEffort,
  setFocus,
} from "@/lib/tree/mutations";
import {
  indentNode,
  moveNode,
  moveNodeVertically,
  outdentNode,
} from "@/lib/tree/nodeMoves";
import {
  setPriority,
  setPriorityForNodes,
  setTcPriorities,
} from "@/lib/tree/priorityWrites";
import { skipRecurrence } from "@/lib/tree/recurrenceCycle";
import { setState } from "@/lib/tree/stateTransitions";
import { run, type ActionResult } from "@/app/actionResult";

/**
 * Server actions wrapping the tree mutations. Each resolves the user itself, so no caller
 * can pass one in, and each returns `{ error }` instead of throwing — an illegal nesting
 * is a normal outcome the grid reports inline, not a crash.
 */

/**
 * Creates a row from the kind the user picked. Dream is a kind and not a type, so this is
 * where it becomes a goal with the box ticked — the one translation between what the UI
 * offers and what the tree stores.
 */
export async function createNodeAction(params: {
  parentId: string | null;
  kind: NodeKind;
  name?: string;
  position?: Position;
}): Promise<ActionResult> {
  const { kind, ...rest } = params;
  const { type, isDream } = nodeFromKind(kind);
  return run((userId) => createNode({ userId, type, isDream, ...rest }));
}

export async function renameNodeAction(
  nodeId: string,
  name: string,
): Promise<ActionResult> {
  return run((userId) => renameNode(userId, nodeId, name));
}

export async function deleteNodeAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => deleteNode(userId, nodeId));
}

export async function setPriorityAction(
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<ActionResult> {
  return run((userId) => setPriority(userId, nodeId, letter, rank));
}

/**
 * One priority for a whole selection, ranked in outline order within each sibling group.
 * The rank is a request the ranking engine answers — see `setPriorityForNodes`.
 */
export async function setPriorityForNodesAction(
  nodeIds: readonly string[],
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<ActionResult> {
  return run((userId) => setPriorityForNodes(userId, nodeIds, letter, rank));
}

export async function convertNodeAction(
  nodeId: string,
  targetKind: NodeKind,
): Promise<ActionResult> {
  return run((userId) => convertNode(userId, nodeId, targetKind));
}

export async function setStateAction(
  nodeId: string,
  state: NodeState,
): Promise<ActionResult> {
  return run((userId) => setState(userId, nodeId, state));
}

/**
 * Achieve's Skip Recurrence: advance a repeating task to its next occurrence without
 * completing this one. Nothing is logged and nothing is reset — see `skipRecurrence`.
 */
export async function skipRecurrenceAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => skipRecurrence(userId, nodeId));
}

export async function setFocusAction(
  nodeId: string,
  focus: boolean,
): Promise<ActionResult> {
  return run((userId) => setFocus(userId, nodeId, focus));
}

export async function setCollapsedAction(
  nodeId: string,
  collapsed: boolean,
): Promise<ActionResult> {
  return run((userId) => setCollapsed(userId, nodeId, collapsed));
}

export async function setAllCollapsedAction(collapsed: boolean): Promise<ActionResult> {
  return run((userId) => setAllCollapsed(userId, collapsed));
}

export async function expandThroughDepthAction(
  maxDepth: number,
): Promise<ActionResult> {
  return run((userId) => expandThroughDepth(userId, maxDepth));
}

export async function setEffortAction(
  nodeId: string,
  minutes: number | null,
): Promise<ActionResult> {
  return run((userId) => setEffort(userId, nodeId, minutes));
}

export async function setDeadlineAction(
  nodeId: string,
  deadline: string | null,
): Promise<ActionResult> {
  return run((userId) =>
    setDeadline(userId, nodeId, deadline ? new Date(deadline) : null),
  );
}

export async function indentNodeAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => indentNode(userId, nodeId));
}

export async function outdentNodeAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => outdentNode(userId, nodeId));
}

/**
 * Reparents and repositions in one call — the drop end of outline drag-and-drop, where the
 * client has already resolved the gesture into a parent and a position (`lib/tree/dnd`).
 * The nesting and self-containment checks still run server-side.
 */
export async function moveNodeAction(params: {
  nodeId: string;
  parentId: string | null;
  position: Position;
  /** Result areas only — destination category when dropping into a root-level group. */
  category?: string | null;
  /**
   * Where the row lands among its new peers' priorities. Only a drag before or after a
   * sibling knows; the move otherwise appends to the end of its letter. Sent with the move
   * so both sibling groups are renumbered in the same transaction.
   */
  priorityPlacement?: { targetId: string; zone: "before" | "after" };
}): Promise<ActionResult> {
  return run((userId) => moveNode({ userId, ...params }));
}

export async function moveNodeVerticallyAction(
  nodeId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  return run((userId) => moveNodeVertically(userId, nodeId, direction));
}

/**
 * Write a whole Task Chooser reordering at once.
 *
 * One batch rather than one call per row: a single drag renumbers a letter group, and
 * splitting it would leave the ranking briefly duplicated on screen and permanently
 * duplicated if one call failed. The plan is computed client-side by
 * `src/lib/chooser/tcPriority.ts`; this only persists it.
 */
export async function setTcPrioritiesAction(
  assignments: {
    nodeId: string;
    letter: PriorityLetter | null;
    rank: number | null;
  }[],
): Promise<ActionResult> {
  return run((userId) => setTcPriorities(userId, assignments));
}
