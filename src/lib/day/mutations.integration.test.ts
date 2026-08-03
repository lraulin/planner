import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyItems, nodes, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { toDateKey } from "@/lib/schedule/geometry";
import { createNode, moveNode, setState } from "@/lib/tree/mutations";
import { saveNodeDetail } from "@/lib/detail/mutations";
import {
  createDailyItem,
  deleteDailyItem,
  forwardOpenItems,
  moveDailyItemToDay,
  planNodeForDay,
  promoteToTask,
  saveJournal,
  setDailyItemState,
  setDailyPriorities,
  updateDailyItemTitle,
} from "./mutations";
import { loadDay, loadWeek, plannedDayForNode, plannedNodeIds } from "./queries";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/notes/mutations.integration.test.ts`. Each test works under its own user.
 *
 * The cross-user block at the bottom is the point of this file as much as the happy paths:
 * every mutation here takes a `userId` and is expected to scope by it, and a dropped
 * `userId` in a `where` clause is both easy to write and invisible in single-user testing.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("day mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@localhost`, name: "Test User" })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

/** A task under a project, which is what the chooser and the day list both work with. */
async function makeTask(userId: string, name: string): Promise<string> {
  const projectId = await createNode({
    userId,
    parentId: null,
    type: "project",
    name: "Project",
  });
  return createNode({ userId, parentId: projectId, type: "task", name });
}

async function itemById(itemId: string) {
  const [row] = await db.select().from(dailyItems).where(eq(dailyItems.id, itemId));
  return row;
}

/**
 * Calendar day for wall-clock "today" (and offsets). Recurrence and the past-start clamp
 * in `syncDayLineToTargetStart` both read the real clock, so fixtures cannot be a frozen
 * week that eventually falls behind.
 */
function dayKey(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A three-day window **ahead of** real today. Planning a target start in the past would
 * put the open day line on real today (Behind Schedule); these stay on their own days.
 * Tests that need a simulated "today" pass WED as the `today` argument to `loadDay`.
 */
const MON = dayKey(1);
const TUE = dayKey(2);
const WED = dayKey(3);

const todayKey = () => dayKey(0);
const tomorrowKey = () => dayKey(1);

afterAll(async () => {
  for (const userId of createdUserIds) {
    await db.delete(users).where(eq(users.id, userId));
  }
});

describeDb("daily item basics", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("jots a line onto a day with no task, no project, and nothing to triage", async () => {
    const id = await createDailyItem({ userId, day: MON, title: "Check oil" });

    const day = await loadDay(userId, MON, WED);
    expect(day.items).toHaveLength(1);
    expect(day.items[0]).toMatchObject({
      id,
      title: "Check oil",
      nodeId: null,
      priorityLetter: null,
      completedAt: null,
    });

    // Nothing was created in the outline for it.
    const outlineRows = await db.select().from(nodes).where(eq(nodes.userId, userId));
    expect(outlineRows).toHaveLength(0);
  });

  it("keeps typed order for unprioritized lines", async () => {
    await createDailyItem({ userId, day: MON, title: "First" });
    await createDailyItem({ userId, day: MON, title: "Second" });
    await createDailyItem({ userId, day: MON, title: "Third" });

    const day = await loadDay(userId, MON, WED);
    expect(day.items.map((i) => i.title)).toEqual(["First", "Second", "Third"]);
  });

  it("orders by ABC priority ahead of typed order, unranked last", async () => {
    const a = await createDailyItem({ userId, day: MON, title: "Optional" });
    const b = await createDailyItem({ userId, day: MON, title: "Essential" });
    const c = await createDailyItem({ userId, day: MON, title: "Unranked" });

    await setDailyPriorities(userId, [
      { id: a, letter: "C", rank: 1 },
      { id: b, letter: "A", rank: 1 },
    ]);

    const day = await loadDay(userId, MON, WED);
    expect(day.items.map((i) => i.title)).toEqual([
      "Essential",
      "Optional",
      "Unranked",
    ]);
    expect(c).toBeDefined();
  });

  it("moves a checked or cancelled line below open work", async () => {
    // Settled lines (done or cancelled) drop to the bottom so the list still reads as
    // what you mean to do, with crossed-off work after. Cancel shares that placement;
    // only the mark (X vs check) distinguishes them.
    const first = await createDailyItem({ userId, day: MON, title: "First" });
    await createDailyItem({ userId, day: MON, title: "Second" });
    const third = await createDailyItem({ userId, day: MON, title: "Third" });

    await setDailyItemState(userId, first, "completed");
    await setDailyItemState(userId, third, "cancelled");

    const day = await loadDay(userId, MON, WED);
    expect(day.items.map((i) => i.title)).toEqual(["Second", "First", "Third"]);
    expect(day.items[1].completedAt).not.toBeNull();
    expect(day.items[2].state).toBe("cancelled");
  });

  it("renames a jotted line", async () => {
    const id = await createDailyItem({ userId, day: MON, title: "Chekc oil" });
    await updateDailyItemTitle(userId, id, "Check oil");

    const day = await loadDay(userId, MON, WED);
    expect(day.items[0].title).toBe("Check oil");
  });

  it("deletes a line without touching its linked task", async () => {
    const nodeId = await makeTask(userId, "Real work");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    await deleteDailyItem(userId, item.id);

    expect((await loadDay(userId, MON, WED)).items).toHaveLength(0);
    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task).toBeDefined();
  });
});

