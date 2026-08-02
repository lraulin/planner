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
import {
  clearConflictingDescendantPlans,
  syncDayLineToTargetStart,
} from "@/lib/day/sync";
import { applyStateTransition } from "@/lib/tree/mutations";
import { toDateKey } from "@/lib/schedule/geometry";
import { stateFromDates } from "./stateFromDates";
import { between } from "@/lib/tree/sortKey";
import { fetchPageTitle, shouldAutofillAttachmentTitle } from "@/lib/url/pageTitle";
import type { ItemPosition, NodeDetailPatch, NodeItemValues } from "./types";

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

/**
 * The new value only when a field went from empty to filled. `undefined` means the caller
 * did not send the field at all, which is not a change either.
 */
function newlySet(before: Date | null | undefined, next: Date | null | undefined) {
  if (next === undefined || next === null) return null;
  return before ? null : next;
}

/** The new value only when it actually differs from the stored one. */
function changedTo(before: Date | null, next: Date | null | undefined) {
  if (next === undefined || next === null) return null;
  if (before && before.getTime() === next.getTime()) return null;
  return next;
}

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
  // On `nodes` since the date model was unified, so every type can carry them.
  "targetStartDate",
  "targetEndDate",
  "deferredDate",
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

/**
 * Exported only so a test can assert it covers every column on `task_details`.
 *
 * This allowlist is a silent-failure machine: `NodeDetailValues["task"]` is derived from
 * the Drizzle schema, so a column added to the table and to the form but forgotten here
 * typechecks perfectly and is dropped on the way to the database. Nothing else about
 * adding a task field will tell you.
 */
