import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { metrics, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNode, deleteNode } from "@/lib/tree/mutations";
import {
  createMetric,
  createMetricEntry,
  deleteMetric,
  deleteMetricEntry,
  importMetricEntries,
  updateMetric,
  updateMetricEntry,
} from "./mutations";
import { getMetricDetail, listMetrics, listMetricsForOwner } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("metrics mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `metrics-test-${crypto.randomUUID()}@localhost`,
      name: "Metrics Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("metrics mutations", () => {
  let userId: string;
  let goalId: string;

  beforeEach(async () => {
    userId = await makeUser();
    const areaId = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Health",
    });
    goalId = await createNode({
      userId,
      parentId: areaId,
      type: "goal",
      name: "Stunning Body",
    });
  });

  it("creates a standalone metric and lists it", async () => {
    const id = await createMetric(userId, {
      title: "Words Per Minute",
      category: "Writing",
      question: "How WPM did you type today?",
      objectiveTarget: 50,
    });

    const list = await listMetrics(userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id,
      title: "Words Per Minute",
      ownerNodeId: null,
      objectiveTarget: 50,
      lastValue: null,
    });
  });

  it("associates with a goal and survives goal delete as ownerless", async () => {
    const id = await createMetric(userId, {
      title: "Waist Width",
      ownerNodeId: goalId,
      objectiveTarget: 80,
    });

    expect((await listMetricsForOwner(userId, goalId)).map((m) => m.id)).toEqual([id]);

    await createMetricEntry(userId, id, {
      entryDate: "2016-01-05",
      value: 95,
      target: 80,
    });

    await deleteNode(userId, goalId);

    const detail = await getMetricDetail(userId, id);
    expect(detail).not.toBeNull();
    expect(detail!.ownerNodeId).toBeNull();
    expect(detail!.entries).toHaveLength(1);
    expect(detail!.lastValue).toBe(95);
  });

  it("tracks last value from the latest entry date", async () => {
    const id = await createMetric(userId, { title: "Weight" });
    await createMetricEntry(userId, id, { entryDate: "2024-01-01", value: 180 });
    await createMetricEntry(userId, id, { entryDate: "2025-06-01", value: 175.5 });
    await createMetricEntry(userId, id, { entryDate: "2023-01-01", value: 190 });

    const detail = await getMetricDetail(userId, id);
    expect(detail!.lastValue).toBe(175.5);
    expect(detail!.lastDate).toBe("2025-06-01");
  });

  it("updates and deletes entries", async () => {
    const id = await createMetric(userId, { title: "Chest" });
    const entryId = await createMetricEntry(userId, id, {
      entryDate: "2025-01-01",
      value: 100,
    });
    await updateMetricEntry(userId, entryId, { value: 98 });
    expect((await getMetricDetail(userId, id))!.entries[0].value).toBe(98);

    await deleteMetricEntry(userId, entryId);
    expect((await getMetricDetail(userId, id))!.entries).toHaveLength(0);
  });

  it("deletes a metric and its entries", async () => {
    const id = await createMetric(userId, { title: "Gone" });
    await createMetricEntry(userId, id, { entryDate: "2025-01-01", value: 1 });
    await deleteMetric(userId, id);
    expect(await getMetricDetail(userId, id)).toBeNull();
  });

  it("does not let a second user read, change, or delete the first user's metric", async () => {
    const otherId = await makeUser();
    const id = await createMetric(userId, { title: "Private" });
    const entryId = await createMetricEntry(userId, id, {
      entryDate: "2025-01-01",
      value: 1,
    });

    expect(await getMetricDetail(otherId, id)).toBeNull();
    expect(await listMetrics(otherId)).toHaveLength(0);

    await expect(updateMetric(otherId, id, { title: "Hacked" })).rejects.toThrow(
      /not found/i,
    );
    await expect(deleteMetric(otherId, id)).rejects.toThrow(/not found/i);
    await expect(updateMetricEntry(otherId, entryId, { value: 99 })).rejects.toThrow(
      /not found/i,
    );
    await expect(deleteMetricEntry(otherId, entryId)).rejects.toThrow(/not found/i);
    await expect(
      importMetricEntries(otherId, id, [{ entryDate: "2025-02-01", value: 2 }]),
    ).rejects.toThrow(/not found/i);

    const still = await getMetricDetail(userId, id);
    expect(still!.title).toBe("Private");
    expect(still!.entries[0].value).toBe(1);
  });

  it("imports entries and skips date+value duplicates on re-import", async () => {
    const id = await createMetric(userId, { title: "Dante weight" });
    const first = await importMetricEntries(userId, id, [
      { entryDate: "2025-10-29", value: 93 },
      { entryDate: "2025-09-16", value: 94.7 },
      { entryDate: "2025-09-02", value: 93.5 },
    ]);
    expect(first.created).toBe(3);
    expect(first.skipped).toBe(0);

    const second = await importMetricEntries(userId, id, [
      { entryDate: "2025-10-29", value: 93 },
      { entryDate: "2025-01-14", value: 63.4 },
    ]);
    expect(second.created).toBe(1);
    expect(second.skipped).toBe(1);

    const detail = await getMetricDetail(userId, id);
    expect(detail!.entries).toHaveLength(4);
    expect(detail!.lastValue).toBe(93);
  });

  it("rejects a non-goal owner", async () => {
    const projectId = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Not a goal",
    });
    await expect(
      createMetric(userId, { title: "Bad", ownerNodeId: projectId }),
    ).rejects.toThrow(/goal/i);
  });

  it("updates metric fields including clearing the owner", async () => {
    const id = await createMetric(userId, {
      title: "Adonis Index",
      ownerNodeId: goalId,
      objectiveTarget: 1.618,
    });
    await updateMetric(userId, id, {
      title: "Adonis",
      ownerNodeId: null,
      objectiveTarget: null,
      active: false,
    });
    const detail = await getMetricDetail(userId, id);
    expect(detail).toMatchObject({
      title: "Adonis",
      ownerNodeId: null,
      objectiveTarget: null,
      active: false,
    });
  });
});

describeDb("metrics owner join", () => {
  /**
   * `assertOwnerOk` refuses another user's node, so this row cannot be reached through the
   * mutations — which is exactly why the *query* needs its own guard. Written straight into
   * the table so the assertion is about the join and nothing else: drop `userId` from the
   * `leftJoin` in `queries.ts` and both reads start reporting a stranger's goal name.
   */
  it("never reads an owner name belonging to another user", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();

    const strangerGoal = await createNode({
      userId: stranger,
      parentId: null,
      type: "goal",
      name: "Stranger's Private Goal",
    });

    const metricId = await createMetric(owner, { title: "Waist" });
    await db
      .update(metrics)
      .set({ ownerNodeId: strangerGoal })
      .where(eq(metrics.id, metricId));

    const [listed] = await listMetrics(owner);
    expect(listed.ownerName).toBeNull();

    const detail = await getMetricDetail(owner, metricId);
    expect(detail!.ownerName).toBeNull();
  });
});

describeDb("metrics cascade from user", () => {
  it("removing the user removes their metrics", async () => {
    const userId = await makeUser();
    await createMetric(userId, { title: "Temp" });
    await db.delete(users).where(eq(users.id, userId));
    const remaining = await db.select().from(metrics).where(eq(metrics.userId, userId));
    expect(remaining).toHaveLength(0);
    // Prevent afterAll double-delete noise for this id.
    const idx = createdUserIds.indexOf(userId);
    if (idx >= 0) createdUserIds.splice(idx, 1);
  });
});
