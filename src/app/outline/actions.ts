"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import type { NodeState, NodeType, PriorityLetter } from "@/db/schema";
import type { Position } from "@/lib/tree/types";
import * as tree from "@/lib/tree/mutations";

/**
 * Server actions wrapping the tree mutations. Each resolves the user itself, so no caller
 * can pass one in, and each returns `{ error }` instead of throwing — an illegal nesting
 * is a normal outcome the grid reports inline, not a crash.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/outline");
    return typeof result === "string" ? { ok: true, id: result } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

export async function createNodeAction(params: {
  parentId: string | null;
  type: NodeType;
  name?: string;
  position?: Position;
}): Promise<ActionResult> {
  return run((userId) => tree.createNode({ userId, ...params }));
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

export async function setStateAction(
  nodeId: string,
  state: NodeState,
): Promise<ActionResult> {
  return run((userId) => tree.setState(userId, nodeId, state));
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

export async function moveNodeVerticallyAction(
  nodeId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  return run((userId) => tree.moveNodeVertically(userId, nodeId, direction));
}
