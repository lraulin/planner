import { beforeEach, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, nodes, reminderOccurrences, taskDetails } from "@/db/schema";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";
import { fromDateKey } from "@/lib/schedule/geometry";
import { READER_TIME_ZONE } from "@/lib/schedule/readerZone";
import { zonedMinuteOfDay } from "@/lib/schedule/zonedTime";
import { saveNodeDetail } from "@/lib/detail/mutations";
import { createNode, deleteNode, setDeadline } from "@/lib/tree/mutations";
import { armHorizon, fireDue, fireOccurrence, syncReminderSources } from "./arm";
import {
  completeReminder,
  dismissAllReminders,
  dismissReminder,
  removePushSubscription,
  savePushSubscription,
  snoozeReminder,
} from "./mutations";
import { listFiredReminders, listPushDevices } from "./queries";

/**
 * The occurrence lifecycle against real Postgres: arming is idempotent, an edited source
 * supersedes what was armed, a stale callback does nothing, and the panel's actions do what
 * they say — for the owner only.
 *
 * QStash and VAPID are unset here, so publishing and pushing log and return; what is tested
 * is the row state each step leaves, which is what the firing route and the panel read.
 */

const describeDb = await describeWithDatabase("reminders");

const makeUser = testUsers("test");

const MINUTE = 60_000;

async function taskWithReminder(userId: string, reminderAt: Date | null) {
  const id = await createNode({
    userId,
    parentId: null,
    type: "task",
    name: "Call the bank",
  });
  await db
    .insert(taskDetails)
    .values({ nodeId: id, reminderAt })
    .onConflictDoUpdate({ target: taskDetails.nodeId, set: { reminderAt } });
  return id;
}

async function occurrencesOf(userId: string, sourceId: string) {
  return db
    .select()
    .from(reminderOccurrences)
    .where(
      and(
        eq(reminderOccurrences.userId, userId),
        eq(reminderOccurrences.sourceId, sourceId),
      ),
    );
}

async function reminderAtOf(nodeId: string) {
  const [row] = await db
    .select({ reminderAt: taskDetails.reminderAt })
    .from(taskDetails)
    .where(eq(taskDetails.nodeId, nodeId));
  return row?.reminderAt ?? null;
}

describeDb("arming", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  it("arms a reminder once however often it is synced", async () => {
    const at = new Date(Date.now() + 30 * MINUTE);
    const task = await taskWithReminder(userId, at);

    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    await armHorizon(userId);

    const rows = await occurrencesOf(userId, task);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("scheduled");
    expect(rows[0].fireAt.getTime()).toBe(at.getTime());
  });

  it("supersedes the armed row when the reminder moves, and arms the new time", async () => {
    const first = new Date(Date.now() + 30 * MINUTE);
    const task = await taskWithReminder(userId, first);
    await syncReminderSources(userId, [{ kind: "node", id: task }]);

    const moved = new Date(first.getTime() + 60 * MINUTE);
    await saveNodeDetail(userId, task, { task: { reminderAt: moved } });

    const rows = await occurrencesOf(userId, task);
    const byState = Object.fromEntries(rows.map((r) => [r.state, r.fireAt.getTime()]));
    expect(byState).toEqual({
      superseded: first.getTime(),
      scheduled: moved.getTime(),
    });
  });

  it("revives the original row when a moved reminder is moved back", async () => {
    const first = new Date(Date.now() + 30 * MINUTE);
    const task = await taskWithReminder(userId, first);
    await saveNodeDetail(userId, task, { task: { reminderAt: first } });
    await saveNodeDetail(userId, task, {
      task: { reminderAt: new Date(first.getTime() + MINUTE) },
    });
    await saveNodeDetail(userId, task, { task: { reminderAt: first } });

    const scheduled = (await occurrencesOf(userId, task)).filter(
      (r) => r.state === "scheduled",
    );
    expect(scheduled.map((r) => r.fireAt.getTime())).toEqual([first.getTime()]);
  });

  it("closes a deleted task's reminders", async () => {
    const task = await taskWithReminder(userId, new Date(Date.now() + 30 * MINUTE));
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    await deleteNode(userId, task);
    expect((await occurrencesOf(userId, task)).map((r) => r.state)).toEqual([
      "superseded",
    ]);
  });

  it("arms a project block at its start and leaves a plain event alone", async () => {
    const project = await createNode({
      userId,
      parentId: null,
      type: "project",
      name: "Book",
    });
    const start = new Date(Date.now() + 2 * 60 * MINUTE);
    const [block, plain] = await db
      .insert(appointments)
      .values([
        {
          userId,
          subject: "Write",
          startAt: start,
          endAt: new Date(start.getTime() + 60 * MINUTE),
          projectId: project,
        },
        {
          userId,
          subject: "Lunch",
          startAt: start,
          endAt: new Date(start.getTime() + 60 * MINUTE),
        },
      ])
      .returning({ id: appointments.id });

    await armHorizon(userId);

    expect(
      (await occurrencesOf(userId, block.id)).map((r) => r.fireAt.getTime()),
    ).toEqual([start.getTime()]);
    expect(await occurrencesOf(userId, plain.id)).toEqual([]);
  });
});