describeDb("pulling tasks onto a day", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("plans a task for a day and reports it back for the task form", async () => {
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, TUE);

    expect(await plannedDayForNode(userId, nodeId)).toBe(TUE);
    const day = await loadDay(userId, TUE, WED);
    expect(day.items[0]).toMatchObject({ nodeId, title: "Draft memo" });
  });

  it("shows the task's current name, so renaming a task updates the day", async () => {
    const nodeId = await makeTask(userId, "Old name");
    await planNodeForDay(userId, nodeId, MON);

    await db.update(nodes).set({ name: "New name" }).where(eq(nodes.id, nodeId));

    expect((await loadDay(userId, MON, WED)).items[0].title).toBe("New name");
  });

  it("keeps the snapshot title when the task is deleted out from under the row", async () => {
    const nodeId = await makeTask(userId, "Doomed task");
    await planNodeForDay(userId, nodeId, MON);

    await db.delete(nodes).where(eq(nodes.id, nodeId));

    const day = await loadDay(userId, MON, WED);
    expect(day.items[0]).toMatchObject({ nodeId: null, title: "Doomed task" });
  });

  it("moves rather than duplicates when a planned task is planned again", async () => {
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);
    await planNodeForDay(userId, nodeId, TUE);

    expect((await loadDay(userId, MON, WED)).items).toHaveLength(0);
    expect((await loadDay(userId, TUE, WED)).items).toHaveLength(1);
    expect(await plannedDayForNode(userId, nodeId)).toBe(TUE);
  });

  it("clears the day's ABC when a row moves to another day", async () => {
    // "Essential today" is a judgement about that day, and ranks are dense within a day.
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));
    await setDailyPriorities(userId, [{ id: item.id, letter: "A", rank: 1 }]);

    await moveDailyItemToDay(userId, item.id, TUE);

    expect((await itemById(item.id)).priorityLetter).toBeNull();
  });

  it("unplans without completing or deleting the task", async () => {
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);
    await planNodeForDay(userId, nodeId, null);

    expect(await plannedDayForNode(userId, nodeId)).toBeNull();
    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task.state).toBe("not_started");
  });

  it("reports planned nodes for the chooser's hide filter", async () => {
    const planned = await makeTask(userId, "Planned");
    const unplanned = await makeTask(userId, "Unplanned");
    await planNodeForDay(userId, planned, MON);

    const ids = await plannedNodeIds(userId);
    expect(ids.has(planned)).toBe(true);
    expect(ids.has(unplanned)).toBe(false);
  });

  it("drops a completed task out of the hide filter, freeing it to be planned again", async () => {
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    await setDailyItemState(userId, item.id, "completed");

    expect((await plannedNodeIds(userId)).has(nodeId)).toBe(false);
    expect(await plannedDayForNode(userId, nodeId)).toBeNull();
  });
});

