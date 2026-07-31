"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { captureItems, type CaptureDefaults } from "@/lib/capture/mutations";
import { parseCapture } from "@/lib/capture/parse";
import { loadOutline } from "@/lib/tree/queries";
import type { NodeType } from "@/db/schema";

/**
 * Server actions for quick capture. Thin wrappers, as elsewhere: resolve the user, delegate
 * to `src/lib/capture/`, revalidate, and return an error rather than throwing so the dialog
 * can show it without an error boundary.
 */

export type CaptureResult = { ok: true; count: number } | { ok: false; error: string };

/** A project or goal the capture box can file into. */
export type CaptureTarget = { id: string; name: string; type: NodeType; depth: number };

export async function captureAction(input: {
  text: string;
  parentId?: string | null;
  defaults?: CaptureDefaults;
}): Promise<CaptureResult> {
  try {
    const userId = await getCurrentUserId();
    const items = parseCapture(input.text);
    if (items.length === 0) return { ok: false, error: "Nothing to capture." };

    const { nodeIds } = await captureItems({
      userId,
      items,
      parentId: input.parentId ?? null,
      defaults: input.defaults,
    });

    revalidatePath("/", "layout");
    return { ok: true, count: nodeIds.length };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

/**
 * The things a captured task can be filed under, for the Project picker.
 *
 * Loaded when the dialog first opens rather than with every page, since most page loads
 * never open it. Result areas are included because a task may now sit directly under one.
 */
export async function listCaptureTargetsAction(): Promise<CaptureTarget[]> {
  const userId = await getCurrentUserId();
  const nodes = await loadOutline(userId);

  return nodes
    .filter((node) => node.type !== "task" && node.state !== "completed")
    .map((node) => ({
      id: node.id,
      name: node.name || "(untitled)",
      type: node.type,
      depth: node.depth,
    }));
}
