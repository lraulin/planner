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
  return run(async (userId) => {
    const id = await detail.createNodeItem({ userId, ...params });
    // Attachment created with a URL and no name: fill the name from the page.
    if (typeof params.values?.url === "string" && params.values.url.trim()) {
      await detail.autofillAttachmentTitleFromUrl(userId, id);
    }
    return id;
  });
}

/**
 * Bulk-append rows from a client-parsed CSV. Returns how many were created so the list
 * can show a short status line (metrics import uses the same shape).
 */
export async function importNodeItemsAction(params: {
  nodeId: string;
  kind: NodeItemKind;
  rows: NodeItemValues[];
}): Promise<{ ok: true; data: { created: number } } | { ok: false; error: string }> {
  try {
    const userId = await getCurrentUserId();
    if (params.rows.length === 0) {
      throw new Error("No rows to import.");
    }
    if (params.rows.length > 2000) {
      throw new Error("Too many rows (max 2000 per import).");
    }
    const data = await detail.importNodeItems({ userId, ...params });
    revalidatePath("/", "layout");
    return { ok: true, data: { created: data.created } };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function updateNodeItemAction(
  itemId: string,
  values: NodeItemValues,
): Promise<ActionResult> {
  return run(async (userId) => {
    await detail.updateNodeItem(userId, itemId, values);
    // Fill a blank attachment name from the page title when a URL is set or the name
    // is cleared (so a bad autofill can be fixed by clearing Name without re-pasting).
    const urlSet = typeof values.url === "string" && values.url.trim().length > 0;
    const titleCleared =
      "title" in values &&
      typeof values.title === "string" &&
      values.title.trim().length === 0;
    if (urlSet || titleCleared) {
      await detail.autofillAttachmentTitleFromUrl(userId, itemId);
    }
  });
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
