import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { goalDetails, nodes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode } from "@/lib/tree/mutations";
import {
  createNodeItem,
  deleteNodeItem,
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

  it("saves core fields and the side table together", async () => {
    await saveNodeDetail(userId, areaId, {
      name: "Career & Craft",
      priorityLetter: "A",
      priorityRank: 1,
      state: "in_progress",
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

  it("writes only the side table matching the record's own type", async () => {
    // A Result Area is sent Project values; they must be dropped, not stored.
    await saveNodeDetail(userId, areaId, {
      name: "Career",
      priorityLetter: null,
      priorityRank: null,
      state: "not_started",
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
  });
});
