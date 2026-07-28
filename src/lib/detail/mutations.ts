import { db } from "@/db";
import {
  goalDetails,
  nodeItems,
  nodes,
  projectDetails,
  resultAreaDetails,
  taskDetails,
} from "@/db/schema";
import type { NodeItemKind } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { between } from "@/lib/tree/sortKey";
import type { ItemPosition, NodeDetailValues, NodeItemValues } from "./types";

/**
 * Writes for the detail forms. Like `src/lib/tree/mutations.ts`, every function takes a
 * `userId` and scopes on it, so a caller cannot reach another user's rows by guessing an id.
 *
 * These values arrive from a client form across a server-action boundary, so each write
 * copies only the columns on an explicit allowlist. Typing the parameter is not enough:
 * nothing stops a hand-rolled request from including `nodeId` or `userId`, and spreading it
 * into `.set()` would honour them.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/** Copies the keys the caller actually supplied, and nothing else. */
function pick<T extends object, K extends keyof T>(
  source: Partial<T> | undefined,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const result: Partial<Pick<T, K>> = {};
  if (!source) return result;
  for (const key of keys) {
    if (key in source) result[key] = source[key];
  }
  return result;
}

const CORE_KEYS = [
  "name",
  "priorityLetter",
  "priorityRank",
  "state",
  "deadline",
  "focus",
  "notes",
] as const;

const RESULT_AREA_KEYS = [
  "color",
  "category",
  "description",
  "importance",
  "reason",
  "mission",
  "idealOuterVision",
  "idealInnerVision",
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
] as const;

const PROJECT_KEYS = [
  "projectStart",
  "targetEnd",
  "effortDriven",
  "onlyShowNextTask",
  "leadTimeMinutes",
  "blockSizeMinutes",
  "timePerWeekMinutes",
  "recomputeTaskDeadlines",
  "reminderAt",
  "sensitivity",
  "assignedTo",
  "place",
  "contexts",
  "purpose",
  "idealVision",
  "sufficientVision",
  "strategy",
  "billingInformation",
  "company",
  "mileage",
  "expectedCost",
  "lowCost",
  "highCost",
  "costToDate",
  "description",
] as const;

const GOAL_KEYS = [
  "isDream",
  "range",
  "plannedStart",
  "values",
  "question",
  "affirmation",
  "definition",
  "purpose",
  "contexts",
  "vision",
  "kindOfPerson",
  "personalChanges",
  "baseline",
  "limitingFactor",
  "strategy",
  "progressReview",
  "scorecard",
] as const;

const TASK_KEYS = [
  "effortMinutes",
  "effortLeftMinutes",
  "actualEffortMinutes",
  "percentComplete",
  "contexts",
  "targetStartDate",
  "targetEndDate",
  "deferredDate",
  "leadTimeMinutes",
  "deadlineLeadTimeMinutes",
  "source",
  "place",
  "reminderAt",
  "private",
  "effortDriven",
  "milestone",
  "actualStartDate",
  "dateCompleted",
  "durationMinutes",
  "constraint",
  "constraintDate",
  "wbs",
  "costLow",
  "costHigh",
  "actualCost",
  "billingInformation",
  "company",
  "mileage",
  "description",
] as const;

const ITEM_KEYS = [
  "priorityLetter",
  "priorityRank",
  "title",
  "description",
  "criteria",
  "stakeholders",
  "itemType",
  "stake",
  "severity",
  "probability",
  "detection",
  "prevention",
  "mitigation",
  "advantages",
  "disadvantages",
  "decision",
  "idealCandidate",
  "candidates",
  "filled",
  "filledBy",
  "association",
  "contact",
  "source",
  "resolution",
  "resolved",
  "url",
  "purpose",
  "strategy",
  "people",
  "completed",
  "received",
  "conditions",
  "awarded",
  "reason",
  "active",
  "category",
  "question",
  "target",
  "assignedTo",
  "entryDate",
  "score",
  "comments",
] as const;

async function requireNode(tx: Executor, userId: string, nodeId: string) {
  const [node] = await tx
    .select({ id: nodes.id, type: nodes.type })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new Error(`Node not found: ${nodeId}`);
  return node;
}

async function requireItem(tx: Executor, userId: string, itemId: string) {
  const [item] = await tx
    .select({ id: nodeItems.id, nodeId: nodeItems.nodeId, kind: nodeItems.kind })
    .from(nodeItems)
    .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)))
    .limit(1);

  if (!item) throw new Error(`List row not found: ${itemId}`);
  return item;
}

/**
 * Saves a whole form in one transaction: the core fields on `nodes`, plus the side table
 * belonging to this record's type.
 *
 * A record's own type decides which side table is written, not the shape of the payload —
 * sending `project` values for a Task writes nothing rather than creating a stray row.
 *
 * A partial save is normal, not an error: `ux-principles.md` requires that an incomplete
 * record can be saved, since people routinely know a project exists before they know its
 * budget.
 */