describeDb("completing from the day page", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("completes the underlying task too", async () => {
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    await setDailyItemState(userId, item.id, "completed");

    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task.state).toBe("completed");
  });

  it("keeps the day's record when a recurring task resets itself", async () => {
    // The reason `completed_at` lives on the row: completing a recurring task shelves it
    // until next time (postponed + deferred date), and a derived checkmark would silently
    // un-check itself.
    const nodeId = await makeTask(userId, "Water the plants");
    await saveNodeDetail(userId, nodeId, {
      task: { recurrenceFrequency: "daily", recurrenceInterval: 3 },
    });
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    await setDailyItemState(userId, item.id, "completed");

    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task.state).toBe("postponed");

    const [details] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(details.deferredDate).not.toBeNull();

    const day = await loadDay(userId, MON, WED);
    expect(day.items[0].completedAt).not.toBeNull();
  });

  it("carries a checked-off recurring task onto the day it is next due", async () => {
    // Franklin Covey's paper day: the line stays crossed off where you crossed it off, and
    // an open one appears on the next due date. Without the second half a daily routine
    // disappears from the day page after the first time you do it.
    const nodeId = await makeTask(userId, "Brush teeth");
    await saveNodeDetail(userId, nodeId, {
      task: { recurrenceFrequency: "daily", recurrenceInterval: 1 },
    });
    const today = todayKey();
    await planNodeForDay(userId, nodeId, today);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));

    await setDailyItemState(userId, item.id, "completed");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.day === today)!.completedAt).not.toBeNull();
    expect(rows.find((r) => r.day === tomorrowKey())!.completedAt).toBeNull();
  });

  it("does the same when the recurring task is completed from the outline", async () => {
    // Completing a task means the same thing wherever you do it. Ticking it in the outline
    // checks off its day line and opens tomorrow's, exactly as the day page would.
    const nodeId = await makeTask(userId, "Brush teeth");
    await saveNodeDetail(userId, nodeId, {
      task: { recurrenceFrequency: "daily", recurrenceInterval: 1 },
    });
    await planNodeForDay(userId, nodeId, todayKey());

    await setState(userId, nodeId, "completed");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.day === todayKey())!.completedAt).not.toBeNull();
    expect(rows.find((r) => r.day === tomorrowKey())!.completedAt).toBeNull();
  });

  it("checks off the day line for a plain task completed in the outline", async () => {
    // No next occurrence to open, but the day page must not go on claiming it is unfinished.
    const nodeId = await makeTask(userId, "One-off");
    await planNodeForDay(userId, nodeId, todayKey());

    await setState(userId, nodeId, "completed");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(1);
    expect(rows[0].completedAt).not.toBeNull();
    expect(rows[0].state).toBe("completed");
  });

  it("un-checks the day line when the task is reopened the same day", async () => {
    // The mis-click case. Correcting today is fair; rewriting an older day is not.
    const nodeId = await makeTask(userId, "One-off");
    await planNodeForDay(userId, nodeId, todayKey());
    await setState(userId, nodeId, "completed");

    await setState(userId, nodeId, "in_progress");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(1);
    expect(rows[0].completedAt).toBeNull();
  });

  it("leaves a cycled routine's completed line alone when the task is reopened", async () => {
    // It really was done that day, and the next occurrence's line is already open — which
    // is also what stops this from colliding with the one-open-day-per-task index.
    const nodeId = await makeTask(userId, "Brush teeth");
    await saveNodeDetail(userId, nodeId, {
      task: { recurrenceFrequency: "daily", recurrenceInterval: 1 },
    });
    await planNodeForDay(userId, nodeId, todayKey());
    await setState(userId, nodeId, "completed");

    await setState(userId, nodeId, "in_progress");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows.find((r) => r.day === todayKey())!.completedAt).not.toBeNull();
    expect(rows.find((r) => r.day === tomorrowKey())!.completedAt).toBeNull();
  });

  it("records an unplanned task as crossed off on the day it was completed", async () => {
    // The day page is a paper day you can turn back to. A record with holes in it is not a
    // record, so a task completed anywhere lands there struck through even if it was never
    // planned.
    const nodeId = await makeTask(userId, "Never planned");

    await setState(userId, nodeId, "completed");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe(todayKey());
    expect(rows[0].completedAt).not.toBeNull();
  });

  it("puts a routine on its next day from the target start date, not from a planted row", async () => {
    // Nothing plants the next line any more. Completing a repeating task writes a fresh
    // target start date, and the day line follows that column like every other task's —
    // one mechanism deciding which day something sits on rather than two.
    const nodeId = await makeTask(userId, "Never planned");
    await saveNodeDetail(userId, nodeId, {
      task: { recurrenceFrequency: "daily", recurrenceInterval: 1 },
    });

    await setState(userId, nodeId, "completed");

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.day === todayKey())!.completedAt).not.toBeNull();
    expect(rows.find((r) => r.day === tomorrowKey())!.completedAt).toBeNull();
    expect(await plannedDayForNode(userId, nodeId)).toBe(tomorrowKey());
  });

  it("sets both ends of the range when a task is planned for a day", async () => {
    // A line on a day page is work you mean to start *and finish* that day. Work that
    // genuinely spans days is a project, or a task with subtasks.
    const nodeId = await makeTask(userId, "One day's work");

    await planNodeForDay(userId, nodeId, WED);

    const [detail] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(toDateKey(detail.targetStartDate!)).toBe(WED);
    expect(toDateKey(detail.targetEndDate!)).toBe(WED);
  });

  it("refuses to put a project on a day list", async () => {
    const projectId = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Too big for a day",
    });

    await expect(planNodeForDay(userId, projectId, MON)).rejects.toThrow("Only tasks");
    expect((await loadDay(userId, MON, WED)).items).toHaveLength(0);
  });

  it("leaves target end alone when the date is edited on the record", async () => {
    // Typing a start date into the form is a finer act than dropping a card on a day.
    // Overwriting a target end that was set on purpose would be presumptuous.
    const nodeId = await makeTask(userId, "Spans a few days");
    await saveNodeDetail(userId, nodeId, {
      targetStartDate: new Date(`${MON}T00:00:00`),
      targetEndDate: new Date(`${WED}T00:00:00`),
    });

    const [detail] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(toDateKey(detail.targetEndDate!)).toBe(WED);
    expect(await plannedDayForNode(userId, nodeId)).toBe(MON);
  });

  it("puts a task on a day when its target start date is set", async () => {
    // The point of the whole seam: target start date *is* the plan. Setting it from the
    // record puts the task on that day's list without anything else being asked of you.
    const nodeId = await makeTask(userId, "Starts Wednesday");

    await saveNodeDetail(userId, nodeId, {
      targetStartDate: new Date(`${WED}T00:00:00`),
    });

    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe(WED);
    expect(await plannedDayForNode(userId, nodeId)).toBe(WED);
  });

  it("moves the day line when the target start date changes, and removes it when cleared", async () => {
    const nodeId = await makeTask(userId, "Moves around");
    await saveNodeDetail(userId, nodeId, {
      targetStartDate: new Date(`${MON}T00:00:00`),
    });

    await saveNodeDetail(userId, nodeId, {
      targetStartDate: new Date(`${WED}T00:00:00`),
    });
    expect(await plannedDayForNode(userId, nodeId)).toBe(WED);

    await saveNodeDetail(userId, nodeId, { targetStartDate: null });
    expect(await plannedDayForNode(userId, nodeId)).toBeNull();
  });

  it("takes the target start date with it when a line is dragged to another day", async () => {
    // Otherwise the drawer would go on claiming Monday while the line sits on Wednesday.
    const nodeId = await makeTask(userId, "Dragged");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));

    await moveDailyItemToDay(userId, item.id, WED);

    const [detail] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(toDateKey(detail.targetStartDate!)).toBe(WED);
  });

  it("keeps that record out of the Plan for day field", async () => {
    // `plannedDayForNode` reads open lines only, so an auto-recorded completed line does
    // not make the drawer claim the task is planned for today.
    const nodeId = await makeTask(userId, "Never planned");
    await setState(userId, nodeId, "completed");

    expect(await plannedDayForNode(userId, nodeId)).toBeNull();
  });

  it("carries a state like delegated through to the task", async () => {
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    await setDailyItemState(userId, item.id, "delegated");

    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task.state).toBe("delegated");
    expect((await itemById(item.id)).completedAt).toBeNull();
  });

  it("cancels the task and settles the day line with completedAt (not a delete)", async () => {
    // Cancel is "not doing this" — the line stays on the day crossed off. Deleting the
    // task or removing the day line are separate menu actions.
    const nodeId = await makeTask(userId, "Skip this");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    await setDailyItemState(userId, item.id, "cancelled");

    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task.state).toBe("cancelled");
    const dayRow = await itemById(item.id);
    expect(dayRow.state).toBe("cancelled");
    expect(dayRow.completedAt).not.toBeNull();
  });

  it("settles a jotted cancel the same way, without inventing a task", async () => {
    const id = await createDailyItem({ userId, day: MON, title: "Maybe later" });
    await setDailyItemState(userId, id, "cancelled");

    const dayRow = await itemById(id);
    expect(dayRow.state).toBe("cancelled");
    expect(dayRow.completedAt).not.toBeNull();
    expect(dayRow.nodeId).toBeNull();
  });
});

