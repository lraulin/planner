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
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { assertContactOwned } from "@/lib/contacts/ownership";
import {
  clearConflictingDescendantPlans,
  syncDayLineToTargetStart,
} from "@/lib/day/sync";
import {
  applyStateTransition,
  moveNode,
  reopenSettledAncestors,
} from "@/lib/tree/mutations";
import { owningResultAreaIdFromChain } from "@/lib/tree/owningResultArea";
import { loadNodeChain } from "@/lib/tree/path";
import { parentIdForResultAreaChange } from "./resultAreaParent";
import {
  asCalendarDay,
  fromDateKey,
  localDateKey,
  toDateKey,
} from "@/lib/schedule/geometry";
import { isStateEdit } from "./formState";
import { stateFromDates } from "./stateFromDates";
import { between } from "@/lib/tree/sortKey";
import { RESULT_AREA_STATE_REFUSAL } from "@/lib/tree/lifecycle";
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
 * Coerce a value that may have crossed the server-action boundary into a real `Date`.
 * Flight usually preserves Dates; a plain ISO string still has to work, and an unparseable
 * value must not reach the completion path as an Invalid Date (which can write a shelved
 * row with a null deferred date).
 *
 * A bare `YYYY-MM-DD` is local midnight via `fromDateKey` — `new Date("2026-08-01")` is UTC
 * midnight, which is the previous evening in the Americas and the wrong calendar day.
 */
function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return fromDateKey(value);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Actual start and Date completed are **records**, not plans. Normalize to the UTC-noon
 * calendar-day encoding and refuse a future day by clamping to **today's local key** when
 * the process has a meaningful local zone (the browser); on a UTC server the clamp uses the
 * UTC day of `now`, which is good enough because the picker already enforces max=today.
 */
function recordDate(value: Date | string | null | undefined): Date | null {
  const parsed = asDate(value);
  if (!parsed) return null;
  const key = toDateKey(parsed);
  // Prefer local "today" so a laptop in the Americas does not clamp with UTC's tomorrow.
  const today = localDateKey(new Date());
  return fromDateKey(key > today ? today : key);
}

/**
 * The new value only when a field went from empty to filled. `undefined` means the caller
 * did not send the field at all, which is not a change either.
 */
function newlySet(
  before: Date | null | undefined,
  next: Date | string | null | undefined,
) {
  const parsed = asDate(next === undefined ? undefined : next);
  if (parsed === null) return null;
  return before ? null : parsed;
}

/** The new value only when it actually differs from the stored one. */
function changedTo(before: Date | null, next: Date | string | null | undefined) {
  const parsed = asDate(next === undefined ? undefined : next);
  if (parsed === null) return null;
  if (before && before.getTime() === parsed.getTime()) return null;
  return parsed;
}

/**
 * Date completed was filled in or moved to a different calendar day.
 *
 * Unlike Started on, this is not "empty → filled" only. A recurring task keeps
 * `dateCompleted` as "last completed" after every cycle, so the field is almost always
 * already set when you next finish the chore. Treating only the first fill as a completion
 * is what made "complete by typing the date" work once and then silently stop working —
 * and left a second save looking like Postponed with no deferred date if the user then
 * tried to fix the state by hand.
 *
 * Compared as calendar days so a re-save of the draft (which may rebuild local midnight
 * from the date picker) does not re-fire on an unchanged day. Clearing the field is never
 * a completion.
 */