export async function saveNodeDetail(
  userId: string,
  nodeId: string,
  values: NodeDetailValues,
): Promise<void> {
  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);

    const core = pick(values, CORE_KEYS);
    await tx
      .update(nodes)
      .set({
        ...core,
        // A rank without a letter is meaningless, so clear it alongside — matching
        // `setPriority` in the tree mutations.
        ...("priorityLetter" in core && core.priorityLetter === null
          ? { priorityRank: null }
          : {}),
        // The outline colours completed rows from this timestamp, so it has to follow the
        // state whichever surface changed it.
        ...("state" in core
          ? { completedAt: core.state === "completed" ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));

    if (node.type === "result_area") {
      const set = pick(values.resultArea, RESULT_AREA_KEYS);
      if (hasValues(set)) {
        await tx
          .insert(resultAreaDetails)
          .values({ nodeId, ...set })
          .onConflictDoUpdate({ target: resultAreaDetails.nodeId, set });
      }
    } else if (node.type === "goal") {
      const set = pick(values.goal, GOAL_KEYS);
      if (hasValues(set)) {
        await tx
          .insert(goalDetails)
          .values({ nodeId, ...set })
          .onConflictDoUpdate({ target: goalDetails.nodeId, set });
      }
    } else if (node.type === "project") {
      const set = pick(values.project, PROJECT_KEYS);
      if (hasValues(set)) {
        await tx
          .insert(projectDetails)
          .values({ nodeId, ...set })
          .onConflictDoUpdate({ target: projectDetails.nodeId, set });
      }
    } else if (node.type === "task") {
      const set = pick(values.task, TASK_KEYS);
      if (hasValues(set)) {
        await tx
          .insert(taskDetails)
          .values({ nodeId, ...set })
          .onConflictDoUpdate({ target: taskDetails.nodeId, set });
      }
    }
  });
}

/**
 * Inline edit of a goal's Definition or Range from the Goals grid. Same allowlist path as
 * `saveNodeDetail`, without requiring a full form draft.
 */
export async function setGoalFields(
  userId: string,
  nodeId: string,
  fields: { definition?: string; range?: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);
    if (node.type !== "goal") {
      throw new Error("Definition and Range are only on goals.");
    }
    const set = pick(fields, ["definition", "range"] as const);
    if (!hasValues(set)) return;
    await tx
      .insert(goalDetails)
      .values({ nodeId, ...set })
      .onConflictDoUpdate({ target: goalDetails.nodeId, set });
    await tx
      .update(nodes)
      .set({ updatedAt: new Date() })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
  });
}

/**
 * Whether a picked payload has anything to write.
 *
 * A form that touched no side-table field — or one whose values were all outside the
 * allowlist — leaves nothing to set, and `onConflictDoUpdate` rejects an empty update.
 * The side-table row already exists, seeded by `createNode`, so skipping is correct.
 */
function hasValues(set: object): boolean {
  return Object.keys(set).length > 0;
}

/** Sort keys already in one list, in order. */
async function listKeys(
  tx: Executor,
  userId: string,
  nodeId: string,
  kind: NodeItemKind,
): Promise<{ id: string; sortKey: string }[]> {
  return tx
    .select({ id: nodeItems.id, sortKey: nodeItems.sortKey })
    .from(nodeItems)
    .where(
      and(
        eq(nodeItems.userId, userId),
        eq(nodeItems.nodeId, nodeId),
        eq(nodeItems.kind, kind),
      ),
    )
    .orderBy(asc(nodeItems.sortKey));
}

async function sortKeyFor(
  tx: Executor,
  userId: string,
  nodeId: string,
  kind: NodeItemKind,
  position: ItemPosition,
  excludeId?: string,
): Promise<string> {
  const siblings = (await listKeys(tx, userId, nodeId, kind)).filter(
    (s) => s.id !== excludeId,
  );

  if (position.at === "last") {
    return between(siblings.at(-1)?.sortKey ?? null, null);
  }

  const index = siblings.findIndex((s) => s.id === position.siblingId);
  if (index === -1) return between(siblings.at(-1)?.sortKey ?? null, null);

  return position.at === "before"
    ? between(siblings[index - 1]?.sortKey ?? null, siblings[index].sortKey)
    : between(siblings[index].sortKey, siblings[index + 1]?.sortKey ?? null);
}

export async function createNodeItem(params: {
  userId: string;
  nodeId: string;
  kind: NodeItemKind;
  values?: NodeItemValues;
  position?: ItemPosition;
}): Promise<string> {
  const { userId, nodeId, kind, values, position = { at: "last" } } = params;

  return db.transaction(async (tx) => {
    await requireNode(tx, userId, nodeId);
    const sortKey = await sortKeyFor(tx, userId, nodeId, kind, position);

    const [created] = await tx
      .insert(nodeItems)
      .values({ userId, nodeId, kind, sortKey, ...pick(values, ITEM_KEYS) })
      .returning({ id: nodeItems.id });

    return created.id;
  });
}

export async function updateNodeItem(
  userId: string,
  itemId: string,
  values: NodeItemValues,
): Promise<void> {
  const set = pick(values, ITEM_KEYS);

  await db
    .update(nodeItems)
    .set({
      ...set,
      ...("priorityLetter" in set && set.priorityLetter === null
        ? { priorityRank: null }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)));
}

export async function deleteNodeItem(userId: string, itemId: string): Promise<void> {
  await db
    .delete(nodeItems)
    .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)));
}

/** Moves a list row one place up or down. A row at the end of its list stays put. */
export async function moveNodeItem(
  userId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, userId, itemId);
    const siblings = await listKeys(tx, userId, item.nodeId, item.kind);
    const index = siblings.findIndex((s) => s.id === itemId);

    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= siblings.length) return;

    const position: ItemPosition =
      direction === "up"
        ? { at: "before", siblingId: siblings[target].id }
        : { at: "after", siblingId: siblings[target].id };

    const sortKey = await sortKeyFor(
      tx,
      userId,
      item.nodeId,
      item.kind,
      position,
      itemId,
    );

    await tx
      .update(nodeItems)
      .set({ sortKey, updatedAt: new Date() })
      .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)));
  });
}
