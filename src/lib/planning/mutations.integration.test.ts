import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { nodes, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { initialStateForType } from "@/lib/tree/lifecycle";
import {
  deleteWeeklyPlan,
  ensureWeeklyPlan,
  setFocusArea,
  setWeeklyPlanCompleted,
  updateWeeklyPlan,
  upsertPlanEntry,
} from "./mutations";
import {
  getWeeklyPlan,
  getWeeklyPlanById,
  listPlanEntries,
  listWeeklyPlans,
  loadPreviousRewrites,
} from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/schedule/mutations.integration.test.ts`. One fresh user per test.
 *
 * The cross-user block at the bottom is the reason this file exists as much as the happy
 * paths: a weekly plan is reachable by uuid from several places, and a `where` clause that
 * forgets `userId` would let one account read and rewrite another's week.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("weekly planning mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

let sortKeyCounter = 0;

/** Root-level node with a sort key nobody else in the suite will claim. */
async function makeNode(
  userId: string,
  type: "result_area" | "goal" | "project",
): Promise<string> {
  const sortKey = `V${sortKeyCounter++}`;
  const [node] = await db
    .insert(nodes)
    .values({
      userId,
      type,
      state: initialStateForType(type),
      name: `${type} ${sortKey}`,
      sortKey,
    })
    .returning({ id: nodes.id });
  return node.id;
}

/** A Wednesday. Its Sunday-start week begins on 2026-07-26. */
const midWeek = () => new Date(2026, 6, 29, 15, 30);
const sundayOfThatWeek = () => new Date(2026, 6, 26);

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("weekly plans", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("normalizes any day in the week to that week's start", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    expect(plan.weekStart).toEqual(sundayOfThatWeek());
  });

  it("resumes the same plan for any other day of the same week", async () => {
    const first = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const second = await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 31) });
    expect(second.id).toBe(first.id);
  });

  it("honours a Monday-start week rather than always snapping to Sunday", async () => {
    const plan = await ensureWeeklyPlan(userId, {
      weekStart: midWeek(),
      weekStartsOn: 1,
    });
    expect(plan.weekStart).toEqual(new Date(2026, 6, 27));
    expect(plan.weekStartsOn).toBe(1);
  });

  it("keeps Sunday- and Monday-start plans for the same calendar week apart", async () => {
    // They are genuinely different weeks — different seven days — so two rows is correct.
    const sunday = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const monday = await ensureWeeklyPlan(userId, {
      weekStart: midWeek(),
      weekStartsOn: 1,
    });
    expect(monday.id).not.toBe(sunday.id);
  });

  it("falls back to Sunday when handed a nonsense start day", async () => {
    const plan = await ensureWeeklyPlan(userId, {
      weekStart: midWeek(),
      weekStartsOn: 9,
    });
    expect(plan.weekStartsOn).toBe(0);
  });

  it("applies a changed review toggle when resuming", async () => {
    await ensureWeeklyPlan(userId, { weekStart: midWeek(), reviewAreasGoals: true });
    const resumed = await ensureWeeklyPlan(userId, {
      weekStart: midWeek(),
      reviewAreasGoals: false,
    });
    expect(resumed.reviewAreasGoals).toBe(false);
  });

  it("stores the week's budget and step 5 settings", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const updated = await updateWeeklyPlan(userId, plan.id, {
      availableMinutes: 40 * 60,
      blockSizeMinutes: 45,
      avoidCollisions: false,
    });
    expect(updated.availableMinutes).toBe(2400);
    expect(updated.blockSizeMinutes).toBe(45);
    expect(updated.avoidCollisions).toBe(false);
  });

  it("refuses a block size that would make dropping impossible", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const updated = await updateWeeklyPlan(userId, plan.id, { blockSizeMinutes: 0 });
    expect(updated.blockSizeMinutes).toBe(5);
  });

  it("clears the budget when handed null, rather than storing zero", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    await updateWeeklyPlan(userId, plan.id, { availableMinutes: 600 });
    const cleared = await updateWeeklyPlan(userId, plan.id, { availableMinutes: null });
    expect(cleared.availableMinutes).toBeNull();
  });

  it("completes and reopens a plan", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const done = await setWeeklyPlanCompleted(userId, plan.id, true);
    expect(done.completedAt).not.toBeNull();
    const reopened = await setWeeklyPlanCompleted(userId, plan.id, false);
    expect(reopened.completedAt).toBeNull();
  });

  it("finds a plan by the week it covers", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const found = await getWeeklyPlan(userId, new Date(2026, 6, 30));
    expect(found?.id).toBe(plan.id);
  });

  it("lists plans newest week first", async () => {
    await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 5) });
    await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 26) });
    const list = await listWeeklyPlans(userId);
    expect(list.map((p) => p.weekStart)).toEqual([
      new Date(2026, 6, 26),
      new Date(2026, 6, 5),
    ]);
  });

  it("deletes a plan and its entries with it", async () => {
    const plan = await ensureWeeklyPlan(userId, { weekStart: midWeek() });
    const nodeId = await makeNode(userId, "project");
    await upsertPlanEntry(userId, plan.id, nodeId, { committedMinutes: 120 });

    await deleteWeeklyPlan(userId, plan.id);

    expect(await getWeeklyPlanById(userId, plan.id)).toBeNull();
    expect(await listPlanEntries(userId, plan.id)).toHaveLength(0);
  });
});

describeDb("plan entries", () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    userId = await makeUser();
    planId = (await ensureWeeklyPlan(userId, { weekStart: midWeek() })).id;
  });

  it("creates one row per node and updates it in place afterwards", async () => {
    const nodeId = await makeNode(userId, "project");
    await upsertPlanEntry(userId, planId, nodeId, { committedMinutes: 120 });
    await upsertPlanEntry(userId, planId, nodeId, { committedMinutes: 180 });

    const entries = await listPlanEntries(userId, planId);
    expect(entries).toHaveLength(1);
    expect(entries[0].committedMinutes).toBe(180);
  });

  it("leaves untouched fields alone when patching one of them", async () => {
    const nodeId = await makeNode(userId, "goal");
    await upsertPlanEntry(userId, planId, nodeId, { rewrite: "Run a half marathon" });
    await upsertPlanEntry(userId, planId, nodeId, { reviewed: true });

    const [entry] = await listPlanEntries(userId, planId);
    expect(entry.rewrite).toBe("Run a half marathon");
    expect(entry.reviewed).toBe(true);
  });

  it("clears a commitment back to undecided rather than to zero", async () => {
    const nodeId = await makeNode(userId, "project");
    await upsertPlanEntry(userId, planId, nodeId, { committedMinutes: 120 });
    await upsertPlanEntry(userId, planId, nodeId, { committedMinutes: null });

    const [entry] = await listPlanEntries(userId, planId);
    expect(entry.committedMinutes).toBeNull();
  });

  it("marking a focus area sets the outline's focus flag too", async () => {
    const areaId = await makeNode(userId, "result_area");
    await setFocusArea(userId, planId, areaId, true);

    const [node] = await db.select().from(nodes).where(eq(nodes.id, areaId));
    expect(node.focus).toBe(true);

    const [entry] = await listPlanEntries(userId, planId);
    expect(entry.focus).toBe(true);
  });

  it("un-focusing clears the flag on both", async () => {
    const areaId = await makeNode(userId, "result_area");
    await setFocusArea(userId, planId, areaId, true);
    await setFocusArea(userId, planId, areaId, false);

    const [node] = await db.select().from(nodes).where(eq(nodes.id, areaId));
    expect(node.focus).toBe(false);
    const [entry] = await listPlanEntries(userId, planId);
    expect(entry.focus).toBe(false);
  });

  it("returns the most recent earlier rewrite for a goal, not the oldest", async () => {
    const goalId = await makeNode(userId, "goal");
    const older = await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 5) });
    const newer = await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 19) });
    await upsertPlanEntry(userId, older.id, goalId, { rewrite: "first attempt" });
    await upsertPlanEntry(userId, newer.id, goalId, { rewrite: "second attempt" });

    const previous = await loadPreviousRewrites(userId, sundayOfThatWeek());
    expect(previous.get(goalId)?.rewrite).toBe("second attempt");
  });

  it("does not offer this week's own rewrite as the previous one", async () => {
    const goalId = await makeNode(userId, "goal");
    await upsertPlanEntry(userId, planId, goalId, { rewrite: "this week" });

    const previous = await loadPreviousRewrites(userId, sundayOfThatWeek());
    expect(previous.has(goalId)).toBe(false);
  });

  it("skips an empty rewrite and keeps looking further back", async () => {
    const goalId = await makeNode(userId, "goal");
    const older = await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 5) });
    const newer = await ensureWeeklyPlan(userId, { weekStart: new Date(2026, 6, 19) });
    await upsertPlanEntry(userId, older.id, goalId, { rewrite: "real words" });
    await upsertPlanEntry(userId, newer.id, goalId, { reviewed: true });

    const previous = await loadPreviousRewrites(userId, sundayOfThatWeek());
    expect(previous.get(goalId)?.rewrite).toBe("real words");
  });
});

describeDb("cross-user isolation", () => {
  let owner: string;
  let intruder: string;
  let planId: string;
  let nodeId: string;

  beforeEach(async () => {
    owner = await makeUser();
    intruder = await makeUser();
    planId = (await ensureWeeklyPlan(owner, { weekStart: midWeek() })).id;
    nodeId = await makeNode(owner, "project");
    await upsertPlanEntry(owner, planId, nodeId, { committedMinutes: 120 });
  });

  it("does not let another user read the plan", async () => {
    expect(await getWeeklyPlanById(intruder, planId)).toBeNull();
    expect(await getWeeklyPlan(intruder, midWeek())).toBeNull();
    expect(await listWeeklyPlans(intruder)).toHaveLength(0);
  });

  it("does not let another user read the plan's entries", async () => {
    expect(await listPlanEntries(intruder, planId)).toHaveLength(0);
  });

  it("does not let another user change the plan", async () => {
    await expect(
      updateWeeklyPlan(intruder, planId, { availableMinutes: 1 }),
    ).rejects.toThrow(/not found/i);
    await expect(setWeeklyPlanCompleted(intruder, planId, true)).rejects.toThrow(
      /not found/i,
    );
  });

  it("does not let another user delete the plan", async () => {
    await expect(deleteWeeklyPlan(intruder, planId)).rejects.toThrow(/not found/i);
    expect(await getWeeklyPlanById(owner, planId)).not.toBeNull();
  });

  it("does not let another user write entries into the plan", async () => {
    const theirNode = await makeNode(intruder, "project");
    await expect(
      upsertPlanEntry(intruder, planId, theirNode, { committedMinutes: 999 }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not let a user point their own plan at someone else's node", async () => {
    // Without the node check this would succeed, and the intruder's step 4 would then
    // render the owner's project names inside their own week.
    const theirPlan = await ensureWeeklyPlan(intruder, { weekStart: midWeek() });
    await expect(
      upsertPlanEntry(intruder, theirPlan.id, nodeId, { committedMinutes: 60 }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not let another user flip a focus flag through the plan", async () => {
    await expect(setFocusArea(intruder, planId, nodeId, true)).rejects.toThrow(
      /not found/i,
    );
    const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(node.focus).toBe(false);
  });

  it("keeps another user's rewrites out of the previous-week lookup", async () => {
    const goalId = await makeNode(owner, "goal");
    const older = await ensureWeeklyPlan(owner, { weekStart: new Date(2026, 6, 5) });
    await upsertPlanEntry(owner, older.id, goalId, { rewrite: "private words" });

    const previous = await loadPreviousRewrites(intruder, sundayOfThatWeek());
    expect(previous.size).toBe(0);
  });
});