export const TASK_KEYS = [
  "effortMinutes",
  "effortLeftMinutes",
  "actualEffortMinutes",
  "percentComplete",
  "contexts",
  "recurrenceFrequency",
  "recurrenceInterval",
  "recurrenceMode",
  "recurrencePattern",
  "recurrenceByWeekday",
  "recurrenceMonthDay",
  "recurrenceOrdinal",
  "recurrenceWeekday",
  "recurrenceMonth",
  "recurrenceEnd",
  "recurrenceCount",
  "recurrenceUntil",
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
  "exerciseId",
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
    .select({
      id: nodes.id,
      type: nodes.type,
      state: nodes.state,
      deferredDate: nodes.deferredDate,
      targetStartDate: nodes.targetStartDate,
    })
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
  values: NodeDetailPatch,
): Promise<void> {
  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);

    // The task's own dates as they stand, so a newly-filled Started on or Date completed can
    // be told from one that was already there. Only for tasks; only when the draft carries
    // them at all.
    const before =
      node.type === "task" &&
      (values.task?.dateCompleted !== undefined ||
        values.task?.actualStartDate !== undefined)
        ? (
            await tx
              .select({
                dateCompleted: taskDetails.dateCompleted,
                actualStartDate: taskDetails.actualStartDate,
              })
              .from(taskDetails)
              .where(eq(taskDetails.nodeId, nodeId))
              .limit(1)
          )[0]
        : undefined;

    const core = pick(values, CORE_KEYS);

    // A plan may not precede availability (`nodes_start_not_before_deferred`). Setting a
    // deferred date past an existing target start would trip the constraint; clear the plan
    // rather than fail the save — same principle as clearing conflicting descendant plans.
    // A plan *after* the shelf is left alone: "come back Feb 15, start Mar 15" is legal.
    const nextDeferred =
      core.deferredDate !== undefined ? core.deferredDate : node.deferredDate;
    const nextStart =
      core.targetStartDate !== undefined ? core.targetStartDate : node.targetStartDate;
    const planPrecedesShelf =
      nextDeferred != null &&
      nextStart != null &&
      toDateKey(nextStart) < toDateKey(nextDeferred);

    await tx
      .update(nodes)
      .set({
        ...core,
        ...(planPrecedesShelf ? { targetStartDate: null, targetEndDate: null } : {}),
        // Shelving something whose deferred date has already gone by would un-shelve it the
        // instant it was shelved, since expiry is derived. Choosing Postponed by hand means
        // an indefinite shelf, so the stale date goes.
        ...("state" in core &&
        core.state === "postponed" &&
        core.deferredDate === undefined &&
        node.deferredDate &&
        toDateKey(node.deferredDate) <= toDateKey(new Date())
          ? { deferredDate: null }
          : {}),
        // A rank without a letter is meaningless, so clear it alongside — matching
        // `setPriority` in the tree mutations.
        ...("priorityLetter" in core && core.priorityLetter === null
          ? { priorityRank: null }
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

    // What the dates say about the state, for the fields that were newly filled in. Read
    // against `before`, not against the draft: the drawer posts every field on every save,
    // so "is it set?" would be true forever after the first time and would re-derive a
    // state on saves that never touched a date.
    const implied = stateFromDates({
      current: node.state,
      completedAt: newlySet(before?.dateCompleted, values.task?.dateCompleted),
      deferredUntil: changedTo(node.deferredDate, core.deferredDate),
      startedAt: newlySet(before?.actualStartDate, values.task?.actualStartDate),
      today: toDateKey(new Date()),
    });

    // Last, deliberately. The state write above set the column; this stamps `completedAt`
    // to match — and, for a recurring task, cycles it instead: logs the completion, pushes
    // the defer date out, and un-completes the subtree. That reset has to land *after* the
    // side-table write, or the form's own `percentComplete` / `dateCompleted` draft values
    // would overwrite it and the task would come back already finished. It also has to land
    // after the `nodes` update above, which writes the draft's own copy of the dates the
    // transition is about to move.
    //
    // Only on an actual change of state. The drawer posts its whole draft, so `state` is
    // present on every save whether or not it was touched, and cycling is not idempotent:
    // re-saving a completed repeating task would log a second completion and push its dates
    // out another full interval. Setting Repeats on a task that was already completed would
    // do the same without the State dropdown ever being opened.
    //
    // An explicit change to the State field wins over one implied by a date: you said it in
    // so many words. A date only speaks when the dropdown was left alone.
    const explicit =
      "state" in core && core.state !== undefined && core.state !== node.state
        ? { state: core.state, at: null }
        : null;
    const transition = explicit ?? implied;

    if (transition) {
      await applyStateTransition(
        tx,
        userId,
        nodeId,
        transition.state,
        transition.at ?? undefined,
      );
    }

    // A deferred-date change on a row that is (or just became) postponed may newly conflict
    // with descendant plans. `applyStateTransition` already cleans up when the *state*
    // flips to postponed; this covers moving the date on an already-shelved node, and the
    // pure date→state path above where the transition ran without an explicit state write
    // having cleared descendants under the *new* date yet (transition does, but only after
    // the state column is postponed — which it is by then).
    const becameOrStayedShelved =
      transition?.state === "postponed" ||
      ("state" in core && core.state === "postponed") ||
      (node.state === "postponed" && core.deferredDate !== undefined);
    if (becameOrStayedShelved) {
      await clearConflictingDescendantPlans(tx, userId, nodeId);
    }

    // Last of all, and after the transition, which may have moved the date itself. Target
    // start is where a task says which day it belongs on, so its day line follows — see
    // `src/lib/day/sync.ts`. Cheap and idempotent, so it runs on any task save rather than
    // trying to work out whether this particular one touched the date. Also re-syncs when a
    // project shelves and the cleanup above cleared child plans.
    if (node.type === "task" || becameOrStayedShelved) {
      await syncDayLineToTargetStart(tx, userId, nodeId);
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

/**
 * If this row is an attachment with a web URL and a blank name, fetch the page title
 * and write it. Never throws: a failed fetch leaves the row as-is with the URL saved.
 *
 * Call after a URL write (create or update). Scoped by `userId` like every other mutation.
 */
export async function autofillAttachmentTitleFromUrl(
  userId: string,
  itemId: string,
): Promise<string | null> {
  const [item] = await db
    .select({
      kind: nodeItems.kind,
      title: nodeItems.title,
      url: nodeItems.url,
    })
    .from(nodeItems)
    .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)))
    .limit(1);

  if (!item) return null;
  if (
    !shouldAutofillAttachmentTitle({
      kind: item.kind,
      title: item.title,
      url: item.url,
    })
  ) {
    return null;
  }

  const title = await fetchPageTitle(item.url);
  if (!title) return null;

  await db
    .update(nodeItems)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)));

  return title;
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