describeDb("firing", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  it("fires a due row into the panel, once", async () => {
    const task = await taskWithReminder(userId, new Date(Date.now() - MINUTE));
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    const [row] = await occurrencesOf(userId, task);

    expect(await fireOccurrence(row.id, row.fireAt)).toBe("fired");
    expect(await fireOccurrence(row.id, row.fireAt)).toBe("stale");
    expect((await listFiredReminders(userId)).map((r) => r.sourceId)).toEqual([task]);
  });

  it("does nothing for a message published before the reminder moved", async () => {
    const first = new Date(Date.now() + 30 * MINUTE);
    const task = await taskWithReminder(userId, first);
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    const [armed] = await occurrencesOf(userId, task);

    await saveNodeDetail(userId, task, {
      task: { reminderAt: new Date(first.getTime() + 60 * MINUTE) },
    });

    expect(await fireOccurrence(armed.id, armed.fireAt)).toBe("stale");
    expect(await listFiredReminders(userId)).toEqual([]);
  });

  it("supersedes instead of firing when the task was completed before its time", async () => {
    const task = await taskWithReminder(userId, new Date(Date.now() + 30 * MINUTE));
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    // A write that skips the re-arm hook, the way a hand-run SQL edit would.
    await db.update(nodes).set({ state: "completed" }).where(eq(nodes.id, task));
    const [armed] = await occurrencesOf(userId, task);

    expect(await fireOccurrence(armed.id, armed.fireAt)).toBe("superseded");
  });

  it("catches up on rows whose callback never arrived", async () => {
    const task = await taskWithReminder(userId, new Date(Date.now() - 2 * MINUTE));
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    const counts = await fireDue();
    expect(counts.fired).toBeGreaterThanOrEqual(1);
    expect((await occurrencesOf(userId, task))[0].state).toBe("fired");
  });
});

describeDb("acting from the panel", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  async function firedFor(task: string) {
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    const [row] = await occurrencesOf(userId, task);
    await fireOccurrence(row.id, row.fireAt);
    return row.id;
  }

  it("snooze re-arms the same row, which fires again at the new time", async () => {
    const task = await taskWithReminder(userId, new Date(Date.now() - MINUTE));
    const id = await firedFor(task);

    const fireAt = await snoozeReminder(userId, id, "15m");
    expect(await listFiredReminders(userId)).toEqual([]);
    // A later sync of the unchanged source must not undo the snooze.
    await syncReminderSources(userId, [{ kind: "node", id: task }]);
    const [row] = await occurrencesOf(userId, task);
    expect(row.state).toBe("scheduled");
    expect(row.fireAt.getTime()).toBe(fireAt.getTime());

    expect(await fireOccurrence(id, fireAt)).toBe("fired");
  });

  it("dismiss and dismiss all clear the panel, and a dismissed reminder stays dismissed", async () => {
    const a = await firedFor(
      await taskWithReminder(userId, new Date(Date.now() - MINUTE)),
    );
    const taskB = await taskWithReminder(userId, new Date(Date.now() - 2 * MINUTE));
    await firedFor(taskB);

    await dismissReminder(userId, a);
    expect(await listFiredReminders(userId)).toHaveLength(1);
    expect(await dismissAllReminders(userId)).toBe(1);
    expect(await listFiredReminders(userId)).toEqual([]);

    await armHorizon(userId);
    expect((await occurrencesOf(userId, taskB)).map((r) => r.state)).toEqual([
      "dismissed",
    ]);
  });

  it("complete settles the task", async () => {
    const task = await taskWithReminder(userId, new Date(Date.now() - MINUTE));
    const id = await firedFor(task);
    await completeReminder(userId, id);
    const [node] = await db
      .select({ state: nodes.state })
      .from(nodes)
      .where(eq(nodes.id, task));
    expect(node.state).toBe("completed");
    expect(await listFiredReminders(userId)).toEqual([]);
  });

  it("complete cycles a repeating task and arms its next reminder at the same time of day", async () => {
    const reminderAt = new Date(Date.now() - MINUTE);
    const task = await taskWithReminder(userId, reminderAt);
    await db
      .update(taskDetails)
      .set({ recurrenceFrequency: "daily" })
      .where(eq(taskDetails.nodeId, task));
    // An anchor for the step: today's target start.
    await db
      .update(nodes)
      .set({ targetStartDate: fromDateKey(new Date().toLocaleDateString("en-CA")) })
      .where(eq(nodes.id, task));

    const id = await firedFor(task);
    await completeReminder(userId, id);

    const next = await reminderAtOf(task);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(reminderAt.getTime());
    expect(zonedMinuteOfDay(next!, READER_TIME_ZONE)).toBe(
      zonedMinuteOfDay(reminderAt, READER_TIME_ZONE),
    );
    const rows = await occurrencesOf(userId, task);
    expect(
      rows.filter((r) => r.state === "scheduled").map((r) => r.fireAt.getTime()),
    ).toEqual([next!.getTime()]);
    expect(rows.find((r) => r.id === id)?.state).toBe("completed");
  });
});

