import { db } from "@/db";
import { nodes } from "@/db/schema";
import type { ExternalRef, PriorityLetter } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { saveNodeDetail } from "@/lib/detail/mutations";
import { isSettled } from "@/lib/tree/completionCascade";
import { createNode, createNodeOnce } from "@/lib/tree/mutations";
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
    if (isSettled(existing.state)) {
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
    // In-progress, because an inbox with something in it is work outstanding.
    //
    // Deliberately **not** Achieve's `D` default. Unprioritized and D are different claims:
    // D means "don't do — hide this, but keep it in case I reconsider", which is precisely
    // the wrong thing to say about work nobody has looked at yet. Leaving it blank keeps the
    // inbox in the state it actually occupies, undecided, and stops it being filed away with
    // Someday/Maybe by any view that hides D.
    state: "in_progress",
  });

  return id;
}

/** What happened to one captured item. */
export type CaptureItemResult = {
  nodeId: string;
  /** False when an item carrying an `external` ref was already here and was skipped. */
  created: boolean;
  /** Echoed back so a batch caller can match results to what it sent. */
  externalId?: string;
};

/**
 * Creates captured items as tasks, returning one result per item in input order.
 *
 * Items are created one at a time rather than in a single bulk insert: each needs a sort
 * key computed against the siblings the previous one just added, and at capture scale — a
 * handful of lines typed or pasted at once — the cost is invisible.
 *
 * An item carrying an `external` ref is created **at most once, ever**. That is what lets
 * an importer re-run a batch it is not sure landed — the Apple Reminders drain POSTs, then
 * marks each reminder complete, and the gap between those two steps is a phone on a train.
 * Re-running is the recovery path, so it has to be free.
 */
export async function captureItems(params: {
  userId: string;
  items: CapturedItem[];
  /** Omit or pass null to capture into the inbox. */
  parentId?: string | null;
  defaults?: CaptureDefaults;
}): Promise<{ results: CaptureItemResult[]; nodeIds: string[]; parentId: string }> {
  const { userId, items, defaults } = params;

  const rootParentId = params.parentId ?? (await ensureInbox(userId));
  const alreadyHere = await findExistingByExternalRef(userId, items);

  // The most recent node at each depth, so an indented line attaches to the line above it.
  // Index 0 holds the capture target itself. A deduped item still takes its slot here: a
  // subtask under an item we skipped belongs to that item, not to whatever came before.
  const parentAtDepth: string[] = [rootParentId];
  const results: CaptureItemResult[] = [];

  for (const item of items) {
    // A line indented past anything we have created lands as deep as it can reach. The
    // parser already clamps jumps, so this only guards against a hand-built item list.
    const depth = Math.min(item.depth, parentAtDepth.length - 1);
    const parentId = parentAtDepth[depth];

    const existingId = item.external
      ? alreadyHere.get(refKey(item.external))
      : undefined;

    let id: string;
    let created = false;
    if (existingId) {
      // Deliberately untouched — not renamed, not re-dated, no defaults reapplied. The
      // node may have been triaged, filed and half-finished since the first import; a
      // retry of the delivery must not undo that work.
      id = existingId;
    } else {
      const result = await createNodeOnce({
        userId,
        parentId,
        type: "task",
        name: item.name,
        notes: item.note,
        external: item.external,
      });
      id = result.id;
      created = result.created;

      if (created && (defaults || item.deadline !== undefined)) {
        await applyDefaults(userId, id, {
          ...defaults,
          // A per-item deadline is the more specific answer: the batch default is what the
          // caller meant for items that did not say, not an override of ones that did.
          ...(item.deadline !== undefined ? { deadline: item.deadline } : {}),
        });
      }
    }

    parentAtDepth[depth + 1] = id;
    parentAtDepth.length = depth + 2;
    results.push({
      nodeId: id,
      created,
      ...(item.external ? { externalId: item.external.id } : {}),
    });
  }

  return {
    results,
    nodeIds: results.map((r) => r.nodeId),
    parentId: rootParentId,
  };
}

/** Composite key for an external ref, so both halves have to match to count as the same item. */
function refKey(ref: ExternalRef): string {
  return `${ref.source}\0${ref.id}`;
}

/**
 * The nodes this user already holds for any of these items' external refs.
 *
 * One query for the whole batch rather than one per item — a drain of a neglected
 * Reminders list is dozens of round trips otherwise. The `nodes_external_ref_uq` index is
 * what makes this read safe to act on; without it this would be a check-then-insert race.
 */
async function findExistingByExternalRef(
  userId: string,
  items: CapturedItem[],
): Promise<Map<string, string>> {
  const refs = items
    .map((item) => item.external)
    .filter((ref): ref is ExternalRef => ref !== undefined);
  if (refs.length === 0) return new Map();

  const rows = await db
    .select({
      id: nodes.id,
      externalSource: nodes.externalSource,
      externalId: nodes.externalId,
    })
    .from(nodes)
    .where(
      and(
        eq(nodes.userId, userId),
        inArray(nodes.externalSource, [...new Set(refs.map((r) => r.source))]),
        inArray(nodes.externalId, [...new Set(refs.map((r) => r.id))]),
      ),
    );

  // The two `inArray`s are a cross product, so a row matching one batch item's source and
  // a different one's id can come back. Keying on the pair discards those.
  const found = new Map<string, string>();
  for (const row of rows) {
    if (row.externalSource === null || row.externalId === null) continue;
    found.set(refKey({ source: row.externalSource, id: row.externalId }), row.id);
  }
  return found;
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
