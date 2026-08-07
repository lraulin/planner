"use server";

import type { NodeState, PriorityLetter } from "@/db/schema";
import type { Position } from "@/lib/tree/types";
import { nodeFromKind, type NodeKind } from "@/lib/tree/hierarchy";
import * as tree from "@/lib/tree/mutations";
import { run, type ActionResult } from "../actionResult";

/**
 * Server actions wrapping the tree mutations. Each resolves the user itself, so no caller
 * can pass one in, and each returns `{ error }` instead of throwing — an illegal nesting
 * is a normal outcome the grid reports inline, not a crash.
 */

export type { ActionResult };

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
  return run((userId) => tree.createNode({ userId, type, isDream, ...rest }));
}

export async function renameNodeAction(
  nodeId: string,
  name: string,
): Promise<ActionResult> {
  return run((userId) => tree.renameNode(userId, nodeId, name));
}

export async function deleteNodeAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => tree.deleteNode(userId, nodeId));
}

export async function setPriorityAction(
  nodeId: string,
  letter: PriorityLetter | null,
  rank: number | null,
): Promise<ActionResult> {
  return run((userId) => tree.setPriority(userId, nodeId, letter, rank));
}

export async function removePriorityGapsAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => tree.removePriorityGaps(userId, nodeId));
}

export async function reprioritizeUniqueAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => tree.reprioritizeUnique(userId, nodeId));
}

export async function convertNodeAction(
  nodeId: string,
  targetKind: NodeKind,
): Promise<ActionResult> {
  return run((userId) => tree.convertNode(userId, nodeId, targetKind));
}

export async function setStateAction(
  nodeId: string,
  state: NodeState,
): Promise<ActionResult> {
  return run((userId) => tree.setState(userId, nodeId, state));
}

/**
 * Achieve's Skip Recurrence: advance a repeating task to its next occurrence without
 * completing this one. Nothing is logged and nothing is reset — see `skipRecurrence`.
 */
export async function skipRecurrenceAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => tree.skipRecurrence(userId, nodeId));
}

export async function setFocusAction(
  nodeId: string,
  focus: boolean,
): Promise<ActionResult> {
  return run((userId) => tree.setFocus(userId, nodeId, focus));
}

export async function setCollapsedAction(
  nodeId: string,
  collapsed: boolean,
): Promise<ActionResult> {
  return run((userId) => tree.setCollapsed(userId, nodeId, collapsed));
}

export async function setAllCollapsedAction(collapsed: boolean): Promise<ActionResult> {
  return run((userId) => tree.setAllCollapsed(userId, collapsed));
}

export async function expandThroughDepthAction(
  maxDepth: number,
): Promise<ActionResult> {
  return run((userId) => tree.expandThroughDepth(userId, maxDepth));
}

export async function setEffortAction(
  nodeId: string,
  minutes: number | null,
): Promise<ActionResult> {
  return run((userId) => tree.setEffort(userId, nodeId, minutes));
}

export async function setDeadlineAction(
  nodeId: string,
  deadline: string | null,
): Promise<ActionResult> {
  return run((userId) =>
    tree.setDeadline(userId, nodeId, deadline ? new Date(deadline) : null),
  );
}

export async function indentNodeAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => tree.indentNode(userId, nodeId));
}

export async function outdentNodeAction(nodeId: string): Promise<ActionResult> {
  return run((userId) => tree.outdentNode(userId, nodeId));
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
}): Promise<ActionResult> {
  return run((userId) => tree.moveNode({ userId, ...params }));
}

export async function moveNodeVerticallyAction(
  nodeId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  return run((userId) => tree.moveNodeVertically(userId, nodeId, direction));
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
  return run((userId) => tree.setTcPriorities(userId, assignments));
}
