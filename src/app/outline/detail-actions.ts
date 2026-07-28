"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import type { NodeItemKind } from "@/db/schema";
import * as detail from "@/lib/detail/mutations";
import { loadNodeDetail } from "@/lib/detail/queries";
import type {
  ItemPosition,
  NodeDetail,
  NodeDetailValues,
  NodeItemValues,
} from "@/lib/detail/types";
import type { ActionResult } from "./actions";

/**
 * Server actions behind the detail drawer. Same contract as `./actions.ts`: each resolves
 * the user itself, and each returns `{ ok: false, error }` instead of throwing, so a
 * rejected save renders inline in the drawer rather than crashing the outline behind it.
 */

export type QueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    return typeof result === "string" ? { ok: true, id: result } : { ok: true };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

/**
 * The read counterpart of `run`. Carries a payload back and does **not** revalidate —
 * opening a drawer should not invalidate the page it is drawn over.
 */
async function runQuery<T>(
  work: (userId: string) => Promise<T>,
): Promise<QueryResult<T>> {
  try {
    const userId = await getCurrentUserId();
    return { ok: true, data: await work(userId) };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function loadNodeDetailAction(
  nodeId: string,
): Promise<QueryResult<NodeDetail | null>> {
  return runQuery((userId) => loadNodeDetail(userId, nodeId));
}

export async function saveNodeDetailAction(
  nodeId: string,
  values: NodeDetailValues,
): Promise<ActionResult> {
  return run((userId) => detail.saveNodeDetail(userId, nodeId, values));
}

/** Goals grid: inline Definition / Range without a full drawer save. */
export async function setGoalFieldAction(
  nodeId: string,
  field: "definition" | "range",
  value: string,
): Promise<ActionResult> {
  return run((userId) => detail.setGoalFields(userId, nodeId, { [field]: value }));
}

export async function createNodeItemAction(params: {
  nodeId: string;
  kind: NodeItemKind;
  values?: NodeItemValues;
  position?: ItemPosition;
}): Promise<ActionResult> {
  return run((userId) => detail.createNodeItem({ userId, ...params }));
}

export async function updateNodeItemAction(
  itemId: string,
  values: NodeItemValues,
): Promise<ActionResult> {
  return run((userId) => detail.updateNodeItem(userId, itemId, values));
}

export async function deleteNodeItemAction(itemId: string): Promise<ActionResult> {
  return run((userId) => detail.deleteNodeItem(userId, itemId));
}

export async function moveNodeItemAction(
  itemId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  return run((userId) => detail.moveNodeItem(userId, itemId, direction));
}
