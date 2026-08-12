import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import {
  createAppointment,
  createTimeChart,
  createTimeChartArea,
  deleteAppointment,
  deleteTimeChart,
  deleteTimeChartArea,
  renameTimeChart,
  rescheduleAppointment,
  setAppointmentCheckState,
  updateAppointment,
  updateTimeChartArea,
} from "./mutations";
import {
  getAppointment,
  getTimeChart,
  listTimeChartAreas,
  listTimeCharts,
  loadSchedule,
} from "./queries";
import { fromDateKey } from "./geometry";
import { scheduleRange, weekRange } from "./range";

/**
 * Integration tests against the local Postgres (`npm run db:up`), following the harness in
 * `src/lib/tree/mutations.integration.test.ts`. Each test works under its own user, so
 * these never touch seeded development data.
 *
 * The cross-user cases are the point of this file as much as the happy paths: every
 * mutation here takes a `userId` and is expected to scope by it, and a dropped `userId`
 * in a `where` clause is both easy to write and invisible in single-user testing.
 */

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("schedule mutations");

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

/**
 * `createAppointment` returns null only when a recurring create is waiting on a mirror
 * pass, which cannot happen here — no Google account is linked in tests, so the write-
 * through path is inert. Narrowing once keeps the assertions below free of `!` noise.
 */
async function makeAppointment(
  userId: string,
  input: Parameters<typeof createAppointment>[1],
) {
  const row = await createAppointment(userId, input);
  if (!row)
    throw new Error("createAppointment returned null with no Google account linked");
  return row;
}

/** A 1-hour appointment on the given day at 09:00 local. */
function hourAt(key: string) {
  const startAt = fromDateKey(key);
  startAt.setHours(9, 0, 0, 0);
  return { startAt, endAt: new Date(startAt.getTime() + 60 * 60_000) };
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describeDb("time charts", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates a chart with the given name", async () => {
    const chart = await createTimeChart(userId, "  Weekdays  ");
    expect(chart.name).toBe("Weekdays");
  });

  it("names an unnamed chart rather than storing an empty string", async () => {
    const chart = await createTimeChart(userId, "   ");
    expect(chart.name).toBe("New Time Chart");
  });

  it("renames a chart", async () => {
    const chart = await createTimeChart(userId, "Old");
    const renamed = await renameTimeChart(userId, chart.id, "New");
    expect(renamed.name).toBe("New");
  });

  it("deletes a chart", async () => {
    const chart = await createTimeChart(userId, "Doomed");
    await deleteTimeChart(userId, chart.id);
    expect(await getTimeChart(userId, chart.id)).toBeNull();
  });

  it("cascades area deletion when its chart goes", async () => {
    const chart = await createTimeChart(userId, "Chart");
    await createTimeChartArea(userId, chart.id, {
      name: "Sleep",
      daysOfWeek: [0],
      startMinute: 0,
      durationMinutes: 60,
    });
    await deleteTimeChart(userId, chart.id);
    expect(await listTimeChartAreas(userId, chart.id)).toEqual([]);
  });

  it("does not let one user rename, delete, or read another's chart", async () => {
    const intruderId = await makeUser();
    const chart = await createTimeChart(userId, "Private");

    await expect(renameTimeChart(intruderId, chart.id, "Pwned")).rejects.toThrow(
      /not found/i,
    );
    await expect(deleteTimeChart(intruderId, chart.id)).rejects.toThrow(/not found/i);
    expect(await getTimeChart(intruderId, chart.id)).toBeNull();
    expect(await listTimeCharts(intruderId)).toEqual([]);

    // Still intact for its owner.
    expect((await getTimeChart(userId, chart.id))?.name).toBe("Private");
  });
});

