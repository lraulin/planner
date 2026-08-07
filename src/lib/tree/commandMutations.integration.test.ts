import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dailyItems, goalDetails, nodes, taskDetails, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { fromDateKey, localDateKey } from "@/lib/schedule/geometry";
import { saveNodeDetail } from "@/lib/detail/mutations";
import { loadOutline } from "./queries";
import {
  convertNode,
  createNode,
  deleteNode,
  removePriorityGaps,
  reprioritizeUnique,
  setPriority,
} from "./mutations";

const reachable = await databaseReachable();
const describeDb = reachable ? describe : describe.skip;
if (!reachable) warnDatabaseSkipped("command deck tree mutations");

const userIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `command-${crypto.randomUUID()}@localhost`, name: "Command Test" })
    .returning({ id: users.id });
  userIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const userId of userIds) await db.delete(users).where(eq(users.id, userId));
});

describeDb("shared command mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("repairs complete sibling priorities and keeps hidden siblings in the set", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Area",
    });
    const first = await createNode({
      userId,
      parentId: area,
      type: "task",
      name: "First",
    });
    const second = await createNode({
      userId,
      parentId: area,
      type: "task",
      name: "Second",
    });
    const third = await createNode({
      userId,
      parentId: area,
      type: "task",
      name: "Third",
    });
    await setPriority(userId, first, "A", 1);
    await setPriority(userId, second, "A", 7);
    await setPriority(userId, third, "A", null);

    await removePriorityGaps(userId, second);
    const rows = await loadOutline(userId);
    expect(
      rows
        .filter((row) => row.parentId === area)
        .map((row) => [row.name, row.priorityRank]),
    ).toEqual([
      ["First", 1],
      ["Second", 2],
      ["Third", null],
    ]);

    await reprioritizeUnique(userId, second);
    const afterUnique = await loadOutline(userId);
    expect(afterUnique.find((row) => row.id === second)?.priorityRank).toBe(1);
    expect(afterUnique.find((row) => row.id === first)?.priorityRank).toBe(2);
  });

  it("replaces detail rows transactionally and auto-hoists a converted child", async () => {
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Area",
    });
    const project = await createNode({
      userId,
      parentId: area,
      type: "project",
      name: "Project",
    });
    const task = await createNode({
      userId,
      parentId: project,
      type: "task",
      name: "Task",
    });

    await convertNode(userId, task, "goal");

    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.id, task)));
    expect(row.type).toBe("goal");
    expect(row.parentId).toBe(area);
    expect(
      await db.select().from(taskDetails).where(eq(taskDetails.nodeId, task)),
    ).toEqual([]);
    expect(
      (await db.select().from(goalDetails).where(eq(goalDetails.nodeId, task))).length,
    ).toBe(1);
  });

  // Every detail table is keyed by `nodeId`, so a conversion that does not change the type
  // must not take the "insert a fresh detail row" branch — the row is already there. The
  // More menu lists every kind, including the one the row already is, so this is two clicks
  // away rather than a theoretical call.
  it("treats converting a node to the kind it already is as a no-op", async () => {
    const project = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Same kind",
    });

    await expect(convertNode(userId, project, "project")).resolves.toBeUndefined();

    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.id, project)));
    expect(row.type).toBe("project");
  });

  it("keeps a Goal's detail row when only the Dream flag changes", async () => {
    const goal = await createNode({
      userId,
      parentId: null,
      type: "goal",
      name: "Ship it",
    });

    await convertNode(userId, goal, "dream");
    const [asDream] = await db
      .select()
      .from(goalDetails)
      .where(eq(goalDetails.nodeId, goal));
    expect(asDream.isDream).toBe(true);

    await convertNode(userId, goal, "goal");
    const [backToGoal] = await db
      .select()
      .from(goalDetails)
      .where(eq(goalDetails.nodeId, goal));
    expect(backToGoal.isDream).toBe(false);
  });

  it("does not let another user read, mutate, convert, or delete the first user's node", async () => {
    const otherUserId = await makeUser();
    const nodeId = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Private",
    });

    expect((await loadOutline(otherUserId)).some((row) => row.id === nodeId)).toBe(
      false,
    );
    await removePriorityGaps(otherUserId, nodeId).catch(() => undefined);
    await convertNode(otherUserId, nodeId, "project").catch(() => undefined);
    await deleteNode(otherUserId, nodeId);

    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.id, nodeId)));
    expect(row.name).toBe("Private");
    expect(row.type).toBe("task");
  });

  // `syncDayLineToTargetStart` only acts on tasks, so converting a planned task to a
  // project used to leave an open day line pointing at a non-task — the Day page listed a
  // Project among the day's work.
  it("clears an open day line when a task is converted to a project", async () => {
    const task = await createNode({
      userId,
      parentId: null,
      type: "task",
      name: "Becomes a project",
    });
    // Tomorrow so the line stays on its plan day rather than being pulled to today by the
    // Behind Schedule rule (which reads the real clock).
    const planDay = localDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await saveNodeDetail(userId, task, { targetStartDate: fromDateKey(planDay) });

    const before = await db
      .select()
      .from(dailyItems)
      .where(
        and(
          eq(dailyItems.userId, userId),
          eq(dailyItems.nodeId, task),
          isNull(dailyItems.completedAt),
        ),
      );
    expect(before).toHaveLength(1);

    await convertNode(userId, task, "project");

    const after = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, task)));
    expect(after).toHaveLength(0);

    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.id, task)));
    expect(row.type).toBe("project");
  });
});
