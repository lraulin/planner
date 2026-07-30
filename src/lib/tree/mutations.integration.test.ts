import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
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
    await createNode({ userId, parentId: null, type: "result_area", name: "Work" });
    expect(await outlineOf(userId)).toEqual(["Work"]);
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
  });
});