function completedDateSet(
  before: Date | null | undefined,
  next: Date | string | null | undefined,
): Date | null {
  // `undefined` means the field was not in the save; `null` means cleared.
  if (next === undefined) return null;
  const parsed = recordDate(next);
  if (parsed === null) return null;
  if (before && toDateKey(before) === toDateKey(parsed)) return null;
  return parsed;
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

/** Allowlists for side-table writes — also used by the agent API field parser. */
export const RESULT_AREA_KEYS = [
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

export const PROJECT_KEYS = [
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

export const GOAL_KEYS = [
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
  "contactId",
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
  "contactId",
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
      parentId: nodes.parentId,
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
 * One person per project's (or task's) Contacts tab. `exceptItemId` is the row being
 * edited, so changing its association without changing the person does not trip the check.
 */
async function assertContactUnusedOnNode(
  tx: Executor,
  userId: string,
  nodeId: string,
  contactId: string | null | undefined,
  exceptItemId?: string,
): Promise<void> {
  if (!contactId) return;
  const [existing] = await tx
    .select({ id: nodeItems.id })
    .from(nodeItems)
    .where(
      and(
        eq(nodeItems.userId, userId),
        eq(nodeItems.nodeId, nodeId),
        eq(nodeItems.kind, "contact"),
        eq(nodeItems.contactId, contactId),
        exceptItemId ? ne(nodeItems.id, exceptItemId) : undefined,
      ),
    )
    .limit(1);
  if (existing) throw new Error("That contact is already on this list.");
}

async function assertItemContact(
  tx: Executor,
  userId: string,
  nodeId: string,
  values: NodeItemValues | undefined,
  exceptItemId?: string,
): Promise<void> {
  if (!values || !("contactId" in values)) return;
  await assertContactOwned(tx, userId, values.contactId);
  await assertContactUnusedOnNode(tx, userId, nodeId, values.contactId, exceptItemId);
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
  let savedType: string | undefined;
  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);
    savedType = node.type;

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
    if (node.type === "result_area") {
      if (core.state !== undefined && core.state !== null) {
        throw new Error(`${RESULT_AREA_STATE_REFUSAL}.`);
      }
      if (core.deferredDate != null) {
        throw new Error("Result Areas cannot be postponed.");
      }
      // Full drawer drafts carry the shared keys even though the Result Area form does not
      // render them. Do not let those inert nulls become a second lifecycle write path.
      delete core.state;
      delete core.deferredDate;
    } else if (core.state === null) {
      throw new Error("Goals, Projects, and Tasks require a state.");
    }
    // Plan/shelf dates are calendar days: coerce the wire value then force UTC-noon encoding
    // so a UTC server never rewrites the day the picker chose.
    for (const key of [
      "deadline",
      "targetStartDate",
      "targetEndDate",
      "deferredDate",
    ] as const) {
      if (key in core && core[key] != null) {
        const parsed = asDate(core[key]);
        if (parsed) (core as Record<string, unknown>)[key] = asCalendarDay(parsed);
      }
    }

    // The form shows *effective* state (expired shelf → Not started) while the row may still
    // store `postponed`. A full-draft re-save therefore posts `not_started` without the user
    // having touched State — that is not an edit; writing it would sweep the residue the
    // shelving model deliberately leaves. See `isStateEdit`.
    const today = localDateKey(new Date());
    if (
      "state" in core &&
      core.state !== undefined &&
      core.state !== null &&
      !isStateEdit(node, core.state, today)
    ) {
      delete (core as { state?: unknown }).state;
    }

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
        toDateKey(node.deferredDate) <= localDateKey(new Date())
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
      // Category is handled separately: Achieve treats it as top-level organisation, so
      // changing a nested area's category promotes it to the root.
      let categoryPatch: string | null | undefined;
      if ("category" in set) {
        const raw = set.category;
        if (raw === null || raw === undefined) {
          categoryPatch = null;
        } else if (typeof raw === "string") {
          const trimmed = raw.trim();
          categoryPatch = trimmed === "" ? null : trimmed;
        }
        delete set.category;
      }
      if (hasValues(set)) {
        await tx
          .insert(resultAreaDetails)
          .values({ nodeId, ...set })
          .onConflictDoUpdate({ target: resultAreaDetails.nodeId, set });
      }
      if (categoryPatch !== undefined) {
        await applyResultAreaCategory(tx, userId, nodeId, node.parentId, categoryPatch);
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
      // Date columns must be real Dates for drizzle; coerce anything that arrived as an
      // ISO string across the server-action boundary so a completion-by-date save cannot
      // fail the side-table write and leave the transition un-run.
      for (const key of ["reminderAt", "constraintDate", "recurrenceUntil"] as const) {
        if (key in set && set[key] != null) {
          const parsed = asDate(set[key]);
          if (parsed) (set as Record<string, unknown>)[key] = parsed;
        }
      }
      // Record dates: local midnight, never in the future.
      for (const key of ["actualStartDate", "dateCompleted"] as const) {
        if (key in set) {
          (set as Record<string, unknown>)[key] =
            set[key] == null ? null : recordDate(set[key]);
        }
      }
      if (hasValues(set)) {
        await tx
          .insert(taskDetails)
          .values({ nodeId, ...set })
          .onConflictDoUpdate({ target: taskDetails.nodeId, set });
      }
    }

    // What the dates say about the state, for the fields that were newly filled in or
    // moved. Read against `before`, not against the draft: the drawer posts every field on
    // every save, so "is it set?" would be true forever after the first time and would
    // re-derive a state on saves that never touched a date.
    //
    // Date completed uses `completedDateSet` (change of calendar day), not empty→filled:
    // after a recurring cycle the column already holds "last completed", and the next time
    // you finish the chore by typing the date that field has to speak again.
    const completedAt = completedDateSet(
      before?.dateCompleted,
      values.task?.dateCompleted,
    );
    // Started on is empty→filled only (unlike Date completed, which is "last completed"
    // on a routine and must re-fire). Still a record date: local midnight, not future.
    const startedRaw =
      values.task?.actualStartDate === undefined
        ? undefined
        : recordDate(values.task.actualStartDate);
    const implied =
      node.state === null
        ? null
        : stateFromDates({
            current: node.state,
            completedAt,
            deferredUntil: changedTo(node.deferredDate, core.deferredDate),
            startedAt: newlySet(before?.actualStartDate, startedRaw),
            today,
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
    // so many words. A date only speaks when the dropdown was left alone. When the explicit
    // change *is* a completion, still honour a Date completed in the same save as the
    // instant it happened — otherwise setting State to C and backdating the date would step
    // a series from now instead of from the day you actually did it.
    //
    // `core.state` has already been dropped when the draft only restated the effective
    // state of an expired shelf (see above), so a due-again routine completed from the
    // form still reaches this branch — draft was `completed`, which *is* an edit.
    const explicit =
      "state" in core &&
      core.state !== undefined &&
      core.state !== null &&
      core.state !== node.state
        ? {
            state: core.state,
            at:
              core.state === "completed"
                ? (recordDate(values.task?.dateCompleted) ?? completedAt)
                : null,
          }
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
      // A parent's state is a claim about the work beneath it, so completing or starting a
      // subtask here has to start the Not started project above it, and re-opening one has
      // to re-open the completed project — exactly as the grids do. Upward only: settling
      // open descendants is gated behind a confirmation this drawer does not have yet.
      await reopenSettledAncestors(tx, userId, nodeId, transition.state);
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

  // After the field write: reparenting is its own move (sort key, nest rules, day lines)
  // and must not run inside the save transaction — `moveNode` opens its own.
  if (
    values.resultAreaId !== undefined &&
    (savedType === "goal" || savedType === "project")
  ) {
    await applyResultAreaId(userId, nodeId, values.resultAreaId);
  }
}

/**
 * Refile a Goal or Project under the chosen Result Area. No-op when the row already
 * belongs to that area, so a project nested under a goal is not yanked out on every save.
 */
async function applyResultAreaId(
  userId: string,
  nodeId: string,
  nextResultAreaId: string | null,
): Promise<void> {
  if (nextResultAreaId !== null) {
    await requireResultArea(userId, nextResultAreaId);
  }

  const currentResultAreaId = owningResultAreaIdFromChain(
    await loadNodeChain(userId, nodeId),
  );

  const nextParentId = parentIdForResultAreaChange({
    currentResultAreaId,
    nextResultAreaId,
  });
  if (nextParentId === undefined) return;

  await moveNode({
    userId,
    nodeId,
    parentId: nextParentId,
    position: { at: "last" },
  });
}

async function requireResultArea(userId: string, id: string): Promise<void> {
  const [row] = await db
    .select({ type: nodes.type })
    .from(nodes)
    .where(and(eq(nodes.id, id), eq(nodes.userId, userId)))
    .limit(1);
  if (!row) throw new Error(`Node not found: ${id}`);
  if (row.type !== "result_area") {
    throw new Error("The Result Area field only accepts a Result Area.");
  }
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
 * Inline edit of a result area's Category, Importance or Description from the Result Areas
 * grid. Same allowlist path as `saveNodeDetail`, without requiring a full form draft.
 */
export async function setResultAreaFields(
  userId: string,
  nodeId: string,
  fields: {
    category?: string | null;
    importance?: number | null;
    description?: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const node = await requireNode(tx, userId, nodeId);
    if (node.type !== "result_area") {
      throw new Error("These fields are only on result areas.");
    }
    const set = pick(fields, ["category", "importance", "description"] as const);
    if (!hasValues(set)) return;
    await tx
      .insert(resultAreaDetails)
      .values({ nodeId, ...set })
      .onConflictDoUpdate({ target: resultAreaDetails.nodeId, set });
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

/**
 * Set a result area's category and cascade it to nested result areas.
 *
 * Achieve treats category as top-level organisation (Personal / Work), not as a field a
 * nested area can disagree with its parent about. Changing the category of a nested area
 * promotes it to the root; the subtree comes with it and inherits the new category.
 */
async function applyResultAreaCategory(
  tx: Executor,
  userId: string,
  nodeId: string,
  parentId: string | null,
  category: string | null,
): Promise<void> {
  if (parentId !== null) {
    // Land at the end of the root list so the promoted area is findable rather than
    // inserted at a random fractional sort key among existing roots.
    const roots = await tx
      .select({ sortKey: nodes.sortKey })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), isNull(nodes.parentId)))
      .orderBy(asc(nodes.sortKey));
    const sortKey = between(roots[roots.length - 1]?.sortKey ?? null, null);

    await tx
      .update(nodes)
      .set({ parentId: null, sortKey, updatedAt: new Date() })
      .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
  }

  // Cascade so nested areas do not keep a stale category that would split Projects
  // grouping or the outline's By category view.
  const raIds: string[] = [];
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const [row] = await tx
      .select({ type: nodes.type })
      .from(nodes)
      .where(and(eq(nodes.id, id), eq(nodes.userId, userId)))
      .limit(1);
    if (!row) continue;
    if (row.type === "result_area") raIds.push(id);
    const children = await tx
      .select({ id: nodes.id })
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.parentId, id)));
    for (const child of children) queue.push(child.id);
  }

  for (const id of raIds) {
    await tx
      .insert(resultAreaDetails)
      .values({ nodeId: id, category })
      .onConflictDoUpdate({
        target: resultAreaDetails.nodeId,
        set: { category },
      });
  }
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
    await assertItemContact(tx, userId, nodeId, values);
    const sortKey = await sortKeyFor(tx, userId, nodeId, kind, position);

    const [created] = await tx
      .insert(nodeItems)
      .values({ userId, nodeId, kind, sortKey, ...pick(values, ITEM_KEYS) })
      .returning({ id: nodeItems.id });

    return created.id;
  });
}

