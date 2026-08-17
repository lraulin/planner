import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { goalDetails, nodeItems, nodes, taskDetails, users } from "@/db/schema";
import { createContact, deleteContact } from "@/lib/contacts/mutations";
import { getTableColumns } from "drizzle-orm";
import { eq } from "drizzle-orm";
import {
  fromDateKey,
  localDateKey,
  shiftDateKey,
  toDateKey,
} from "@/lib/schedule/geometry";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode, setState } from "@/lib/tree/mutations";
import {
  TASK_KEYS,
  autofillAttachmentTitleFromUrl,
  createNodeItem,
  deleteNodeItem,
  importNodeItems,
  moveNodeItem,
  saveNodeDetail,
  updateNodeItem,
} from "./mutations";
import { loadNodeDetail } from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/tree/mutations.test.ts`. Each test works under its own user, so these never touch
 * seeded development data.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("detail mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `detail-test-${crypto.randomUUID()}@localhost`,
      name: "Test User",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

/** `completedAt` is not part of the detail payload, so read it straight from the table. */
async function completedAtOf(nodeId: string): Promise<Date | null> {
  const [row] = await db
    .select({ completedAt: nodes.completedAt })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1);
  return row?.completedAt ?? null;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

/**
 * Not a database test, but it lives here because it is about the same failure the rest of
 * this file exists to catch: a value that looks saved and is not.
 *
 * `pick(values.task, TASK_KEYS)` is the only gate between a task field and the database,
 * and it is a hand-written list. A column added to the schema and to the form but left out
 * of it typechecks perfectly and is silently dropped — which is exactly how a recurrence
 * setting could look like it persisted for one render and then be gone.
 */
describe("TASK_KEYS", () => {
  it("covers every column on task_details", () => {
    const columns = Object.keys(getTableColumns(taskDetails)).filter(
      (name) => name !== "nodeId",
    );
    expect([...TASK_KEYS].sort()).toEqual(columns.sort());
  });
});

describeDb("detail mutations", () => {
  let userId: string;
  let areaId: string;
  let goalId: string;
  let projectId: string;

  beforeEach(async () => {
    userId = await makeUser();
    areaId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Career",
    });
    goalId = await createNode({
      userId,
      parentId: areaId,
      type: "goal",
      name: "Run a half marathon",
    });
    projectId = await createNode({
      userId,
      parentId: areaId,
      type: "project",
      name: "Rebuild the planner",
    });
  });

  /** The core half of a save, for tests that only care about the side table. */
  const core = {
    priorityLetter: null,
    priorityRank: null,
    state: "not_started" as const,
    deadline: null,
    focus: false,
    notes: "",
  };
  const resultAreaCore = { ...core, state: null };

  describe("state follows the dates", () => {
    async function task(name: string) {
      return createNode({ userId, parentId: projectId, type: "task", name });
    }

    async function stateOf(nodeId: string) {
      const [row] = await db
        .select({ state: nodes.state, deferredDate: nodes.deferredDate })
        .from(nodes)
        .where(eq(nodes.id, nodeId))
        .limit(1);
      return row;
    }

    it("starts a task when its actual start date is filled in", async () => {
      const id = await task("Draft the thing");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Draft the thing",
        task: { actualStartDate: new Date("2026-03-07T09:00:00Z") },
      });

      expect((await stateOf(id))?.state).toBe("in_progress");
    });

    it("shelves a project when a future deferred date is set", async () => {
      // The case this whole model exists for, and a project rather than a task.
      await saveNodeDetail(userId, projectId, {
        ...core,
        name: "Pay Taxes",
        deferredDate: new Date("2027-02-15T00:00:00Z"),
      });

      expect((await stateOf(projectId))?.state).toBe("postponed");
    });

    it("clears a stale deferred date when postponed by hand", async () => {
      // Otherwise it would un-shelve the instant it was shelved, since expiry is derived.
      const id = await task("Someday");
      await db
        .update(nodes)
        .set({ deferredDate: new Date("2020-01-01T00:00:00Z") })
        .where(eq(nodes.id, id));

      await saveNodeDetail(userId, id, {
        ...core,
        name: "Someday",
        state: "postponed",
      });

      const row = await stateOf(id);
      expect(row?.state).toBe("postponed");
      expect(row?.deferredDate).toBeNull();
    });

    it("completes at the date given, and steps a series from it", async () => {
      // Ticking something off long after it was really done. The completion belongs on the
      // day it happened, and a weekly task completed on the 1st is next due on the 8th —
      // not seven days from whenever the record was finally corrected.
      const id = await task("Weekly review");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Weekly review",
        task: { recurrenceFrequency: "weekly", recurrenceMode: "regenerate" },
      });

      await saveNodeDetail(userId, id, {
        ...core,
        name: "Weekly review",
        task: { dateCompleted: fromDateKey("2026-03-01") },
      });

      const row = await stateOf(id);
      // A repeating task does not stay completed; it comes back shelved until next time.
      expect(row?.state).toBe("postponed");
      expect(toDateKey(row.deferredDate!)).toBe("2026-03-08");
      // Target start is created with the deferred date — the next occurrence has a plan.
      const [dates] = await db
        .select({
          targetStartDate: nodes.targetStartDate,
          dateCompleted: taskDetails.dateCompleted,
        })
        .from(nodes)
        .innerJoin(taskDetails, eq(taskDetails.nodeId, nodes.id))
        .where(eq(nodes.id, id))
        .limit(1);
      expect(toDateKey(dates.targetStartDate!)).toBe("2026-03-08");
      expect(toDateKey(dates.dateCompleted!)).toBe("2026-03-01");
      expect(dates.dateCompleted?.getUTCHours()).toBe(12);
    });

    it("keeps Date completed on the day picked when regenerating (not the previous day)", async () => {
      // Lee 2026-08: target start/end = 1st, regenerate weekly, complete on the 1st → postponed
      // with targets on the 8th (good) but date completed flipped to the 31st (UTC startOfDay).
      const id = await task("Mow lawn");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        targetStartDate: fromDateKey("2026-08-01"),
        targetEndDate: fromDateKey("2026-08-01"),
        task: {
          recurrenceFrequency: "weekly",
          recurrenceMode: "regenerate",
          recurrenceInterval: 1,
        },
      });

      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        targetStartDate: fromDateKey("2026-08-01"),
        targetEndDate: fromDateKey("2026-08-01"),
        task: {
          recurrenceFrequency: "weekly",
          recurrenceMode: "regenerate",
          recurrenceInterval: 1,
          dateCompleted: fromDateKey("2026-08-01"),
        },
      });

      const [row] = await db
        .select({
          state: nodes.state,
          deferredDate: nodes.deferredDate,
          targetStartDate: nodes.targetStartDate,
          targetEndDate: nodes.targetEndDate,
          dateCompleted: taskDetails.dateCompleted,
        })
        .from(nodes)
        .innerJoin(taskDetails, eq(taskDetails.nodeId, nodes.id))
        .where(eq(nodes.id, id))
        .limit(1);

      expect(row.state).toBe("postponed");
      expect(toDateKey(row.dateCompleted!)).toBe("2026-08-01");
      expect(toDateKey(row.deferredDate!)).toBe("2026-08-08");
      expect(toDateKey(row.targetStartDate!)).toBe("2026-08-08");
      expect(toDateKey(row.targetEndDate!)).toBe("2026-08-08");
      expect(toDateKey(row.dateCompleted!)).not.toBe("2026-07-31");
    });

    it("completes again via Date completed after a prior cycle", async () => {
      // The bug this exists for: after the first cycle, dateCompleted still holds "last
      // completed", so treating only empty→filled as a completion left the second finish
      // (typed into the same field) as a silent no-op — postponed with a stale shelf, or
      // worse if the user then set State by hand.
      const id = await task("Mow lawn");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        task: {
          recurrenceFrequency: "weekly",
          recurrenceMode: "regenerate",
          recurrenceInterval: 1,
        },
      });

      // First finish, the way the status dropdown does it.
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        state: "completed",
      });
      const afterFirst = await stateOf(id);
      expect(afterFirst?.state).toBe("postponed");
      expect(afterFirst?.deferredDate).not.toBeNull();

      // Drawer reseed would show dateCompleted already filled. User changes it to the day
      // they actually mowed — same path as typing Date completed on a fresh task.
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        state: "postponed",
        deferredDate: afterFirst?.deferredDate ?? null,
        task: {
          recurrenceFrequency: "weekly",
          recurrenceMode: "regenerate",
          recurrenceInterval: 1,
          dateCompleted: fromDateKey("2026-08-01"),
        },
      });

      const afterSecond = await stateOf(id);
      expect(afterSecond?.state).toBe("postponed");
      expect(toDateKey(afterSecond.deferredDate!)).toBe("2026-08-08");

      const [dates] = await db
        .select({
          targetStartDate: nodes.targetStartDate,
          dateCompleted: taskDetails.dateCompleted,
        })
        .from(nodes)
        .innerJoin(taskDetails, eq(taskDetails.nodeId, nodes.id))
        .where(eq(nodes.id, id))
        .limit(1);
      expect(toDateKey(dates.targetStartDate!)).toBe("2026-08-08");
      expect(toDateKey(dates.dateCompleted!)).toBe("2026-08-01");
    });

    it("does not re-cycle when Date completed is re-saved on the same day", async () => {
      // The drawer posts the whole draft; an unchanged calendar day must stay quiet.
      const id = await task("Mow lawn");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        task: { recurrenceFrequency: "weekly", recurrenceMode: "regenerate" },
      });
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        task: { dateCompleted: fromDateKey("2026-03-01") },
      });
      const mid = await stateOf(id);
      expect(toDateKey(mid.deferredDate!)).toBe("2026-03-08");

      await saveNodeDetail(userId, id, {
        ...core,
        name: "Mow lawn",
        state: "postponed",
        deferredDate: mid?.deferredDate ?? null,
        notes: "later",
        // Same calendar day as last completed — picker re-open.
        task: {
          recurrenceFrequency: "weekly",
          recurrenceMode: "regenerate",
          dateCompleted: fromDateKey("2026-03-01"),
        },
      });

      const again = await stateOf(id);
      expect(again?.state).toBe("postponed");
      expect(toDateKey(again.deferredDate!)).toBe("2026-03-08");
    });

    it("completes a one-off at the date given", async () => {
      const id = await task("Filed the return");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Filed the return",
        task: { dateCompleted: fromDateKey("2026-02-03") },
      });

      const row = await stateOf(id);
      expect(row?.state).toBe("completed");
      const [detail] = await db
        .select({ dateCompleted: taskDetails.dateCompleted })
        .from(taskDetails)
        .where(eq(taskDetails.nodeId, id))
        .limit(1);
      expect(toDateKey(detail.dateCompleted!)).toBe("2026-02-03");
      expect(detail.dateCompleted?.getUTCHours()).toBe(12);
    });

    it("clamps a future Date completed to today", async () => {
      // Record dates are not plans. A future completion is not a correction.
      const id = await task("Time travel");
      const today = localDateKey(new Date());
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Time travel",
        task: { dateCompleted: fromDateKey(shiftDateKey(today, 14)) },
      });

      const [detail] = await db
        .select({ dateCompleted: taskDetails.dateCompleted })
        .from(taskDetails)
        .where(eq(taskDetails.nodeId, id))
        .limit(1);
      expect(toDateKey(detail.dateCompleted!)).toBe(today);
      expect((await stateOf(id))?.state).toBe("completed");
    });

    it("does not re-fire on a save that touched nothing", async () => {
      // The drawer posts its whole draft every time, so an unchanged date must stay quiet.
      const id = await task("Draft the thing");
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Draft the thing",
        task: { actualStartDate: new Date("2026-03-07T09:00:00Z") },
      });
      await saveNodeDetail(userId, id, {
        ...core,
        name: "Draft the thing",
        state: "waiting",
        task: { actualStartDate: new Date("2026-03-07T09:00:00Z") },
      });

      // Explicit beats implied, and the unchanged start date does not drag it back.
      expect((await stateOf(id))?.state).toBe("waiting");
    });

    it("scopes by user", async () => {
      const intruder = await makeUser();
      const id = await task("Mine");

      await expect(
        saveNodeDetail(intruder, id, {
          ...core,
          name: "Yours now",
          deferredDate: new Date("2027-02-15T00:00:00Z"),
        }),
      ).rejects.toThrow();

      const row = await stateOf(id);
      expect(row?.state).toBe("not_started");
      expect(row?.deferredDate).toBeNull();
    });
  });

  it("saves core fields and the side table together", async () => {
    await saveNodeDetail(userId, areaId, {
      name: "Career & Craft",
      priorityLetter: "A",
      priorityRank: 1,
      state: null,
      deadline: null,
      focus: true,
      notes: "Reviewed in January.",
      resultArea: { mission: "Do work worth doing.", importance: 80 },
    });

    const detail = await loadNodeDetail(userId, areaId);
    expect(detail?.name).toBe("Career & Craft");
    expect(detail?.focus).toBe(true);
    expect(detail?.resultArea?.mission).toBe("Do work worth doing.");
    expect(detail?.resultArea?.importance).toBe(80);
  });

  it("rejects lifecycle fields on a Result Area and leaves it state-less", async () => {
    await expect(
      saveNodeDetail(userId, areaId, { state: "completed" }),
    ).rejects.toThrow("Result Areas do not have a state");
    await expect(
      saveNodeDetail(userId, areaId, {
        deferredDate: new Date("2027-02-15T12:00:00Z"),
      }),
    ).rejects.toThrow("Result Areas cannot be postponed");

    const detail = await loadNodeDetail(userId, areaId);
    expect(detail?.state).toBeNull();
    expect(detail?.deferredDate).toBeNull();
  });

  it("promotes a nested result area to the root when its category changes", async () => {
    // Achieve: category is top-level organisation. Nesting inherits the parent's
    // category; editing the child's category un-nests it rather than forking a
    // second Personal/Work header under a parent that still claims the old one.
    await saveNodeDetail(userId, areaId, {
      ...resultAreaCore,
      name: "Career",
      resultArea: { category: "Personal" },
    });
    const nested = await createNode({
      userId,
      parentId: areaId,
      type: "result_area",
      name: "Side project area",
    });
    // Inherited on create.
    expect((await loadNodeDetail(userId, nested))?.resultArea?.category).toBe(
      "Personal",
    );

    await saveNodeDetail(userId, nested, {
      ...resultAreaCore,
      name: "Side project area",
      resultArea: { category: "Work" },
    });

    const [row] = await db
      .select({ parentId: nodes.parentId })
      .from(nodes)
      .where(eq(nodes.id, nested))
      .limit(1);
    expect(row?.parentId).toBeNull();
    expect((await loadNodeDetail(userId, nested))?.resultArea?.category).toBe("Work");
  });

  it("cascades a root result area's category to nested areas", async () => {
    const nested = await createNode({
      userId,
      parentId: areaId,
      type: "result_area",
      name: "Nested",
    });
    await saveNodeDetail(userId, areaId, {
      ...resultAreaCore,
      name: "Career",
      resultArea: { category: "Work" },
    });
    expect((await loadNodeDetail(userId, nested))?.resultArea?.category).toBe("Work");
    // Still nested — only a change *on the child* promotes.
    const [row] = await db
      .select({ parentId: nodes.parentId })
      .from(nodes)
      .where(eq(nodes.id, nested))
      .limit(1);
    expect(row?.parentId).toBe(areaId);
  });

  it("writes only the side table matching the record's own type", async () => {
    // A Result Area is sent Project values; they must be dropped, not stored.
    await saveNodeDetail(userId, areaId, {
      name: "Career",
      priorityLetter: null,
      priorityRank: null,
      state: null,
      deadline: null,
      focus: false,
      notes: "",
      project: { company: "Should not be saved" },
    });

    const detail = await loadNodeDetail(userId, areaId);
    expect(detail?.project).toBeNull();
  });

  it("ignores columns outside the allowlist", async () => {
    await saveNodeDetail(userId, projectId, {
      name: "Rebuild the planner",
      priorityLetter: null,
      priorityRank: null,
      state: "not_started",
      deadline: null,
      focus: false,
      notes: "",
      // A hand-rolled request could carry this; the write must not honour it.
      project: { nodeId: areaId, company: "Acme" } as never,
    });

    const project = await loadNodeDetail(userId, projectId);
    const area = await loadNodeDetail(userId, areaId);
    expect(project?.project?.company).toBe("Acme");
    expect(project?.project?.nodeId).toBe(projectId);
    expect(area?.resultArea?.nodeId).toBe(areaId);
  });

  it("clears the rank when the priority letter is cleared", async () => {
    const base = {
      name: "Rebuild the planner",
      state: "not_started" as const,
      deadline: null,
      focus: false,
      notes: "",
    };

    await saveNodeDetail(userId, projectId, {
      ...base,
      priorityLetter: "B",
      priorityRank: 3,
    });
    await saveNodeDetail(userId, projectId, {
      ...base,
      priorityLetter: null,
      priorityRank: 3,
    });

    const detail = await loadNodeDetail(userId, projectId);
    expect(detail?.priorityLetter).toBeNull();
    expect(detail?.priorityRank).toBeNull();
  });

  it("stamps completedAt when the state becomes completed, and clears it after", async () => {
    const base = {
      name: "Rebuild the planner",
      priorityLetter: null,
      priorityRank: null,
      deadline: null,
      focus: false,
      notes: "",
    };

    await saveNodeDetail(userId, projectId, { ...base, state: "completed" });
    expect(await completedAtOf(projectId)).toBeInstanceOf(Date);

    await saveNodeDetail(userId, projectId, { ...base, state: "in_progress" });
    expect(await completedAtOf(projectId)).toBeNull();
  });

  /**
   * The drawer drives `applyStateTransition` itself rather than going through `setState`, so
   * the cascade has to be wired in separately — and a parent left completed above open work
   * is exactly the contradiction that made the Status column read Overdue on a Completed row.
   */
  describe("re-opening from the drawer re-opens what is above it", () => {
    const base = {
      priorityLetter: null,
      priorityRank: null,
      deadline: null,
      focus: false,
      notes: "",
    };

    async function stateById(id: string) {
      const [row] = await db
        .select({ state: nodes.state })
        .from(nodes)
        .where(eq(nodes.id, id))
        .limit(1);
      return row?.state;
    }

    it("re-opens a completed parent when a subtask is re-opened", async () => {
      const taskId = await createNode({
        userId,
        parentId: projectId,
        type: "task",
        name: "Ship it",
      });
      await setState(userId, projectId, "completed");
      expect(await stateById(taskId)).toBe("completed");

      await saveNodeDetail(userId, taskId, {
        ...base,
        name: "Ship it",
        state: "in_progress",
      });

      expect(await stateById(taskId)).toBe("in_progress");
      expect(await stateById(projectId)).toBe("in_progress");
    });

    // The multi-level walk — skipping an open parent to reach a settled grandparent — is
    // covered in `completionCascade.test.ts`, and cannot be set up here: `setState` re-opens
    // the grandparent while arranging it, so an integration version would pass either way.

    it("leaves the branch alone when the drawer settles a node", async () => {
      // Upward only: the settling half is gated behind a confirmation the drawer does not
      // have, so completing a parent here must not silently settle open work beneath it.
      const taskId = await createNode({
        userId,
        parentId: projectId,
        type: "task",
        name: "Still open",
      });

      await saveNodeDetail(userId, projectId, {
        ...base,
        name: "Rebuild the planner",
        state: "completed",
      });

      expect(await stateById(projectId)).toBe("completed");
      expect(await stateById(taskId)).toBe("not_started");
    });

    it("does not re-open another user's ancestors", async () => {
      const otherUser = await makeUser();
      const otherProject = await createNode({
        userId: otherUser,
        parentId: null,
        type: "project",
        name: "Theirs",
      });
      const otherTask = await createNode({
        userId: otherUser,
        parentId: otherProject,
        type: "task",
        name: "Their task",
      });
      await setState(otherUser, otherProject, "completed");

      await expect(
        saveNodeDetail(userId, otherTask, {
          ...base,
          name: "Their task",
          state: "in_progress",
        }),
      ).rejects.toThrow();

      expect(await stateById(otherProject)).toBe("completed");
      expect(await stateById(otherTask)).toBe("completed");
    });
  });

  it("saves goal fields, including the Dream flag", async () => {
    await saveNodeDetail(userId, goalId, {
      ...core,
      name: "Run a half marathon",
      goal: {
        isDream: true,
        range: "1-Year",
        vision: "Crossing the line still able to walk.",
        progressReview: "weekly",
        contexts: ["@outside"],
      },
    });

    const detail = await loadNodeDetail(userId, goalId);
    expect(detail?.goal?.isDream).toBe(true);
    expect(detail?.goal?.range).toBe("1-Year");
    expect(detail?.goal?.vision).toBe("Crossing the line still able to walk.");
    expect(detail?.goal?.progressReview).toBe("weekly");
    expect(detail?.goal?.contexts).toEqual(["@outside"]);
  });

  describe("Result Area field", () => {
    async function parentOf(id: string) {
      const [row] = await db
        .select({ parentId: nodes.parentId })
        .from(nodes)
        .where(eq(nodes.id, id))
        .limit(1);
      return row?.parentId ?? null;
    }

    it("loads the owning area and only this user's areas for the dropdown", async () => {
      const otherUser = await makeUser();
      await createNode({
        userId: otherUser,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });

      const detail = await loadNodeDetail(userId, projectId);
      expect(detail?.resultAreaId).toBe(areaId);
      expect(detail?.resultAreas.map((area) => area.name)).toEqual(["Career"]);
      expect(await loadNodeDetail(otherUser, projectId)).toBeNull();
    });

    it("reparents a project when its Result Area changes", async () => {
      const health = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Health",
      });

      await saveNodeDetail(userId, projectId, {
        ...core,
        name: "Rebuild the planner",
        resultAreaId: health,
      });

      expect(await parentOf(projectId)).toBe(health);
      expect((await loadNodeDetail(userId, projectId))?.resultAreaId).toBe(health);
    });

    it("reparents a goal when its Result Area changes", async () => {
      const health = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Health",
      });

      await saveNodeDetail(userId, goalId, {
        ...core,
        name: "Run a half marathon",
        resultAreaId: health,
      });

      expect(await parentOf(goalId)).toBe(health);
    });

    it("does not yank a project out from under its goal when the area is unchanged", async () => {
      // The plausible mistake: treating resultAreaId as parentId on every save.
      const nested = await createNode({
        userId,
        parentId: goalId,
        type: "project",
        name: "Training plan",
      });

      await saveNodeDetail(userId, nested, {
        ...core,
        name: "Training plan",
        resultAreaId: areaId,
      });

      expect(await parentOf(nested)).toBe(goalId);
    });

    it("clears the parent when the Result Area is cleared", async () => {
      await saveNodeDetail(userId, projectId, {
        ...core,
        name: "Rebuild the planner",
        resultAreaId: null,
      });

      expect(await parentOf(projectId)).toBeNull();
      expect((await loadNodeDetail(userId, projectId))?.resultAreaId).toBeNull();
    });

    it("refuses a destination that is not a Result Area", async () => {
      await expect(
        saveNodeDetail(userId, projectId, {
          ...core,
          name: "Rebuild the planner",
          resultAreaId: goalId,
        }),
      ).rejects.toThrow("The Result Area field only accepts a Result Area.");

      expect(await parentOf(projectId)).toBe(areaId);
    });

    it("refuses to reparent via another user's area", async () => {
      const otherUser = await makeUser();
      const theirs = await createNode({
        userId: otherUser,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });

      await expect(
        saveNodeDetail(userId, projectId, {
          ...core,
          name: "Rebuild the planner",
          resultAreaId: theirs,
        }),
      ).rejects.toThrow(`Node not found: ${theirs}`);

      expect(await parentOf(projectId)).toBe(areaId);
    });

    it("does not let another user change this project's Result Area", async () => {
      const otherUser = await makeUser();
      const health = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Health",
      });

      await expect(
        saveNodeDetail(otherUser, projectId, {
          ...core,
          name: "Stolen",
          resultAreaId: health,
        }),
      ).rejects.toThrow(`Node not found: ${projectId}`);

      expect(await parentOf(projectId)).toBe(areaId);
    });
  });

  it("saves the wider task fields", async () => {
    const taskId = await createNode({
      userId,
      parentId: projectId,
      type: "task",
      name: "Draft the outline",
    });

    await saveNodeDetail(userId, taskId, {
      ...core,
      name: "Draft the outline",
      // One field from each group the Task form added, so a dropped allowlist entry shows up.
      task: {
        milestone: true,
        constraint: "must_finish_on",
        wbs: "1.2.3",
        durationMinutes: 90,
        costLow: "125.50",
        company: "ACME",
      },
    });

    const detail = await loadNodeDetail(userId, taskId);
    expect(detail?.task?.milestone).toBe(true);
    expect(detail?.task?.constraint).toBe("must_finish_on");
    expect(detail?.task?.wbs).toBe("1.2.3");
    expect(detail?.task?.durationMinutes).toBe(90);
    expect(detail?.task?.costLow).toBe("125.50");
    expect(detail?.task?.company).toBe("ACME");
  });

  it("accepts one of the states Achieve has that we did not", async () => {
    await saveNodeDetail(userId, goalId, {
      ...core,
      name: "Run a half marathon",
      state: "should_delegate",
    });

    expect((await loadNodeDetail(userId, goalId))?.state).toBe("should_delegate");
  });

  it("writes nothing when a goal is sent another type's side table", async () => {
    await saveNodeDetail(userId, goalId, {
      ...core,
      name: "Run a half marathon",
      project: { company: "Should not be saved" },
      task: { wbs: "9.9.9" },
    });

    const detail = await loadNodeDetail(userId, goalId);
    expect(detail?.project).toBeNull();
    expect(detail?.task).toBeNull();
  });

  /**
   * The seed inserts nodes straight into the table rather than going through `createNode`,
   * so its rows have no side-table row to update. The first save has to create one.
   */
  it("creates the side table row when a node was inserted without one", async () => {
    await db.delete(goalDetails).where(eq(goalDetails.nodeId, goalId));
    expect((await loadNodeDetail(userId, goalId))?.goal).toBeNull();

    await saveNodeDetail(userId, goalId, {
      ...core,
      name: "Run a half marathon",
      goal: { range: "3-Year" },
    });

    expect((await loadNodeDetail(userId, goalId))?.goal?.range).toBe("3-Year");
  });

  it("saves a record that touches no side table at all", async () => {
    // A form where only the name changed sends an empty side table. An empty SQL update is
    // an error, so this has to be skipped rather than attempted.
    await saveNodeDetail(userId, goalId, { ...core, name: "Renamed only" });

    expect((await loadNodeDetail(userId, goalId))?.name).toBe("Renamed only");
  });

  it("refuses to save a record belonging to another user", async () => {
    const otherUserId = await makeUser();

    await expect(
      saveNodeDetail(otherUserId, projectId, {
        name: "Stolen",
        priorityLetter: null,
        priorityRank: null,
        state: "not_started",
        deadline: null,
        focus: false,
        notes: "",
      }),
    ).rejects.toThrow(`Node not found: ${projectId}`);

    const detail = await loadNodeDetail(userId, projectId);
    expect(detail?.name).toBe("Rebuild the planner");
  });

  it("hides another user's record from the loader", async () => {
    const otherUserId = await makeUser();
    expect(await loadNodeDetail(otherUserId, projectId)).toBeNull();
  });

  describe("list rows", () => {
    async function titlesOf(kind: "risk" | "objective"): Promise<string[]> {
      const detail = await loadNodeDetail(userId, projectId);
      return (detail?.items ?? [])
        .filter((item) => item.kind === kind)
        .map((item) => item.title);
    }

    it("appends rows in creation order", async () => {
      for (const title of ["First", "Second", "Third"]) {
        const id = await createNodeItem({
          userId,
          nodeId: projectId,
          kind: "risk",
        });
        await updateNodeItem(userId, id, { title });
      }

      expect(await titlesOf("risk")).toEqual(["First", "Second", "Third"]);
    });

    it("keeps separate kinds in separate lists", async () => {
      const risk = await createNodeItem({ userId, nodeId: projectId, kind: "risk" });
      const objective = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "objective",
      });
      await updateNodeItem(userId, risk, { title: "It slips" });
      await updateNodeItem(userId, objective, { title: "Ship it" });

      expect(await titlesOf("risk")).toEqual(["It slips"]);
      expect(await titlesOf("objective")).toEqual(["Ship it"]);
    });

    it("stores the kind-specific columns", async () => {
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "risk",
        values: { title: "Scope creep", severity: 7, probability: 40 },
      });

      const detail = await loadNodeDetail(userId, projectId);
      const risk = detail?.items.find((item) => item.id === id);
      expect(risk?.severity).toBe(7);
      expect(risk?.probability).toBe(40);
    });

    it("moves a row up and down within its own list", async () => {
      const ids: string[] = [];
      for (const title of ["A", "B", "C"]) {
        const id = await createNodeItem({ userId, nodeId: projectId, kind: "risk" });
        await updateNodeItem(userId, id, { title });
        ids.push(id);
      }

      await moveNodeItem(userId, ids[2], "up");
      expect(await titlesOf("risk")).toEqual(["A", "C", "B"]);

      await moveNodeItem(userId, ids[0], "down");
      expect(await titlesOf("risk")).toEqual(["C", "A", "B"]);
    });

    it("leaves a row at the end of its list where it is", async () => {
      const first = await createNodeItem({ userId, nodeId: projectId, kind: "risk" });
      await updateNodeItem(userId, first, { title: "Only" });

      await moveNodeItem(userId, first, "up");
      await moveNodeItem(userId, first, "down");
      expect(await titlesOf("risk")).toEqual(["Only"]);
    });

    it("deletes a row", async () => {
      const id = await createNodeItem({ userId, nodeId: projectId, kind: "risk" });
      await updateNodeItem(userId, id, { title: "Temporary" });
      await deleteNodeItem(userId, id);

      expect(await titlesOf("risk")).toEqual([]);
    });

    it("clears the rank when the priority letter is cleared", async () => {
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "risk",
        values: { priorityLetter: "A", priorityRank: 5 },
      });

      await updateNodeItem(userId, id, { priorityLetter: null, priorityRank: 5 });

      const detail = await loadNodeDetail(userId, projectId);
      const risk = detail?.items.find((item) => item.id === id);
      expect(risk?.priorityLetter).toBeNull();
      expect(risk?.priorityRank).toBeNull();
    });

    it("goes with the node when the node is deleted", async () => {
      await createNodeItem({ userId, nodeId: projectId, kind: "risk" });
      await db.delete(users).where(eq(users.id, userId));

      // The cascade runs through users → nodes → node_items; nothing is left behind.
      expect(await loadNodeDetail(userId, projectId)).toBeNull();
    });

    it("will not attach a row to another user's node", async () => {
      const otherUserId = await makeUser();

      await expect(
        createNodeItem({ userId: otherUserId, nodeId: projectId, kind: "risk" }),
      ).rejects.toThrow(`Node not found: ${projectId}`);
    });

    it("bulk-imports CSV rows at the end of the list", async () => {
      await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "risk",
        values: { title: "Existing" },
      });

      const result = await importNodeItems({
        userId,
        nodeId: projectId,
        kind: "risk",
        rows: [
          { title: "Imported A", priorityLetter: "A", priorityRank: 1 },
          { title: "Imported B", severity: 5 },
        ],
      });

      expect(result.created).toBe(2);
      expect(await titlesOf("risk")).toEqual(["Existing", "Imported A", "Imported B"]);

      const detail = await loadNodeDetail(userId, projectId);
      const imported = detail?.items.find((item) => item.title === "Imported A");
      expect(imported?.priorityLetter).toBe("A");
      expect(imported?.priorityRank).toBe(1);
    });

    it("will not bulk-import onto another user's node", async () => {
      const otherUserId = await makeUser();

      await expect(
        importNodeItems({
          userId: otherUserId,
          nodeId: projectId,
          kind: "risk",
          rows: [{ title: "Nope" }],
        }),
      ).rejects.toThrow(`Node not found: ${projectId}`);
    });

    it("will not update or delete another user's row", async () => {
      const otherUserId = await makeUser();
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "risk",
        values: { title: "Mine" },
      });

      await updateNodeItem(otherUserId, id, { title: "Theirs" });
      await deleteNodeItem(otherUserId, id);

      expect(await titlesOf("risk")).toEqual(["Mine"]);
    });

    it("does not overwrite an attachment name that is already set", async () => {
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "attachment",
        values: { title: "Keep me", url: "https://example.com" },
      });

      // Would hit the network if it tried to fill; a non-null return is the bug.
      expect(await autofillAttachmentTitleFromUrl(userId, id)).toBeNull();

      const detail = await loadNodeDetail(userId, projectId);
      expect(detail?.items.find((item) => item.id === id)?.title).toBe("Keep me");
    });

    it("links a contact without copying their name onto the row", async () => {
      const contactId = await createContact(userId, {
        givenName: "Ada",
        familyName: "King",
      });
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "contact",
        values: { contactId, association: "Sponsor" },
      });

      const detail = await loadNodeDetail(userId, projectId);
      const row = detail?.items.find((item) => item.id === id);
      expect(row?.contactId).toBe(contactId);
      expect(row?.association).toBe("Sponsor");
      expect(row?.title).toBe("");
    });

    it("will not attach another user's contact", async () => {
      const ownerId = await makeUser();
      const contactId = await createContact(ownerId, { givenName: "Ada" });

      await expect(
        createNodeItem({
          userId,
          nodeId: projectId,
          kind: "contact",
          values: { contactId },
        }),
      ).rejects.toThrow("Contact not found.");

      const detail = await loadNodeDetail(userId, projectId);
      expect(detail?.items.filter((item) => item.kind === "contact")).toEqual([]);
    });

    it("will not let a second user change or delete the first user's contact row", async () => {
      const otherUserId = await makeUser();
      const contactId = await createContact(userId, { givenName: "Ada" });
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "contact",
        values: { contactId, association: "Mine" },
      });

      await updateNodeItem(otherUserId, id, { association: "Theirs" });
      await deleteNodeItem(otherUserId, id);

      const detail = await loadNodeDetail(userId, projectId);
      const row = detail?.items.find((item) => item.id === id);
      expect(row?.association).toBe("Mine");
      expect(await loadNodeDetail(otherUserId, projectId)).toBeNull();
    });

    it("refuses the same contact twice on one node", async () => {
      const contactId = await createContact(userId, { givenName: "Ada" });
      await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "contact",
        values: { contactId },
      });

      await expect(
        createNodeItem({
          userId,
          nodeId: projectId,
          kind: "contact",
          values: { contactId },
        }),
      ).rejects.toThrow("already on this list");
    });

    it("removes the link row when the contact is deleted", async () => {
      const contactId = await createContact(userId, { givenName: "Ada" });
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "contact",
        values: { contactId, association: "Sponsor" },
      });

      await deleteContact(userId, contactId);

      const detail = await loadNodeDetail(userId, projectId);
      expect(detail?.items.find((item) => item.id === id)).toBeUndefined();
      const leftover = await db
        .select({ id: nodeItems.id })
        .from(nodeItems)
        .where(eq(nodeItems.id, id));
      expect(leftover).toEqual([]);
    });

    it("will not autofill another user's attachment", async () => {
      const otherUserId = await makeUser();
      const id = await createNodeItem({
        userId,
        nodeId: projectId,
        kind: "attachment",
        values: { title: "", url: "https://example.com" },
      });

      expect(await autofillAttachmentTitleFromUrl(otherUserId, id)).toBeNull();

      const detail = await loadNodeDetail(userId, projectId);
      expect(detail?.items.find((item) => item.id === id)?.title).toBe("");
    });
  });
});