describeDb("carry-over", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("carries unfinished lines onto today and marks the old day forwarded", async () => {
    const stale = await createDailyItem({ userId, day: MON, title: "Check oil" });

    const today = await loadDay(userId, WED, WED);

    expect(today.items.map((i) => i.title)).toEqual(["Check oil"]);
    const past = await loadDay(userId, MON, WED);
    expect(past.items[0].forwardedTo).toBe(WED);
    expect(past.items[0].id).toBe(stale);
  });

  it("is idempotent across repeated loads", async () => {
    await createDailyItem({ userId, day: MON, title: "Check oil" });

    await loadDay(userId, WED, WED);
    await loadDay(userId, WED, WED);
    const today = await loadDay(userId, WED, WED);

    expect(today.items).toHaveLength(1);
  });

  it("does not carry completed or cancelled lines", async () => {
    const done = await createDailyItem({ userId, day: MON, title: "Done" });
    const killed = await createDailyItem({ userId, day: MON, title: "Deleted" });
    await createDailyItem({ userId, day: MON, title: "Open" });
    await setDailyItemState(userId, done, "completed");
    await setDailyItemState(userId, killed, "cancelled");

    const today = await loadDay(userId, WED, WED);
    expect(today.items.map((i) => i.title)).toEqual(["Open"]);
  });

  it("leaves future days alone — planning ahead survives opening the app", async () => {
    await createDailyItem({ userId, day: WED, title: "Friday thing" });

    await loadDay(userId, TUE, TUE);

    expect((await loadDay(userId, WED, TUE)).items).toHaveLength(1);
  });

  it("does not forward when the day being viewed is not today", async () => {
    await createDailyItem({ userId, day: MON, title: "Check oil" });

    const viewed = await loadDay(userId, TUE, WED);

    expect(viewed.items).toHaveLength(0);
    expect((await loadDay(userId, MON, WED)).items[0].forwardedTo).toBeNull();
  });

  it("keeps a task's single open row when it forwards", async () => {
    // The partial unique index only admits open, unforwarded rows, so the old row has to be
    // marked before the new one is inserted.
    const nodeId = await makeTask(userId, "Draft memo");
    await planNodeForDay(userId, nodeId, MON);

    await loadDay(userId, WED, WED);

    expect(await plannedDayForNode(userId, nodeId)).toBe(WED);
    const rows = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(rows).toHaveLength(2);
  });

  it("does not rewrite target start when a line is carried forward", async () => {
    // Behind Schedule needs the original plan date. The day line still moves to today.
    const nodeId = await makeTask(userId, "Still meant for Monday");
    await planNodeForDay(userId, nodeId, MON);

    await loadDay(userId, WED, WED);

    const [detail] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(toDateKey(detail.targetStartDate!)).toBe(MON);
    expect(await plannedDayForNode(userId, nodeId)).toBe(WED);
  });

  it("collapses several stale days onto today at once", async () => {
    await createDailyItem({ userId, day: MON, title: "From Monday" });
    await createDailyItem({ userId, day: TUE, title: "From Tuesday" });

    const today = await loadDay(userId, WED, WED);

    expect(today.items.map((i) => i.title)).toEqual(["From Monday", "From Tuesday"]);
  });

  it("returns how many rows it moved", async () => {
    await createDailyItem({ userId, day: MON, title: "One" });
    await createDailyItem({ userId, day: MON, title: "Two" });

    expect(await forwardOpenItems(userId, WED)).toBe(2);
    expect(await forwardOpenItems(userId, WED)).toBe(0);
  });
});

