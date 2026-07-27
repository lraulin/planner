import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createNode,
  deleteNode,
  indentNode,
  moveNode,
  moveNodeVertically,
  outdentNode,
  renameNode,
  setPriority,
} from "./mutations";
import { loadOutline } from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`). Each test works under its
 * own user, so these never touch seeded development data.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabase ? describe : describe.skip;

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

  it("rejects a type that cannot sit at the top level", async () => {
    await expect(
      createNode({ userId, parentId: null, type: "task", name: "Nope" }),
    ).rejects.toThrow("A Task cannot go under the top level.");
  });

  it("rejects a type that cannot sit under the given parent", async () => {
    const area = await createNode({ userId, parentId: null, type: "result_area" });
    await expect(
      createNode({ userId, parentId: area, type: "task", name: "Nope" }),
    ).rejects.toThrow("A Task cannot go under a Result Area.");
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
      // Outdent the task so it becomes a sibling of the project, then try to indent it
      // under a Result Area sibling instead.
      await outdentNode(userId, task).catch(() => undefined);

      const second = await createNode({
        userId,
        parentId: null,
        type: "result_area",
        name: "Home",
      });
      await expect(
        moveNode({ userId, nodeId: task, parentId: second, position: { at: "last" } }),
      ).rejects.toThrow("A Task cannot go under a Result Area.");
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

    it("refuses when the result would be an illegal nesting", async () => {
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

      // Outdenting the task would place it directly under the Result Area.
      await expect(outdentNode(userId, task)).rejects.toThrow(
        "A Task cannot go under a Result Area.",
      );
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
