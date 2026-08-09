import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { nodes, taskCompletions, taskDetails, users } from "@/db/schema";
import type { RecurrenceFrequency } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fromDateKey } from "@/lib/schedule/geometry";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { saveNodeDetail } from "@/lib/detail/mutations";
import {
  createNode,
  deleteNode,
  expandThroughDepth,
  indentNode,
  moveNode,
  moveNodeVertically,
  outdentNode,
  renameNode,
  setAllCollapsed,
  setCollapsed,
  setEffort,
  setPriority,
  setState,
  skipRecurrence,
} from "./mutations";
import { loadOutline } from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`). Each test works under its
 * own user, so these never touch seeded development data.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("tree mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `test-${crypto.randomUUID()}@localhost`,
      name: "Test User",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

/** The outline as "depth:name" strings, for readable assertions. */
async function outlineOf(userId: string): Promise<string[]> {
  const rows = await loadOutline(userId);
  return rows.map((r) => `${"  ".repeat(r.depth)}${r.name}`);
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("tree mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates a root result area", async () => {
    const id = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    expect(await outlineOf(userId)).toEqual(["Work"]);
    const [area] = await db
      .select({
        state: nodes.state,
        completedAt: nodes.completedAt,
        deferredDate: nodes.deferredDate,
      })
      .from(nodes)
      .where(eq(nodes.id, id));
    expect(area).toEqual({ state: null, completedAt: null, deferredDate: null });
  });

  it("enforces the lifecycle-state invariant in the database", async () => {
    await expect(
      db.insert(nodes).values({
        userId,
        type: "result_area",
        state: "completed",
        sortKey: "invalid-area",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(nodes).values({
        userId,
        type: "task",
        state: null,
        sortKey: "invalid-task",
      }),
    ).rejects.toThrow();
  });

  // Capturing an idea must never require deciding where it lives first, so the top level
  // hosts every type.
  it("creates a task at the top level", async () => {
    await createNode({ userId, parentId: null, type: "task", name: "Loose end" });
    expect(await outlineOf(userId)).toEqual(["Loose end"]);
  });

  it("creates a task directly under a result area", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    await createNode({ userId, parentId: area, type: "task", name: "Get meds" });
    expect(await outlineOf(userId)).toEqual(["Health", "  Get meds"]);
  });

  it("rejects a nesting that goes backwards", async () => {
    const task = await createNode({ userId, parentId: null, type: "task", name: "T" });
    await expect(
      createNode({ userId, parentId: task, type: "goal", name: "Nope" }),
    ).rejects.toThrow("A Goal cannot go under a Task.");
  });

  it("appends new siblings in creation order", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    await createNode({ userId, parentId: area, type: "project", name: "One" });
    await createNode({ userId, parentId: area, type: "project", name: "Two" });
    await createNode({ userId, parentId: area, type: "project", name: "Three" });

    expect(await outlineOf(userId)).toEqual(["Work", "  One", "  Two", "  Three"]);
  });

  it("inserts before and after a named sibling", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    const one = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "One",
    });
    await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "Before",
      position: { at: "before", siblingId: one },
    });
    await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "After",
      position: { at: "after", siblingId: one },
    });

    expect(await outlineOf(userId)).toEqual(["Work", "  Before", "  One", "  After"]);
  });

  it("renames a node", async () => {
    const id = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Old",
    });
    await renameNode(userId, id, "New");
    expect(await outlineOf(userId)).toEqual(["New"]);
  });

  it("sets and clears priority, dropping an orphaned rank", async () => {
    const id = await createNode({ userId, parentId: null, type: "result_area" });

    await setPriority(userId, id, "A", 1);
    let [row] = await loadOutline(userId);
    expect([row.priorityLetter, row.priorityRank]).toEqual(["A", 1]);

    await setPriority(userId, id, null, 3);
    [row] = await loadOutline(userId);
    expect([row.priorityLetter, row.priorityRank]).toEqual([null, null]);
  });

  it("cascades a delete to descendants", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Work",
    });
    const project = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "P",
    });
    await createNode({ userId, parentId: project, type: "task", name: "T" });

    await deleteNode(userId, area);
    expect(await outlineOf(userId)).toEqual([]);
  });

  describe("effort", () => {
    /** Builds Work > Project > Task and returns the task id. */
    async function taskUnderProject() {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const project = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "P",
      });
      return {
        project,
        task: await createNode({ userId, parentId: project, type: "task", name: "T" }),
      };
    }

    it("sets an estimate on a task", async () => {
      const { task } = await taskUnderProject();
      await setEffort(userId, task, 225);

      const rows = await loadOutline(userId);
      expect(rows.find((r) => r.id === task)?.effortMinutes).toBe(225);
    });

    it("seeds Effort Left from the first estimate", async () => {
      const { task } = await taskUnderProject();
      await setEffort(userId, task, 120);

      const rows = await loadOutline(userId);
      expect(rows.find((r) => r.id === task)?.effortLeftMinutes).toBe(120);
    });

    it("leaves Effort Left alone once it exists", async () => {
      const { task } = await taskUnderProject();
      await setEffort(userId, task, 120);
      await setEffort(userId, task, 300);

      const row = (await loadOutline(userId)).find((r) => r.id === task);
      expect(row?.effortMinutes).toBe(300);
      expect(row?.effortLeftMinutes).toBe(120);
    });

    it("clears both when the estimate is cleared", async () => {
      const { task } = await taskUnderProject();
      await setEffort(userId, task, 120);
      await setEffort(userId, task, null);

      const row = (await loadOutline(userId)).find((r) => r.id === task);
      expect(row?.effortMinutes).toBeNull();
      expect(row?.effortLeftMinutes).toBeNull();
    });

    it("rolls a task's estimate up into its ancestors", async () => {
      const { project, task } = await taskUnderProject();
      await setEffort(userId, task, 225);

      const rows = await loadOutline(userId);
      expect(rows.find((r) => r.id === project)?.effortRollupMinutes).toBe(225);
      expect(rows[0].effortRollupMinutes).toBe(225); // the result area
    });

    it("refuses a project, whose effort is a rollup", async () => {
      const { project } = await taskUnderProject();
      await expect(setEffort(userId, project, 120)).rejects.toThrow(
        "Effort is only tracked on tasks",
      );
    });

    it("refuses another user's task", async () => {
      const other = await makeUser();
      const area = await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
      });
      const project = await createNode({
        userId: other,
        parentId: area,
        type: "project",
      });
      const theirs = await createNode({
        userId: other,
        parentId: project,
        type: "task",
      });

      await expect(setEffort(userId, theirs, 120)).rejects.toThrow("Node not found");
    });
  });

  describe("indent", () => {
    it("makes a node the last child of its previous sibling", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      await createNode({ userId, parentId: area, type: "project", name: "One" });
      const two = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "Two",
      });

      await indentNode(userId, two);
      expect(await outlineOf(userId)).toEqual(["Work", "  One", "    Two"]);
    });

    it("refuses when the node is first at its level", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const one = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "One",
      });

      await expect(indentNode(userId, one)).rejects.toThrow("first item at its level");
    });

    it("refuses when the result would be an illegal nesting", async () => {
      // Two roots, a task then a goal. Indenting the goal would put it under the task,
      // which is the one thing still forbidden: going backwards.
      await createNode({ userId, parentId: null, type: "task", name: "T" });
      const goal = await createNode({
        userId,
        parentId: null,
        type: "goal",
        name: "G",
      });

      await expect(indentNode(userId, goal)).rejects.toThrow(
        "A Goal cannot go under a Task.",
      );
    });
  });

  describe("outdent", () => {
    it("makes a node the next sibling of its parent", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const one = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "One",
      });
      const child = await createNode({
        userId,
        parentId: one,
        type: "project",
        name: "Child",
      });
      await createNode({ userId, parentId: area, type: "project", name: "Two" });

      await outdentNode(userId, child);
      expect(await outlineOf(userId)).toEqual(["Work", "  One", "  Child", "  Two"]);
    });

    it("refuses at the top level", async () => {
      const area = await createNode({ userId, parentId: null, type: "result_area" });
      await expect(outdentNode(userId, area)).rejects.toThrow(
        "Already at the top level",
      );
    });

    // Outdent can no longer produce an illegal nesting at all: a node's rank is always at
    // least its parent's, and its parent's at least the grandparent's, so moving up one
    // level is never backwards. `moveNode` keeps its guard as a backstop, but nothing in
    // this direction can trigger it — so the case to pin is that the move now succeeds.
    it("lands a task beside the project it came from, under the result area", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const project = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "P",
      });
      const task = await createNode({
        userId,
        parentId: project,
        type: "task",
        name: "T",
      });

      await outdentNode(userId, task);
      expect(await outlineOf(userId)).toEqual(["Work", "  P", "  T"]);
    });
  });

  describe("move", () => {
    it("reorders within a level", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      await createNode({ userId, parentId: area, type: "project", name: "One" });
      await createNode({ userId, parentId: area, type: "project", name: "Two" });
      const three = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "Three",
      });

      await moveNodeVertically(userId, three, "up");
      expect(await outlineOf(userId)).toEqual(["Work", "  One", "  Three", "  Two"]);

      await moveNodeVertically(userId, three, "up");
      expect(await outlineOf(userId)).toEqual(["Work", "  Three", "  One", "  Two"]);
    });

    it("does nothing at the end of a level", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const one = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "One",
      });

      await moveNodeVertically(userId, one, "up");
      await moveNodeVertically(userId, one, "down");
      expect(await outlineOf(userId)).toEqual(["Work", "  One"]);
    });

    it("refuses to move a node inside itself", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const project = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "P",
      });
      const child = await createNode({
        userId,
        parentId: project,
        type: "project",
        name: "C",
      });

      await expect(
        moveNode({
          userId,
          nodeId: project,
          parentId: child,
          position: { at: "last" },
        }),
      ).rejects.toThrow("cannot be moved inside itself");

      await expect(
        moveNode({
          userId,
          nodeId: project,
          parentId: project,
          position: { at: "last" },
        }),
      ).rejects.toThrow("cannot be moved inside itself");
    });

    it("carries descendants along", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const home = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Home",
      });
      const project = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "P",
      });
      await createNode({ userId, parentId: project, type: "task", name: "T" });

      await moveNode({
        userId,
        nodeId: project,
        parentId: home,
        position: { at: "last" },
      });
      expect(await outlineOf(userId)).toEqual(["Work", "Home", "  P", "    T"]);
    });

    it("inherits category when a result area is nested under another", async () => {
      const work = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const home = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Home",
      });
      // Seed categories via move-to-root (same path as drag-to-group).
      await moveNode({
        userId,
        nodeId: work,
        parentId: null,
        position: { at: "first" },
        category: "Career",
      });
      await moveNode({
        userId,
        nodeId: home,
        parentId: null,
        position: { at: "last" },
        category: "Personal",
      });

      await moveNode({
        userId,
        nodeId: home,
        parentId: work,
        position: { at: "last" },
      });

      const outline = await loadOutline(userId);
      const homeRow = outline.find((n) => n.id === home);
      expect(homeRow?.category).toBe("Career");
      expect(homeRow?.parentId).toBe(work);
    });

    it("cascades inherited category to nested result areas under the moved node", async () => {
      const outer = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Outer",
      });
      const mid = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Mid",
      });
      const inner = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Inner",
      });
      await moveNode({
        userId,
        nodeId: outer,
        parentId: null,
        position: { at: "first" },
        category: "Work",
      });
      // Distinct categories so the cascade is visible.
      await moveNode({
        userId,
        nodeId: mid,
        parentId: null,
        position: { at: "last" },
        category: "Personal",
      });
      await moveNode({
        userId,
        nodeId: inner,
        parentId: null,
        position: { at: "last" },
        category: "Other",
      });
      // Nest Inner under Mid, then Mid under Outer — both steps rewrite stored categories.
      await moveNode({
        userId,
        nodeId: inner,
        parentId: mid,
        position: { at: "last" },
      });
      expect((await loadOutline(userId)).find((n) => n.id === inner)?.category).toBe(
        "Personal",
      );

      await moveNode({
        userId,
        nodeId: mid,
        parentId: outer,
        position: { at: "last" },
      });

      const outline = await loadOutline(userId);
      expect(outline.find((n) => n.id === mid)?.category).toBe("Work");
      expect(outline.find((n) => n.id === inner)?.category).toBe("Work");
    });

    it("sets a root result area's category without reparenting", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Loose",
      });
      await moveNode({
        userId,
        nodeId: area,
        parentId: null,
        position: { at: "first" },
        category: "Health",
      });
      expect((await loadOutline(userId)).find((n) => n.id === area)?.category).toBe(
        "Health",
      );

      await moveNode({
        userId,
        nodeId: area,
        parentId: null,
        position: { at: "first" },
        category: null,
      });
      expect(
        (await loadOutline(userId)).find((n) => n.id === area)?.category,
      ).toBeNull();
    });

    it("inherits category when creating a result area under another", async () => {
      const parent = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Parent",
      });
      await moveNode({
        userId,
        nodeId: parent,
        parentId: null,
        position: { at: "first" },
        category: "Family",
      });
      const child = await createNode({
        userId,
        parentId: parent,
        type: "result_area",
        name: "Child",
      });
      expect((await loadOutline(userId)).find((n) => n.id === child)?.category).toBe(
        "Family",
      );
    });
  });

  describe("collapse", () => {
    it("setAllCollapsed collapses every row for the user", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const project = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "P",
      });
      await createNode({ userId, parentId: project, type: "task", name: "T" });

      await setAllCollapsed(userId, true);
      const after = await loadOutline(userId);
      expect(after.every((n) => n.collapsed)).toBe(true);
      // Roots still show; children under collapsed parents are hidden.
      expect(after.filter((n) => !n.hidden).map((n) => n.name)).toEqual(["Work"]);

      await setAllCollapsed(userId, false);
      const expanded = await loadOutline(userId);
      expect(expanded.every((n) => !n.collapsed)).toBe(true);
      expect(expanded.filter((n) => !n.hidden)).toHaveLength(3);
    });

    it("expandThroughDepth shows only through the given depth", async () => {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Work",
      });
      const project = await createNode({
        userId,
        parentId: area,
        type: "project",
        name: "P",
      });
      await createNode({ userId, parentId: project, type: "task", name: "T" });

      // Depth 1: expand roots, collapse at depth >= 1 → projects show, tasks hide.
      await expandThroughDepth(userId, 1);
      const throughOne = await loadOutline(userId);
      expect(throughOne.find((n) => n.id === area)?.collapsed).toBe(false);
      expect(throughOne.find((n) => n.id === project)?.collapsed).toBe(true);
      expect(throughOne.filter((n) => !n.hidden).map((n) => n.name)).toEqual([
        "Work",
        "P",
      ]);
    });

    it("setAllCollapsed does not touch another user's tree", async () => {
      const other = await makeUser();
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Mine",
      });
      await createNode({ userId, parentId: area, type: "project", name: "MP" });
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });
      await createNode({
        userId: other,
        parentId: theirs,
        type: "project",
        name: "TP",
      });
      await setCollapsed(other, theirs, false);

      await setAllCollapsed(userId, true);

      const theirTree = await loadOutline(other);
      expect(theirTree.find((n) => n.id === theirs)?.collapsed).toBe(false);
      expect(theirTree.filter((n) => !n.hidden)).toHaveLength(2);
    });
  });

  /**
   * Completing a **recurring** task cycles it instead of finishing it. The behaviour has to
   * be identical from both write paths — the grids go through `setState`, the detail
   * drawer's State dropdown goes through `saveNodeDetail` — which is why `saveNodeDetail`
   * is exercised here, beside the helper both of them share.
   */
  describe("recurrence", () => {
    /** A task that repeats, with the fields a completion is supposed to reset. */
    async function recurringTask(opts?: {
      frequency?: RecurrenceFrequency;
      interval?: number;
      owner?: string;
    }) {
      const owner = opts?.owner ?? userId;
      const id = await createNode({
        userId: owner,
        parentId: null,
        type: "task",
        name: "Water the plants",
      });
      await db
        .update(taskDetails)
        .set({
          recurrenceFrequency: opts?.frequency ?? "daily",
          recurrenceInterval: opts?.interval ?? 1,
          effortMinutes: 30,
          effortLeftMinutes: 5,
          percentComplete: 80,
          actualEffortMinutes: 25,
          actualStartDate: new Date(),
        })
        .where(eq(taskDetails.nodeId, id));
      return id;
    }

    async function taskRow(nodeId: string) {
      const [detail] = await db
        .select()
        .from(taskDetails)
        .where(eq(taskDetails.nodeId, nodeId));
      return detail;
    }

    /** The scheduling dates live on `nodes`, so the shelf and the plan are read from here. */
    async function nodeRow(nodeId: string) {
      const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
      return node;
    }

    async function completionsOf(owner: string, nodeId: string) {
      return db
        .select()
        .from(taskCompletions)
        .where(
          and(eq(taskCompletions.userId, owner), eq(taskCompletions.nodeId, nodeId)),
        );
    }

    /** Local `YYYY-MM-DD`, so a DST boundary cannot shift the assertion by a day. */
    function localKey(date: Date): string {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function daysFromToday(days: number): string {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return localKey(d);
    }

    it("comes back shelved until next time instead of staying completed", async () => {
      // Postponed, not Not Started: the deferred date it just acquired *is* the expiry of
      // the postponed state, and a routine you have already done today is not waiting to be
      // started. The State column now says why it is missing from the Chooser instead of
      // leaving that to be inferred.
      const task = await recurringTask();
      await setState(userId, task, "completed");

      const [node] = await loadOutline(userId);
      expect(node.state).toBe("postponed");
      expect(node.completedAt).toBeNull();
    });

    it("defers itself by the interval, measured from the completion", async () => {
      const task = await recurringTask({ frequency: "weekly", interval: 2 });
      await setState(userId, task, "completed");

      const detail = await nodeRow(task);
      expect(localKey(detail.deferredDate!)).toBe(daysFromToday(14));
    });

    it("never acquires a deadline — the entire point of the feature", async () => {
      const task = await recurringTask();
      await setState(userId, task, "completed");

      const [node] = await loadOutline(userId);
      expect(node.deadline).toBeNull();
    });

    it("records each completion, so the history survives the reset", async () => {
      const task = await recurringTask();
      await setState(userId, task, "completed");
      await setState(userId, task, "completed");

      expect(await completionsOf(userId, task)).toHaveLength(2);
      // `dateCompleted` is the last one; `task_completions` is all of them.
      expect((await taskRow(task)).dateCompleted).not.toBeNull();
    });

    it("resets progress so the next cycle starts from zero", async () => {
      const task = await recurringTask();
      await setState(userId, task, "completed");

      const detail = await taskRow(task);
      expect(detail.percentComplete).toBe(0);
      expect(detail.actualEffortMinutes).toBe(0);
      expect(detail.actualStartDate).toBeNull();
      // Work left starts over at the full estimate, not at the 5 minutes that were left.
      expect(detail.effortLeftMinutes).toBe(30);
    });

    it("puts the whole checklist back to Not Started, whatever state each step was in", async () => {
      const parent = await recurringTask({ frequency: "weekly", interval: 1 });
      const done = await createNode({
        userId,
        parentId: parent,
        type: "task",
        name: "Done",
      });
      const cancelled = await createNode({
        userId,
        parentId: parent,
        type: "task",
        name: "Cancelled",
      });
      const started = await createNode({
        userId,
        parentId: parent,
        type: "task",
        name: "Started",
      });
      await setState(userId, done, "completed");
      await setState(userId, cancelled, "cancelled");
      await setState(userId, started, "in_progress");

      await setState(userId, parent, "completed");

      const byId = new Map((await loadOutline(userId)).map((n) => [n.id, n]));
      // Achieve §3.9: the new instance's child items are all initialized to Not Started.
      // Subtasks under a repeating task are the steps for doing it — get the keys, unlock
      // the shed — and none of them carry over to next week's mow. A cancelled step meant
      // "not needed that time"; an in-progress one cannot be half-done on an instance that
      // has not started, or the task would never have needed to recur.
      expect(byId.get(done)!.state).toBe("not_started");
      expect(byId.get(cancelled)!.state).toBe("not_started");
      expect(byId.get(started)!.state).toBe("not_started");
    });

    it("does not settle the subtree it just reset for the next occurrence", async () => {
      // The cascade reads the state the node ended up in, not the one that was asked for.
      // A repeating task never reaches "completed" — it steps on — so its freshly reset
      // steps must stay Not Started rather than being completed behind it.
      const parent = await recurringTask({ frequency: "weekly" });
      const step = await createNode({
        userId,
        parentId: parent,
        type: "task",
        name: "Step",
      });

      await setState(userId, parent, "completed");

      const byId = new Map((await loadOutline(userId)).map((n) => [n.id, n]));
      expect(byId.get(step)!.state).toBe("not_started");
    });

    it("still just completes a task that does not repeat", async () => {
      const task = await recurringTask({ frequency: "none" });
      await setState(userId, task, "completed");

      const [node] = await loadOutline(userId);
      expect(node.state).toBe("completed");
      expect(node.completedAt).not.toBeNull();
      expect(await completionsOf(userId, task)).toHaveLength(0);
      expect((await nodeRow(task)).deferredDate).toBeNull();
    });

    it("clears the stamp when a completed task is reopened", async () => {
      const task = await recurringTask({ frequency: "none" });
      await setState(userId, task, "completed");
      await setState(userId, task, "in_progress");

      const [node] = await loadOutline(userId);
      expect(node.completedAt).toBeNull();
    });

    it("cycles identically when the drawer completes it", async () => {
      // The path most likely to be missed: `saveNodeDetail` writes state without going
      // anywhere near `setState`, and used to stamp `completedAt` on its own.
      const task = await recurringTask({ frequency: "daily", interval: 3 });
      await saveNodeDetail(userId, task, { state: "completed" });

      const [node] = await loadOutline(userId);
      expect(node.state).toBe("postponed");
      expect(localKey((await nodeRow(task)).deferredDate!)).toBe(daysFromToday(3));
      expect(await completionsOf(userId, task)).toHaveLength(1);
    });

    it("cycles a due-again routine from the drawer without leaping other dates", async () => {
      // After cycle 1 the row stores postponed + deferred. Expiry is derived, so when that
      // date has passed the list shows Not started while the form (seeded from effective
      // state) also shows Not started and the user picks Completed. Completing must not use
      // the expired deferred residue as the shift origin — that once jumped target start
      // years into the future and made the save look like it did nothing useful.
      const task = await recurringTask({ frequency: "daily", interval: 1 });
      await db
        .update(taskDetails)
        .set({ recurrenceMode: "regenerate" })
        .where(eq(taskDetails.nodeId, task));
      await setState(userId, task, "completed");
      const yesterday = daysFromToday(-1);
      await db
        .update(nodes)
        .set({
          deferredDate: fromDateKey(yesterday),
          // A far-future residue on the wrong field used to be the shift origin; leave a
          // realistic target start so the leap would be visible if it returned.
          targetStartDate: fromDateKey(yesterday),
        })
        .where(eq(nodes.id, task));

      await saveNodeDetail(userId, task, { state: "completed" });

      const row = await nodeRow(task);
      expect(row.state).toBe("postponed");
      // Regeneration: one day after this completion, not "one day after the stale residue".
      expect(localKey(row.deferredDate!)).toBe(daysFromToday(1));
      expect(localKey(row.targetStartDate!)).toBe(daysFromToday(1));
      expect(await completionsOf(userId, task)).toHaveLength(2);
    });

    it("is not undone by progress values submitted in the same drawer save", async () => {
      // The form posts its whole draft at once. A 100% / completed submit must not leave
      // the regenerated task looking already finished.
      const task = await recurringTask();
      await saveNodeDetail(userId, task, {
        state: "completed",
        task: { percentComplete: 100, dateCompleted: null },
      });

      const detail = await taskRow(task);
      expect(detail.percentComplete).toBe(0);
      expect((await nodeRow(task)).deferredDate).not.toBeNull();
    });

    it("does not re-stamp completedAt when a completed task is saved again", async () => {
      // `state` rides along on every drawer save whether or not it was touched. Re-running
      // the transition would move the completion timestamp each time the notes were edited.
      const task = await recurringTask({ frequency: "none" });
      await setState(userId, task, "completed");
      const [before] = await loadOutline(userId);

      await saveNodeDetail(userId, task, { state: "completed", notes: "later" });

      const [after] = await loadOutline(userId);
      expect(after.completedAt).toEqual(before.completedAt);
    });

    /**
     * The half this slice added: a repeating task moves its **whole** date set, and the two
     * modes differ in what they measure from.
     */
    describe("patterns and modes", () => {
      /** Local midnight, the same thing `DateField` writes. */
      function day(iso: string): Date {
        return new Date(`${iso}T00:00:00`);
      }

      /**
       * `set` is the recurrence rule, which lives on `task_details`. `core` is the dates it
       * is anchored on, which live on `nodes` — deadline, target start and the shelf.
       */
      async function ruleTask(
        set: Partial<typeof taskDetails.$inferInsert>,
        core?: Partial<typeof nodes.$inferInsert>,
      ) {
        const id = await createNode({
          userId,
          parentId: null,
          type: "task",
          name: "Weekly report",
        });
        await db.update(taskDetails).set(set).where(eq(taskDetails.nodeId, id));
        if (core) {
          await db.update(nodes).set(core).where(eq(nodes.id, id));
        }
        return id;
      }

      it("moves every set date by the same number of days, and leaves nulls null", async () => {
        // Start Mon, deadline Fri, no target end. A week on, the four-day window survives
        // and the empty field is still empty.
        const task = await ruleTask(
          {
            recurrenceFrequency: "weekly",
            recurrenceInterval: 1,
            recurrencePattern: "by_weekday",
            recurrenceByWeekday: [5],
          },
          {
            deadline: day("2026-08-07"),
            targetStartDate: day("2026-08-03"),
            deferredDate: day("2026-08-03"),
          },
        );

        await setState(userId, task, "completed");

        const detail = await nodeRow(task);
        const [node] = await loadOutline(userId);
        expect(localKey(node.deadline!)).toBe("2026-08-14");
        expect(localKey(detail.targetStartDate!)).toBe("2026-08-10");
        expect(localKey(detail.deferredDate!)).toBe("2026-08-10");
        expect(detail.targetEndDate).toBeNull();
      });

      it("steps a scheduled task from its own dates, not from the completion", async () => {
        // The school report: finish next Friday's early and you are free until the one
        // after. Measuring from today would give the wrong Friday every time.
        const task = await ruleTask(
          {
            recurrenceFrequency: "weekly",
            recurrencePattern: "by_weekday",
            recurrenceByWeekday: [5],
          },
          { deadline: day("2026-08-07") },
        );

        await setState(userId, task, "completed");

        const [node] = await loadOutline(userId);
        expect(localKey(node.deadline!)).toBe("2026-08-14");
      });

      it("steps a regenerating task from the completion, not from its dates", async () => {
        // Mowing the lawn: whenever you actually do it, the next one is seven days later.
        // The stale date from months ago must not be what it steps from.
        const task = await ruleTask(
          {
            recurrenceFrequency: "weekly",
            recurrenceMode: "regenerate",
          },
          { deferredDate: day("2026-01-01") },
        );

        await setState(userId, task, "completed");

        expect(localKey((await nodeRow(task)).deferredDate!)).toBe(daysFromToday(7));
      });

      it("leaves a missed occurrence still overdue instead of catching it up", async () => {
        // Achieve's rule, and the point of having two modes: you owed last week's report
        // and you still owe this week's. One completion steps you on by one period.
        const task = await ruleTask(
          {
            recurrenceFrequency: "weekly",
            recurrencePattern: "by_weekday",
            recurrenceByWeekday: [5],
          },
          { deadline: day("2026-01-02") },
        );

        await setState(userId, task, "completed");

        const [node] = await loadOutline(userId);
        expect(localKey(node.deadline!)).toBe("2026-01-09");
        expect(node.deadline!.getTime()).toBeLessThan(Date.now());
      });

      it("gives a dateless routine a start and defer date, and still no deadline", async () => {
        // The next occurrence exists the moment you finish this one, so it has to sit
        // somewhere: Achieve's regenerated item comes back with Target Start and Deferred
        // Date filled in and its Deadline still None. A deadline is only ever advanced,
        // never invented — inventing one would put a routine in Overdue beside real
        // constraints, which is the thing this whole feature exists to avoid. Target end
        // and the reminder are only moved: creating either invents a window or an alarm.
        const task = await ruleTask({
          recurrenceFrequency: "daily",
          recurrenceMode: "regenerate",
        });

        await setState(userId, task, "completed");

        const [node] = await loadOutline(userId);
        const detail = await nodeRow(task);
        expect(node.deadline).toBeNull();
        expect(localKey(detail.deferredDate!)).toBe(daysFromToday(1));
        expect(localKey(detail.targetStartDate!)).toBe(daysFromToday(1));
        expect(detail.targetEndDate).toBeNull();
        // Still on `task_details`: a reminder is a task's own alarm, not a scheduling date.
        expect((await taskRow(task)).reminderAt).toBeNull();
      });

      it("creates the same dates when an occurrence is skipped", async () => {
        // Skipping is a completion with the "you did it" half removed, so it must land the
        // dates in exactly the same place.
        const task = await ruleTask({ recurrenceFrequency: "daily" });

        await skipRecurrence(userId, task);

        const [node] = await loadOutline(userId);
        const detail = await nodeRow(task);
        expect(node.deadline).toBeNull();
        expect(localKey(detail.deferredDate!)).toBe(daysFromToday(1));
        expect(localKey(detail.targetStartDate!)).toBe(daysFromToday(1));
      });

      it("follows a monthly ordinal pattern", async () => {
        // The last Saturday of the month. August 2026 has five; September has four.
        const task = await ruleTask(
          {
            recurrenceFrequency: "monthly",
            recurrencePattern: "by_ordinal",
            recurrenceOrdinal: -1,
            recurrenceWeekday: 6,
          },
          { deferredDate: day("2026-08-29") },
        );

        await setState(userId, task, "completed");

        expect(localKey((await nodeRow(task)).deferredDate!)).toBe("2026-09-26");
      });

      it("finishes for real on the last occurrence of a counted series", async () => {
        // Two occurrences: the first cycles, the second ends it. This is the only path on
        // which a repeating task stays completed.
        const task = await ruleTask({
          recurrenceFrequency: "daily",
          recurrenceEnd: "count",
          recurrenceCount: 2,
        });

        await setState(userId, task, "completed");
        expect((await loadOutline(userId))[0].state).toBe("postponed");

        await setState(userId, task, "completed");
        const [node] = await loadOutline(userId);
        expect(node.state).toBe("completed");
        expect(node.completedAt).not.toBeNull();
        expect(await completionsOf(userId, task)).toHaveLength(2);
      });

      it("finishes for real once the until date has passed", async () => {
        const task = await ruleTask({
          recurrenceFrequency: "daily",
          recurrenceEnd: "until",
          recurrenceUntil: day("2026-01-01"),
        });

        await setState(userId, task, "completed");

        expect((await loadOutline(userId))[0].state).toBe("completed");
      });

      it("skips an occurrence without doing it", async () => {
        // Skipping moves the dates and nothing else: no completion logged, so an
        // "end after N" series is not spent and "last completed" still means last done.
        const task = await ruleTask(
          {
            recurrenceFrequency: "weekly",
            recurrencePattern: "by_weekday",
            recurrenceByWeekday: [5],
          },
          { deadline: day("2026-08-07"), deferredDate: day("2026-08-07") },
        );

        await skipRecurrence(userId, task);

        const detail = await nodeRow(task);
        const [node] = await loadOutline(userId);
        expect(localKey(node.deadline!)).toBe("2026-08-14");
        expect(localKey(detail.deferredDate!)).toBe("2026-08-14");
        expect(node.state).toBe("postponed");
        expect((await taskRow(task)).dateCompleted).toBeNull();
        expect(await completionsOf(userId, task)).toHaveLength(0);
      });

      it("leaves the checklist alone when an occurrence is skipped", async () => {
        // None of it happened, so there is nothing to reset — unlike a completion, which
        // starts the next instance's checklist over.
        const task = await ruleTask({ recurrenceFrequency: "daily" });
        const step = await createNode({
          userId,
          parentId: task,
          type: "task",
          name: "Step",
        });
        await setState(userId, step, "in_progress");

        await skipRecurrence(userId, task);

        const byId = new Map((await loadOutline(userId)).map((n) => [n.id, n]));
        expect(byId.get(step)!.state).toBe("in_progress");
      });

      it("refuses to skip a task that does not repeat", async () => {
        const task = await ruleTask({ recurrenceFrequency: "none" });
        await expect(skipRecurrence(userId, task)).rejects.toThrow("does not repeat");
      });

      it("refuses a regenerating task with a calendar pattern", async () => {
        // Enforced by the database, not only by the form: a regenerating task has no
        // stable series start for a weekday pattern to hang off.
        const task = await ruleTask({ recurrenceFrequency: "weekly" });

        await expect(
          db
            .update(taskDetails)
            .set({ recurrenceMode: "regenerate", recurrencePattern: "by_weekday" })
            .where(eq(taskDetails.nodeId, task)),
        ).rejects.toThrow();
      });
    });

    it("does not cycle when recurrence is switched on for an already-completed task", async () => {
      // Complete it while it is a plain task, then open the drawer and set Repeats. The
      // draft still carries `state: "completed"`, which must not read as a fresh completion.
      const task = await recurringTask({ frequency: "none" });
      await setState(userId, task, "completed");
      await saveNodeDetail(userId, task, {
        state: "completed",
        task: { recurrenceFrequency: "daily", recurrenceInterval: 1 },
      });

      const [node] = await loadOutline(userId);
      expect(node.state).toBe("completed");
      expect(await completionsOf(userId, task)).toHaveLength(0);
      expect((await nodeRow(task)).deferredDate).toBeNull();
    });

    it("does not collapse an expired shelf when the drawer re-saves effective Not started", async () => {
      // The form shows ownEffectiveState, so a due-again routine posts `not_started` on a
      // notes-only save. That must not rewrite the stored postponed residue — expiry stays
      // derived. Without the guard, every drawer Save on a due-again routine would sweep it.
      const task = await recurringTask({ frequency: "daily", interval: 1 });
      await setState(userId, task, "completed");
      await db
        .update(nodes)
        .set({ deferredDate: fromDateKey(daysFromToday(-1)) })
        .where(eq(nodes.id, task));

      await saveNodeDetail(userId, task, {
        state: "not_started",
        notes: "just a note",
      });

      const row = await nodeRow(task);
      expect(row.state).toBe("postponed");
      expect(localKey(row.deferredDate!)).toBe(daysFromToday(-1));
      expect(row.notes).toBe("just a note");
      expect(await completionsOf(userId, task)).toHaveLength(1);
    });
  });

  describe("completion cascade", () => {
    /** area > goal > project > (task-a, task-b > subtask). Ids by name. */
    async function branch(): Promise<Record<string, string>> {
      const area = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Area",
      });
      const goal = await createNode({
        userId,
        parentId: area,
        type: "goal",
        name: "Goal",
      });
      const project = await createNode({
        userId,
        parentId: goal,
        type: "project",
        name: "Project",
      });
      const taskA = await createNode({
        userId,
        parentId: project,
        type: "task",
        name: "Task A",
      });
      const taskB = await createNode({
        userId,
        parentId: project,
        type: "task",
        name: "Task B",
      });
      const subtask = await createNode({
        userId,
        parentId: taskB,
        type: "task",
        name: "Subtask",
      });
      return { area, goal, project, taskA, taskB, subtask };
    }

    async function statesOf(ids: Record<string, string>) {
      const byId = new Map((await loadOutline(userId)).map((n) => [n.id, n]));
      return Object.fromEntries(
        Object.entries(ids).map(([name, id]) => [name, byId.get(id)?.state]),
      );
    }

    it("completes every open descendant, at any depth", async () => {
      const ids = await branch();
      await setState(userId, ids.project, "completed");

      expect(await statesOf(ids)).toMatchObject({
        project: "completed",
        taskA: "completed",
        taskB: "completed",
        subtask: "completed",
        // Ancestors are a claim about work below them, and that claim has not changed.
        goal: "not_started",
        area: null,
      });
    });

    it("cancels open descendants but leaves finished work completed", async () => {
      const ids = await branch();
      await setState(userId, ids.taskA, "completed");
      await setState(userId, ids.project, "cancelled");

      expect(await statesOf(ids)).toMatchObject({
        project: "cancelled",
        taskA: "completed",
        taskB: "cancelled",
        subtask: "cancelled",
      });
    });

    it("stamps completedAt on the cascaded rows, not just the one that was clicked", async () => {
      const ids = await branch();
      await setState(userId, ids.project, "completed");

      const rows = await db
        .select({ id: nodes.id, completedAt: nodes.completedAt })
        .from(nodes)
        .where(eq(nodes.userId, userId));
      for (const row of rows) {
        if (row.id === ids.area || row.id === ids.goal) continue;
        expect(row.completedAt, `completedAt for ${row.id}`).not.toBeNull();
      }
    });

    it("reopens settled ancestors as in progress when a child is re-opened", async () => {
      const ids = await branch();
      await setState(userId, ids.goal, "completed");
      await setState(userId, ids.subtask, "in_progress");

      expect(await statesOf(ids)).toMatchObject({
        subtask: "in_progress",
        taskB: "in_progress",
        project: "in_progress",
        goal: "in_progress",
        area: null,
        // Re-opening never reaches sideways or down: Task A really was finished.
        taskA: "completed",
      });
    });

    it("treats cancelling a child as settled, so the parent stays settled", async () => {
      // Achieve reopens the parent here; we do not, because cancelled is settled too.
      const ids = await branch();
      await setState(userId, ids.project, "completed");
      await setState(userId, ids.taskA, "cancelled");

      expect(await statesOf(ids)).toMatchObject({
        project: "completed",
        taskA: "cancelled",
      });
    });

    it("leaves the whole branch settled or open, never half of each", async () => {
      const ids = await branch();
      await setState(userId, ids.goal, "completed");
      const states = await statesOf(ids);
      expect(states.area).toBeNull();
      expect(
        Object.entries(states)
          .filter(([name]) => name !== "area")
          .every(([, state]) => state === "completed"),
      ).toBe(true);
    });

    it("cannot cascade across users", async () => {
      // The failure this guards is a cascade that walks the tree without scoping: another
      // user's node id is a plausible parent, and settling a stranger's subtree would be
      // invisible from either side.
      const ids = await branch();
      const other = await makeUser();
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });
      const theirTask = await createNode({
        userId: other,
        parentId: theirs,
        type: "task",
        name: "Their task",
      });

      await setState(userId, ids.goal, "completed");
      // Reading, changing and clearing the other user's rows from this user all fail.

      const theirRows = new Map((await loadOutline(other)).map((n) => [n.id, n]));
      expect(theirRows.get(theirTask)!.state).toBe("not_started");

      await setState(userId, theirTask, "completed");
      expect((await loadOutline(other)).find((n) => n.id === theirTask)!.state).toBe(
        "not_started",
      );

      await deleteNode(userId, theirs);
      expect((await loadOutline(other)).map((n) => n.id)).toContain(theirs);
    });

    it("rejects completion on a Result Area without touching its descendants", async () => {
      const ids = await branch();
      await expect(setState(userId, ids.area, "completed")).rejects.toThrow(
        "Result Areas do not have a state",
      );
      expect(await statesOf(ids)).toMatchObject({
        area: null,
        goal: "not_started",
        project: "not_started",
        taskA: "not_started",
      });
    });
  });

  describe("user isolation", () => {
    it("does not load another user's nodes", async () => {
      const other = await makeUser();
      await createNode({ userId, parentId: null, type: "result_area", name: "Mine" });
      await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });

      expect(await outlineOf(userId)).toEqual(["Mine"]);
      expect(await outlineOf(other)).toEqual(["Theirs"]);
    });

    it("does not delete another user's node", async () => {
      const other = await makeUser();
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });

      await deleteNode(userId, theirs);
      expect(await outlineOf(other)).toEqual(["Theirs"]);
    });

    it("does not rename another user's node", async () => {
      const other = await makeUser();
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });

      await renameNode(userId, theirs, "Hijacked");
      expect(await outlineOf(other)).toEqual(["Theirs"]);
    });

    it("does not move a node under another user's parent", async () => {
      const other = await makeUser();
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "result_area",
        name: "Theirs",
      });
      const mine = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Mine",
      });

      await expect(
        moveNode({ userId, nodeId: mine, parentId: theirs, position: { at: "last" } }),
      ).rejects.toThrow("Node not found");
    });

    it("does not complete or cycle another user's recurring task", async () => {
      const other = await makeUser();
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "task",
        name: "Theirs",
      });
      await db
        .update(taskDetails)
        .set({ recurrenceFrequency: "daily", recurrenceInterval: 1 })
        .where(eq(taskDetails.nodeId, theirs));

      await setState(userId, theirs, "completed");

      const [node] = await loadOutline(other);
      expect(node.state).toBe("not_started");
      const [detail] = await db.select().from(nodes).where(eq(nodes.id, theirs));
      expect(detail.deferredDate).toBeNull();
      expect(
        await db
          .select()
          .from(taskCompletions)
          .where(eq(taskCompletions.nodeId, theirs)),
      ).toHaveLength(0);
    });

    it("does not let the drawer path reach another user's task", async () => {
      const other = await makeUser();
      const theirs = await createNode({
        userId: other,
        parentId: null,
        type: "task",
        name: "Theirs",
      });

      await expect(
        saveNodeDetail(userId, theirs, { state: "completed" }),
      ).rejects.toThrow("Node not found");
    });

    it("scopes the completion log to its owner", async () => {
      const other = await makeUser();
      const mine = await createNode({
        userId,
        parentId: null,
        type: "task",
        name: "Mine",
      });
      await db
        .update(taskDetails)
        .set({ recurrenceFrequency: "daily", recurrenceInterval: 1 })
        .where(eq(taskDetails.nodeId, mine));
      await setState(userId, mine, "completed");

      // The other user can neither see the row nor delete it by guessing the node id.
      expect(
        await db
          .select()
          .from(taskCompletions)
          .where(
            and(eq(taskCompletions.userId, other), eq(taskCompletions.nodeId, mine)),
          ),
      ).toHaveLength(0);

      await db
        .delete(taskCompletions)
        .where(
          and(eq(taskCompletions.userId, other), eq(taskCompletions.nodeId, mine)),
        );
      expect(
        await db
          .select()
          .from(taskCompletions)
          .where(
            and(eq(taskCompletions.userId, userId), eq(taskCompletions.nodeId, mine)),
          ),
      ).toHaveLength(1);
    });
  });
});