describeDb("promoting a jotted line", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates a task in the Inbox and links the row to it", async () => {
    const id = await createDailyItem({ userId, day: MON, title: "Call the vet" });

    const nodeId = await promoteToTask(userId, id);

    const [task] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(task).toMatchObject({ type: "task", name: "Call the vet" });

    const [inbox] = await db
      .select()
      .from(nodes)
      .where(and(eq(nodes.userId, userId), eq(nodes.isInbox, true)));
    expect(task.parentId).toBe(inbox.id);
    expect((await itemById(id)).nodeId).toBe(nodeId);
  });

  it("is a no-op for a row that already has a task", async () => {
    const nodeId = await makeTask(userId, "Already real");
    await planNodeForDay(userId, nodeId, MON);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(eq(dailyItems.userId, userId));

    expect(await promoteToTask(userId, item.id)).toBe(nodeId);
  });
});

describeDb("week view and journal", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("buckets a week's rows by day and always returns seven columns", async () => {
    await createDailyItem({ userId, day: MON, title: "Monday thing" });
    await createDailyItem({ userId, day: WED, title: "Wednesday thing" });

    const weekEnd = dayKey(7);
    const week = await loadWeek(userId, MON, weekEnd);

    expect(week.days).toHaveLength(7);
    expect(week.itemsByDay[MON].map((i) => i.title)).toEqual(["Monday thing"]);
    expect(week.itemsByDay[TUE]).toEqual([]);
    expect(week.itemsByDay[WED].map((i) => i.title)).toEqual(["Wednesday thing"]);
  });

  it("creates the journal note on first save and updates it after", async () => {
    const id = await saveJournal(userId, MON, "Rough start.");
    const again = await saveJournal(userId, MON, "Rough start. Better by lunch.");

    expect(again).toBe(id);
    const day = await loadDay(userId, MON, WED);
    expect(day.journal).toMatchObject({ id, body: "Rough start. Better by lunch." });
  });

  it("keeps journal entries separate per day", async () => {
    await saveJournal(userId, MON, "Monday");
    await saveJournal(userId, TUE, "Tuesday");

    expect((await loadDay(userId, MON, WED)).journal?.body).toBe("Monday");
    expect((await loadDay(userId, TUE, WED)).journal?.body).toBe("Tuesday");
  });
});