describeDb("deadline auto-reminder", () => {
  let userId: string;
  beforeEach(async () => {
    userId = await makeUser();
  });

  it("sets one from a new deadline and leaves a hand-set reminder alone", async () => {
    const auto = await taskWithReminder(userId, null);
    await setDeadline(userId, auto, fromDateKey("2026-11-05"));
    expect((await reminderAtOf(auto))?.toISOString()).toBe("2026-11-04T14:00:00.000Z");

    const handSet = new Date("2026-11-03T19:00:00.000Z");
    const manual = await taskWithReminder(userId, handSet);
    await setDeadline(userId, manual, fromDateKey("2026-11-05"));
    await saveNodeDetail(userId, manual, { deadline: fromDateKey("2026-11-09") });
    expect((await reminderAtOf(manual))?.getTime()).toBe(handSet.getTime());
  });

  it("does not overwrite a reminder edited in the same save that moves the deadline", async () => {
    const task = await taskWithReminder(userId, null);
    await setDeadline(userId, task, fromDateKey("2026-11-05"));
    const typed = new Date("2026-11-08T20:00:00.000Z");
    await saveNodeDetail(userId, task, {
      deadline: fromDateKey("2026-11-10"),
      task: { reminderAt: typed },
    });
    expect((await reminderAtOf(task))?.getTime()).toBe(typed.getTime());
  });
});

describeDb("another user", () => {
  let owner: string;
  let other: string;
  beforeEach(async () => {
    owner = await makeUser();
    other = await makeUser();
  });

  it("cannot list, snooze, dismiss or complete the owner's reminders", async () => {
    const task = await taskWithReminder(owner, new Date(Date.now() - MINUTE));
    await syncReminderSources(owner, [{ kind: "node", id: task }]);
    const [row] = await occurrencesOf(owner, task);
    await fireOccurrence(row.id, row.fireAt);

    expect(await listFiredReminders(other)).toEqual([]);
    await expect(snoozeReminder(other, row.id, "5m")).rejects.toThrow("not found");
    await expect(dismissReminder(other, row.id)).rejects.toThrow("not found");
    await expect(completeReminder(other, row.id)).rejects.toThrow("not found");
    expect(await dismissAllReminders(other)).toBe(0);

    const [after] = await occurrencesOf(owner, task);
    expect(after.state).toBe("fired");
    const [node] = await db
      .select({ state: nodes.state })
      .from(nodes)
      .where(eq(nodes.id, task));
    expect(node.state).not.toBe("completed");
  });

  it("cannot arm the owner's task by naming it", async () => {
    const task = await taskWithReminder(owner, new Date(Date.now() + 30 * MINUTE));
    await syncReminderSources(other, [{ kind: "node", id: task }]);
    expect(await occurrencesOf(other, task)).toEqual([]);
  });

  it("cannot see or remove the owner's devices", async () => {
    const device = await savePushSubscription(owner, {
      endpoint: `https://push.example.test/${crypto.randomUUID()}`,
      p256dh: "key",
      auth: "secret",
      label: "iPhone",
    });

    expect(await listPushDevices(other)).toEqual([]);
    await expect(removePushSubscription(other, device)).rejects.toThrow("not found");
    expect((await listPushDevices(owner)).map((d) => d.id)).toEqual([device]);
  });
});