describeDb("time chart areas", () => {
  let userId: string;
  let chartId: string;

  beforeEach(async () => {
    userId = await makeUser();
    chartId = (await createTimeChart(userId, "Chart")).id;
  });

  it("sorts and de-duplicates the selected weekdays", async () => {
    const area = await createTimeChartArea(userId, chartId, {
      name: "Gym",
      daysOfWeek: [5, 1, 3, 1],
      startMinute: 7 * 60,
      durationMinutes: 60,
    });
    expect(area.daysOfWeek).toEqual([1, 3, 5]);
  });

  it("applies colour and label defaults", async () => {
    const area = await createTimeChartArea(userId, chartId, {
      name: "Focus",
      daysOfWeek: [2],
      startMinute: 60,
      durationMinutes: 30,
    });
    expect(area.labelEnabled).toBe(true);
    expect(area.foreColor).toBe("#1b1d23");
    expect(area.backColor).toBe("#c8e0f0");
  });

  it("never stores a zero-length area", async () => {
    const area = await createTimeChartArea(userId, chartId, {
      name: "Blip",
      daysOfWeek: [2],
      startMinute: 60,
      durationMinutes: 0,
    });
    expect(area.durationMinutes).toBeGreaterThanOrEqual(1);
  });

  it("leaves unmentioned fields alone on a partial update", async () => {
    const area = await createTimeChartArea(userId, chartId, {
      name: "Focus",
      daysOfWeek: [2],
      startMinute: 9 * 60,
      durationMinutes: 60,
      description: "keep me",
    });
    const updated = await updateTimeChartArea(userId, area.id, {
      startMinute: 10 * 60,
    });
    expect(updated.startMinute).toBe(10 * 60);
    expect(updated.name).toBe("Focus");
    expect(updated.description).toBe("keep me");
    expect(updated.daysOfWeek).toEqual([2]);
  });

  it("refuses to add an area to a chart the user does not own", async () => {
    const intruderId = await makeUser();
    await expect(
      createTimeChartArea(intruderId, chartId, {
        name: "Sneaky",
        daysOfWeek: [0],
        startMinute: 0,
        durationMinutes: 60,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not let one user update or delete another's area", async () => {
    const intruderId = await makeUser();
    const area = await createTimeChartArea(userId, chartId, {
      name: "Mine",
      daysOfWeek: [0],
      startMinute: 0,
      durationMinutes: 60,
    });

    await expect(
      updateTimeChartArea(intruderId, area.id, { name: "Theirs" }),
    ).rejects.toThrow(/not found/i);
    await expect(deleteTimeChartArea(intruderId, area.id)).rejects.toThrow(
      /not found/i,
    );

    const [still] = await listTimeChartAreas(userId, chartId);
    expect(still.name).toBe("Mine");
  });
});

describeDb("appointments", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("applies defaults on create", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Standup",
      ...hourAt("2026-03-02"),
    });
    expect(appt.checkState).toBe("open");
    expect(appt.showAs).toBe("busy");
    expect(appt.allDay).toBe(false);
    expect(appt.private).toBe(false);
    expect(appt.recurrenceFrequency).toBe("none");
    expect(appt.contexts).toEqual([]);
  });

  it("names an unnamed appointment rather than storing an empty subject", async () => {
    const appt = await makeAppointment(userId, {
      subject: "   ",
      ...hourAt("2026-03-02"),
    });
    expect(appt.subject).toBe("Appointment");
  });

  it("rejects an end at or before the start", async () => {
    const { startAt } = hourAt("2026-03-02");
    await expect(
      createAppointment(userId, { subject: "Backwards", startAt, endAt: startAt }),
    ).rejects.toThrow(/after start/i);
    await expect(
      createAppointment(userId, {
        subject: "Backwards",
        startAt,
        endAt: new Date(startAt.getTime() - 60_000),
      }),
    ).rejects.toThrow(/after start/i);
  });

  it("rejects an unparseable date", async () => {
    const { startAt } = hourAt("2026-03-02");
    await expect(
      createAppointment(userId, {
        subject: "Bad",
        startAt,
        endAt: new Date("not a date"),
      }),
    ).rejects.toThrow(/invalid/i);
  });

  it("normalises recurrence input", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Weekly",
      ...hourAt("2026-03-02"),
      recurrenceFrequency: "weekly",
      recurrenceInterval: 0, // must floor to 1, or expansion would never advance
      recurrenceByWeekday: [4, 1, 4],
    });
    expect(appt.recurrenceInterval).toBe(1);
    expect(appt.recurrenceByWeekday).toEqual([1, 4]);
  });

  it("leaves unmentioned fields alone on a partial update", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Standup",
      location: "Room 1",
      notes: "keep me",
      ...hourAt("2026-03-02"),
    });
    const updated = await updateAppointment(userId, appt.id, { subject: "Retro" });
    expect(updated.subject).toBe("Retro");
    expect(updated.location).toBe("Room 1");
    expect(updated.notes).toBe("keep me");
    expect(updated.startAt.getTime()).toBe(appt.startAt.getTime());
  });

  it("validates the range against existing values on a partial update", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Standup",
      ...hourAt("2026-03-02"),
    });
    // Moving only the end, to before the untouched start, must still be rejected.
    await expect(
      updateAppointment(userId, appt.id, {
        endAt: new Date(appt.startAt.getTime() - 60_000),
      }),
    ).rejects.toThrow(/after start/i);
  });

  it("cycles the check state", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Standup",
      ...hourAt("2026-03-02"),
    });
    const done = await setAppointmentCheckState(userId, appt.id, "done");
    expect(done.checkState).toBe("done");
  });

  it("drops recurrence when a series occurrence is dragged", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Weekly",
      ...hourAt("2026-03-02"),
      recurrenceFrequency: "weekly",
      recurrenceEnd: "count",
      recurrenceCount: 5,
    });
    const moved = hourAt("2026-03-03");
    const out = await rescheduleAppointment(
      userId,
      appt.id,
      moved.startAt,
      moved.endAt,
      { clearRecurrence: true },
    );
    expect(out.recurrenceFrequency).toBe("none");
    expect(out.recurrenceEnd).toBe("never");
    expect(out.recurrenceCount).toBeNull();
    expect(out.startAt.getTime()).toBe(moved.startAt.getTime());
  });

  it("keeps recurrence when rescheduling without the flag", async () => {
    const appt = await makeAppointment(userId, {
      subject: "Weekly",
      ...hourAt("2026-03-02"),
      recurrenceFrequency: "weekly",
    });
    const moved = hourAt("2026-03-03");
    const out = await rescheduleAppointment(
      userId,
      appt.id,
      moved.startAt,
      moved.endAt,
    );
    expect(out.recurrenceFrequency).toBe("weekly");
  });

  it("does not let one user read, change, or delete another's appointment", async () => {
    const intruderId = await makeUser();
    const appt = await makeAppointment(userId, {
      subject: "Private",
      ...hourAt("2026-03-02"),
    });
    const moved = hourAt("2026-03-04");

    expect(await getAppointment(intruderId, appt.id)).toBeNull();
    await expect(
      updateAppointment(intruderId, appt.id, { subject: "Pwned" }),
    ).rejects.toThrow(/not found/i);
    await expect(setAppointmentCheckState(intruderId, appt.id, "done")).rejects.toThrow(
      /not found/i,
    );
    await expect(
      rescheduleAppointment(intruderId, appt.id, moved.startAt, moved.endAt),
    ).rejects.toThrow(/not found/i);
    await expect(deleteAppointment(intruderId, appt.id)).rejects.toThrow(/not found/i);

    expect((await getAppointment(userId, appt.id))?.subject).toBe("Private");
  });
});