/**
 * Shelving and day lines. The deferred-date model makes postponement and deferral one
 * concept; these pin the day-page consequences that are easy to get subtly wrong.
 */
describeDb("shelving and day lines", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("keeps a later plan while deferred earlier — the shelf does not swallow it", async () => {
    // The case that forbids "postponed ⇒ no day line". Expiry is derived, so nothing writes
    // on the morning the shelf ends; the later plan's line has to exist the whole time.
    // Local midnights, matching how `setDayPlan` writes dates. Both dates must be in the
    // future — a deferred date already past shelves nothing.
    const nodeId = await makeTask(userId, "Pay the estimated tax");
    await saveNodeDetail(userId, nodeId, {
      deferredDate: new Date("2026-10-15T00:00:00"),
      targetStartDate: new Date("2026-11-15T00:00:00"),
    });

    expect(await plannedDayForNode(userId, nodeId)).toBe("2026-11-15");
    const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(row.state).toBe("postponed");
  });

  it("suppresses every open day line under an indefinite shelf", async () => {
    const nodeId = await makeTask(userId, "Someday maybe");
    await planNodeForDay(userId, nodeId, MON);
    expect(await plannedDayForNode(userId, nodeId)).toBe(MON);

    await setState(userId, nodeId, "postponed");

    expect(await plannedDayForNode(userId, nodeId)).toBeNull();
    // The plan itself stays: un-shelving should be able to put the line back.
    const [row] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
    expect(row.targetStartDate).not.toBeNull();
  });

  it("clears descendant plans that fall inside a dated shelf, leaves later ones alone", async () => {
    const projectId = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Pay Taxes",
    });
    const early = await createNode({
      userId,
      parentId: projectId,
      type: "task",
      name: "Gather receipts",
    });
    const late = await createNode({
      userId,
      parentId: projectId,
      type: "task",
      name: "File in September",
    });
    // MON is 2026-07-27; shelf through mid-August clears it, leaves September alone.
    await planNodeForDay(userId, early, MON);
    await planNodeForDay(userId, late, "2026-09-15");

    await saveNodeDetail(userId, projectId, {
      name: "Pay Taxes",
      deferredDate: new Date("2026-08-15T00:00:00"),
    });

    expect(await plannedDayForNode(userId, early)).toBeNull();
    const [earlyRow] = await db.select().from(nodes).where(eq(nodes.id, early));
    expect(earlyRow.targetStartDate).toBeNull();

    expect(await plannedDayForNode(userId, late)).toBe("2026-09-15");
    const [lateRow] = await db.select().from(nodes).where(eq(nodes.id, late));
    expect(toDateKey(lateRow.targetStartDate!)).toBe("2026-09-15");
  });

  it("hides a task's day line when it is re-parented under a shelved project", async () => {
    const shelved = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Someday",
    });
    await setState(userId, shelved, "postponed");

    const open = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Active",
    });
    const task = await createNode({
      userId,
      parentId: open,
      type: "task",
      name: "Do the thing",
    });
    await planNodeForDay(userId, task, MON);
    expect(await plannedDayForNode(userId, task)).toBe(MON);

    await moveNode({
      userId,
      nodeId: task,
      parentId: shelved,
      position: { at: "last" },
    });

    expect(await plannedDayForNode(userId, task)).toBeNull();
  });

  it("does not forward a line whose task is still under a shelf", async () => {
    // Indefinite shelf with a stale open line left behind (the shape re-parenting or a
    // missed sync can leave). The unattended forward must not re-plan it for today.
    const nodeId = await makeTask(userId, "Wait until next month");
    await setState(userId, nodeId, "postponed");
    await db.insert(dailyItems).values({
      userId,
      nodeId,
      day: MON,
      title: "Wait until next month",
      sortKey: "a0",
    });

    expect(await forwardOpenItems(userId, WED)).toBe(0);
    const [item] = await db
      .select()
      .from(dailyItems)
      .where(and(eq(dailyItems.userId, userId), eq(dailyItems.nodeId, nodeId)));
    expect(item.forwardedTo).toBeNull();
    expect(item.day).toBe(MON);
  });

  it("scopes shelving cleanup by user", async () => {
    const intruder = await makeUser();
    const projectId = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Mine",
    });
    const task = await createNode({
      userId,
      parentId: projectId,
      type: "task",
      name: "Child",
    });
    await planNodeForDay(userId, task, MON);

    await expect(
      saveNodeDetail(intruder, projectId, {
        name: "Stolen",
        deferredDate: new Date("2027-01-01T00:00:00Z"),
      }),
    ).rejects.toThrow();

    expect(await plannedDayForNode(userId, task)).toBe(MON);
  });
});

