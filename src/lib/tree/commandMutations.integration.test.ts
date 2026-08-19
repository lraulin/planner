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
  setPriority,
  setPriorityForNodes,
  setState,
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

  it("keeps a sibling group dense and unique however the ranks are typed", async () => {
    // The invariant this guards: a node's priority is blank or a letter *with* a rank, and
    // within one parent and letter the ranks run 1..n with no gaps and no ties. It cannot be
    // maintained one row at a time, so every write renumbers the whole group.
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Area",
    });
    const ids: Record<string, string> = {};
    for (const name of ["First", "Second", "Third"]) {
      ids[name] = await createNode({ userId, parentId: area, type: "task", name });
    }

    const ranksIn = async (): Promise<[string, string | null, number | null][]> =>
      (await loadOutline(userId))
        .filter((row) => row.parentId === area)
        .map((row) => [row.name, row.priorityLetter, row.priorityRank]);

    // A bare letter appends rather than storing a letter with no rank.
    await setPriority(userId, ids.First, "A", null);
    await setPriority(userId, ids.Second, "A", null);
    expect(await ranksIn()).toEqual([
      ["First", "A", 1],
      ["Second", "A", 2],
      ["Third", null, null],
    ]);

    // A rank past the end clamps instead of leaving a gap.
    await setPriority(userId, ids.Third, "A", 99);
    expect(await ranksIn()).toEqual([
      ["First", "A", 1],
      ["Second", "A", 2],
      ["Third", "A", 3],
    ]);

    // Claiming a taken rank pushes the rest down rather than tying with it.
    await setPriority(userId, ids.Third, "A", 1);
    expect(await ranksIn()).toEqual([
      ["First", "A", 2],
      ["Second", "A", 3],
      ["Third", "A", 1],
    ]);

    // Clearing closes the gap it leaves behind.
    await setPriority(userId, ids.Third, null, null);
    expect(await ranksIn()).toEqual([
      ["First", "A", 1],
      ["Second", "A", 2],
      ["Third", null, null],
    ]);
  });

  it("renumbers siblings a grid filter would have hidden", async () => {
    // The pool is the complete child set, never the rows on screen. Renumbering only what a
    // filter left visible would silently collapse the ranks of everything it hid.
    const area = await createNode({
      userId,
      parentId: null,
      type: "result_area",
      name: "Area",
    });
    const hidden = await createNode({
      userId,
      parentId: area,
      type: "task",
      name: "Hidden",
    });
    const visible = await createNode({
      userId,
      parentId: area,
      type: "task",
      name: "Visible",
    });
    await setPriority(userId, hidden, "A", 1);
    await setState(userId, hidden, "completed");

    // A completed sibling is filtered out of most views but still holds A1.
    await setPriority(userId, visible, "A", 1);

    const rows = await loadOutline(userId);
    expect(rows.find((row) => row.id === visible)?.priorityRank).toBe(1);
    expect(rows.find((row) => row.id === hidden)?.priorityRank).toBe(2);
  });

  it("ranks a whole selection in outline order, in one action", async () => {
    // The motivating case: a series of videos to watch in order. Ranking them one at a time
    // is the busy work the model change exists to remove, so a selection takes one letter
    // and comes out A1..An in the order they sit in the outline.
    const project = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Series",
    });
    const ids: string[] = [];
    for (const name of ["one", "two", "three", "four"]) {
      ids.push(await createNode({ userId, parentId: project, type: "task", name }));
    }

    // Deliberately not in outline order — the command reads sortKey, not click order, or a
    // grid sorted by name would rank them alphabetically.
    await setPriorityForNodes(userId, [ids[2], ids[0], ids[3], ids[1]], "A", null);

    const ranked = (await loadOutline(userId))
      .filter((row) => row.parentId === project)
      .map((row) => `${row.name}:${row.priorityLetter}${row.priorityRank}`);
    expect(ranked).toEqual(["one:A1", "two:A2", "three:A3", "four:A4"]);
  });

  it("puts a selection at the top and pushes the existing ranks down", async () => {
    const project = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Series",
    });
    const held: string[] = [];
    for (const name of ["old1", "old2"]) {
      held.push(await createNode({ userId, parentId: project, type: "task", name }));
    }
    for (const id of held) await setPriority(userId, id, "A", null);

    const fresh: string[] = [];
    for (const name of ["new1", "new2"]) {
      fresh.push(await createNode({ userId, parentId: project, type: "task", name }));
    }
    await setPriorityForNodes(userId, fresh, "A", 1);

    const ranked = Object.fromEntries(
      (await loadOutline(userId))
        .filter((row) => row.parentId === project)
        .map((row) => [row.name, `${row.priorityLetter}${row.priorityRank}`]),
    );
    expect(ranked).toEqual({ new1: "A1", new2: "A2", old1: "A3", old2: "A4" });
  });

  it("ranks each parent as its own group when the selection spans parents", async () => {
    // Priority is sibling-relative, so two parents both getting an A1 is correct, not a tie.
    const left = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Left",
    });
    const right = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Right",
    });
    const l = await createNode({ userId, parentId: left, type: "task", name: "l" });
    const r = await createNode({ userId, parentId: right, type: "task", name: "r" });

    await setPriorityForNodes(userId, [l, r], "A", null);

    const rows = await loadOutline(userId);
    expect(rows.find((row) => row.id === l)?.priorityRank).toBe(1);
    expect(rows.find((row) => row.id === r)?.priorityRank).toBe(1);
  });

  it("does not let one user rank another user's rows", async () => {
    const otherUserId = await makeUser();
    const project = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Mine",
    });
    const mine = await createNode({
      userId,
      parentId: project,
      type: "task",
      name: "task",
    });
    await setPriority(userId, mine, "B", null);

    await setPriorityForNodes(otherUserId, [mine], "A", 1).catch(() => undefined);

    const row = (await loadOutline(userId)).find((entry) => entry.id === mine);
    expect(row?.priorityLetter).toBe("B");
    expect(row?.priorityRank).toBe(1);
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

  it("clears lifecycle data when converting to a Result Area and initializes it on exit", async () => {
    const project = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Long-running concern",
    });
    await setState(userId, project, "completed");
    await saveNodeDetail(userId, project, {
      deferredDate: fromDateKey("2027-02-15"),
    });

    await convertNode(userId, project, "result_area");
    let [row] = await db.select().from(nodes).where(eq(nodes.id, project));
    expect(row).toMatchObject({
      type: "result_area",
      state: null,
      completedAt: null,
      deferredDate: null,
    });

    await convertNode(userId, project, "project");
    [row] = await db.select().from(nodes).where(eq(nodes.id, project));
    expect(row).toMatchObject({
      type: "project",
      state: "not_started",
      completedAt: null,
      deferredDate: null,
    });
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
    await setPriority(otherUserId, nodeId, "A", 1).catch(() => undefined);
    await convertNode(otherUserId, nodeId, "project").catch(() => undefined);
    await deleteNode(otherUserId, nodeId);

    const [row] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.id, nodeId)));
    expect(row.name).toBe("Private");
    expect(row.type).toBe("task");
    // setPriority renumbers a whole sibling group, so a dropped userId would not just edit
    // one foreign row — it would rewrite every sibling of it.
    expect(row.priorityLetter).toBeNull();
    expect(row.priorityRank).toBeNull();
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