describeDb("loadSchedule", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("selects the first chart when none is requested", async () => {
    await createTimeChart(userId, "B chart");
    await createTimeChart(userId, "A chart");
    const payload = await loadSchedule(userId, {
      range: weekRange(fromDateKey("2026-03-02")),
    });
    // listTimeCharts orders by name, so "A chart" leads.
    expect(payload.charts[0].name).toBe("A chart");
    expect(payload.selectedChartId).toBe(payload.charts[0].id);
  });

  it("falls back to the first chart when handed an id the user cannot see", async () => {
    const otherId = await makeUser();
    const foreign = await createTimeChart(otherId, "Not yours");
    const mine = await createTimeChart(userId, "Mine");

    const payload = await loadSchedule(userId, {
      range: weekRange(fromDateKey("2026-03-02")),
      timeChartId: foreign.id,
    });
    expect(payload.selectedChartId).toBe(mine.id);
  });

  it("turns chart areas into background events for the requested week", async () => {
    const chart = await createTimeChart(userId, "Chart");
    await createTimeChartArea(userId, chart.id, {
      name: "Sleep",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startMinute: 0,
      durationMinutes: 6 * 60,
    });
    const payload = await loadSchedule(userId, {
      range: weekRange(fromDateKey("2026-03-02")),
    });
    expect(payload.backgroundEvents).toHaveLength(7);
  });

  it("expands a recurring master into occurrences inside the week", async () => {
    // Weekly Monday, starting well before the requested week.
    await createAppointment(userId, {
      subject: "Standup",
      ...hourAt("2026-01-05"),
      recurrenceFrequency: "weekly",
    });
    const payload = await loadSchedule(userId, {
      range: weekRange(fromDateKey("2026-03-01")), // Sunday
    });
    expect(payload.appointments).toHaveLength(1);
    expect(payload.occurrences).toHaveLength(1);
    expect(payload.occurrences[0].startAt.getDay()).toBe(1);
    expect(payload.occurrences[0].isRecurring).toBe(true);
  });

  it("omits a one-off appointment from a week it does not touch", async () => {
    await createAppointment(userId, {
      subject: "One off",
      ...hourAt("2026-06-10"),
    });
    const payload = await loadSchedule(userId, {
      range: weekRange(fromDateKey("2026-03-01")),
    });
    expect(payload.occurrences).toEqual([]);
  });

  it("covers a twenty-day range, not just the first week of it", async () => {
    // The regression this guards: `loadSchedule` used to hardcode `weekStart + 7`, so a
    // wider range would have drawn thirteen empty columns.
    await createAppointment(userId, { subject: "Day 18", ...hourAt("2026-03-19") });
    await createAppointment(userId, { subject: "Day 21", ...hourAt("2026-03-22") });

    const payload = await loadSchedule(userId, {
      range: scheduleRange(fromDateKey("2026-03-02"), {
        dayCount: 20,
        anchorMode: "rolling",
        workWeek: false,
      }),
    });
    expect(payload.occurrences.map((o) => o.subject)).toEqual(["Day 18"]);
    expect(payload.days).toHaveLength(20);
  });

  it("skips the weekend in Work Week Mode instead of narrowing the range", async () => {
    // 2026-03-07 is a Saturday; five *visible* days from Monday the 2nd reach Friday the
    // 6th, and the weekend is not drawn at all.
    await createAppointment(userId, { subject: "Friday", ...hourAt("2026-03-06") });
    await createAppointment(userId, { subject: "Saturday", ...hourAt("2026-03-07") });

    const payload = await loadSchedule(userId, {
      range: scheduleRange(fromDateKey("2026-03-02"), {
        dayCount: 5,
        anchorMode: "rolling",
        workWeek: true,
      }),
    });
    expect(payload.occurrences.map((o) => o.subject)).toEqual(["Friday"]);
  });

  it("never returns another user's appointments", async () => {
    const otherId = await makeUser();
    await createAppointment(otherId, {
      subject: "Theirs",
      ...hourAt("2026-03-02"),
    });
    const payload = await loadSchedule(userId, {
      range: weekRange(fromDateKey("2026-03-01")),
    });
    expect(payload.appointments).toEqual([]);
    expect(payload.occurrences).toEqual([]);
  });
});