/**
 * A second user tries to read, change and delete the first user's row, and must fail at
 * every step. Every mutation takes a `userId`; a dropped one in a `where` clause is easy to
 * write and invisible in single-user testing, which is exactly what this block catches.
 */
describeDb("cross-user isolation", () => {
  let owner: string;
  let intruder: string;
  let itemId: string;
  let nodeId: string;

  beforeEach(async () => {
    owner = await makeUser();
    intruder = await makeUser();
    nodeId = await makeTask(owner, "Owner's task");
    itemId = await createDailyItem({ userId: owner, day: MON, title: "Owner's line" });
    await setDailyPriorities(owner, [{ id: itemId, letter: "A", rank: 1 }]);
  });

  it("cannot read another user's day", async () => {
    const day = await loadDay(intruder, MON, WED);
    expect(day.items).toEqual([]);
  });

  it("cannot read another user's week", async () => {
    const week = await loadWeek(intruder, MON, "2026-08-02");
    expect(Object.values(week.itemsByDay).flat()).toEqual([]);
  });

  it("cannot see another user's planned task through the chooser filter", async () => {
    await planNodeForDay(owner, nodeId, TUE);

    expect(await plannedDayForNode(intruder, nodeId)).toBeNull();
    expect((await plannedNodeIds(intruder)).size).toBe(0);
  });

  it("cannot rename another user's line", async () => {
    await updateDailyItemTitle(intruder, itemId, "Hijacked");
    expect((await itemById(itemId)).title).toBe("Owner's line");
  });

  it("cannot complete another user's line", async () => {
    await expect(setDailyItemState(intruder, itemId, "completed")).rejects.toThrow(
      /not found/i,
    );
    expect((await itemById(itemId)).completedAt).toBeNull();
  });

  it("cannot reprioritize another user's line", async () => {
    await setDailyPriorities(intruder, [{ id: itemId, letter: "C", rank: 9 }]);
    expect((await itemById(itemId)).priorityLetter).toBe("A");
  });

  it("cannot move another user's line to a different day", async () => {
    await expect(moveDailyItemToDay(intruder, itemId, TUE)).rejects.toThrow(
      /not found/i,
    );
    expect((await itemById(itemId)).day).toBe(MON);
  });

  it("cannot delete another user's line", async () => {
    await deleteDailyItem(intruder, itemId);
    expect(await itemById(itemId)).toBeDefined();
  });

  it("cannot promote another user's line", async () => {
    await expect(promoteToTask(intruder, itemId)).rejects.toThrow(/not found/i);
    expect((await itemById(itemId)).nodeId).toBeNull();
  });

  it("cannot plan another user's task onto its own day", async () => {
    await expect(planNodeForDay(intruder, nodeId, TUE)).rejects.toThrow(/not found/i);
    expect(await plannedDayForNode(owner, nodeId)).toBeNull();
  });

  it("does not forward another user's stale rows", async () => {
    expect(await forwardOpenItems(intruder, WED)).toBe(0);
    expect((await itemById(itemId)).forwardedTo).toBeNull();
  });

  it("cannot read or overwrite another user's journal", async () => {
    await saveJournal(owner, MON, "Private thoughts.");

    expect((await loadDay(intruder, MON, WED)).journal).toBeNull();

    // The intruder writing their own MON entry must create a separate note, not touch this one.
    await saveJournal(intruder, MON, "Someone else's day.");
    expect((await loadDay(owner, MON, WED)).journal?.body).toBe("Private thoughts.");
  });
});
