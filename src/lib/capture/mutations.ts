import { db } from "@/db";
import { nodes } from "@/db/schema";
import type { PriorityLetter } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { saveNodeDetail } from "@/lib/detail/mutations";
import { createNode } from "@/lib/tree/mutations";
import type { CapturedItem } from "./parse";

/**
 * Writing captured items into the outline.
 *
 * Everything here goes through `createNode` and `saveNodeDetail` rather than touching
 * `nodes` directly, so nesting rules, sort keys, per-type detail rows and user scoping stay
 * in one place. The only direct query is finding the inbox, which nothing else needs.
 */

/** The default name a fresh inbox gets. Renaming it later does not unmake it the inbox. */
export const INBOX_NAME = "Inbox";

/** Optional fields applied to every item in one capture. */
export type CaptureDefaults = {
  priorityLetter?: PriorityLetter | null;
  priorityRank?: number | null;
  deadline?: Date | null;
  effortMinutes?: number | null;
  contexts?: string[];
};

/**
 * The id of this user's inbox project, creating it if there is not one.
 *
 * The inbox is an ordinary project in every respect except the flag: rename it,
 * reprioritise it, schedule it, complete it. Deleting it is allowed too — that is how you
 * reset its fields — and this makes a fresh one next time something is captured. Achieve
 * behaves the same way, minus the `<New Tasks>` sub-project, which never earned its keep.
 *
 * A completed inbox reopens rather than collecting items underneath a project that claims
 * to be finished: new unprocessed items mean the work of deciding about them is live again.
 */
export async function ensureInbox(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: nodes.id, state: nodes.state })
    .from(nodes)
    .where(and(eq(nodes.userId, userId), eq(nodes.isInbox, true)))
    .limit(1);

  if (existing) {
    if (existing.state === "completed" || existing.state === "cancelled") {
      await db
        .update(nodes)
        .set({ state: "in_progress", completedAt: null, updatedAt: new Date() })
        .where(and(eq(nodes.id, existing.id), eq(nodes.userId, userId)));
    }
    return existing.id;
  }

  const id = await createNode({
    userId,
    parentId: null,
    type: "project",
    name: INBOX_NAME,
    isInbox: true,
    // At the top of the outline, where unprocessed things are visible rather than filed
    // away somewhere you have to remember to look.
    position: { at: "first" },
  });

  await saveNodeDetail(userId, id, {
    // Achieve's defaults: lowest priority, because nothing in here has been prioritised
    // yet, and in-progress, because an inbox with something in it is work outstanding.
    priorityLetter: "D",
    state: "in_progress",
  });

  return id;
}

/**
 * Creates captured items as tasks, returning the ids in input order.
 *
 * Items are created one at a time rather than in a single bulk insert: each needs a sort
 * key computed against the siblings the previous one just added, and at capture scale — a
 * handful of lines typed or pasted at once — the cost is invisible.
 */
export async function captureItems(params: {
  userId: string;
  items: CapturedItem[];
  /** Omit or pass null to capture into the inbox. */
  parentId?: string | null;
  defaults?: CaptureDefaults;
}): Promise<{ createdIds: string[]; parentId: string }> {
  const { userId, items, defaults } = params;

  const rootParentId = params.parentId ?? (await ensureInbox(userId));

  // The most recent node created at each depth, so an indented line attaches to the line
  // above it. Index 0 holds the capture target itself.
  const parentAtDepth: string[] = [rootParentId];
  const createdIds: string[] = [];

  for (const item of items) {
    // A line indented past anything we have created lands as deep as it can reach. The
    // parser already clamps jumps, so this only guards against a hand-built item list.
    const depth = Math.min(item.depth, parentAtDepth.length - 1);
    const parentId = parentAtDepth[depth];

    const id = await createNode({
      userId,
      parentId,
      type: "task",
      name: item.name,
      notes: item.note,
    });

    if (defaults) await applyDefaults(userId, id, defaults);

    parentAtDepth[depth + 1] = id;
    parentAtDepth.length = depth + 2;
    createdIds.push(id);
  }

  return { createdIds, parentId: rootParentId };
}

async function applyDefaults(
  userId: string,
  nodeId: string,
  defaults: CaptureDefaults,
): Promise<void> {
  const { priorityLetter, priorityRank, deadline, effortMinutes, contexts } = defaults;

  const hasCore =
    priorityLetter !== undefined ||
    priorityRank !== undefined ||
    deadline !== undefined;
  const hasTask = effortMinutes !== undefined || contexts !== undefined;
  if (!hasCore && !hasTask) return;

  await saveNodeDetail(userId, nodeId, {
    ...(priorityLetter !== undefined ? { priorityLetter } : {}),
    ...(priorityRank !== undefined ? { priorityRank } : {}),
    ...(deadline !== undefined ? { deadline } : {}),
    ...(hasTask
      ? {
          task: {
            ...(effortMinutes !== undefined ? { effortMinutes } : {}),
            ...(contexts !== undefined ? { contexts } : {}),
          },
        }
      : {}),
  });
}