export type ImportNodeItemsResult = {
  created: number;
  createdIds: string[];
};

/**
 * Bulk-append list rows (CSV import path). Each row gets a new sort key at the end of
 * its kind list. Empty input is a no-op; more than 2000 rows is rejected so a bad paste
 * cannot balloon a single request.
 */
export async function importNodeItems(params: {
  userId: string;
  nodeId: string;
  kind: NodeItemKind;
  rows: readonly NodeItemValues[];
}): Promise<ImportNodeItemsResult> {
  const { userId, nodeId, kind, rows } = params;
  if (rows.length === 0) return { created: 0, createdIds: [] };
  if (rows.length > 2000) {
    throw new Error("Too many rows (max 2000 per import).");
  }

  return db.transaction(async (tx) => {
    await requireNode(tx, userId, nodeId);
    const createdIds: string[] = [];

    for (const values of rows) {
      await assertItemContact(tx, userId, nodeId, values);
      const sortKey = await sortKeyFor(tx, userId, nodeId, kind, { at: "last" });
      const [created] = await tx
        .insert(nodeItems)
        .values({ userId, nodeId, kind, sortKey, ...pick(values, ITEM_KEYS) })
        .returning({ id: nodeItems.id });
      createdIds.push(created.id);
    }

    return { created: createdIds.length, createdIds };
  });
}

export async function updateNodeItem(
  userId: string,
  itemId: string,
  values: NodeItemValues,
): Promise<void> {
  const set = pick(values, ITEM_KEYS);

  await db.transaction(async (tx) => {
    const [item] = await tx
      .select({ id: nodeItems.id, nodeId: nodeItems.nodeId })
      .from(nodeItems)
      .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)))
      .limit(1);
    // Missing or someone else's: same silent no-op as every other scoped update.
    if (!item) return;

    await assertItemContact(tx, userId, item.nodeId, values, item.id);

    await tx
      .update(nodeItems)
      .set({
        ...set,
        ...("priorityLetter" in set && set.priorityLetter === null
          ? { priorityRank: null }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(nodeItems.id, itemId), eq(nodeItems.userId, userId)));
  });
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
