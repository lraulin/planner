import { describe, expect, it } from "vitest";
import { agendaRows } from "./agenda";
import type { ScheduleOccurrence } from "./queries";
import { scheduleRange, weekRange } from "./range";

function occurrence(over: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence {
  const startAt = over.startAt ?? new Date(2026, 7, 12, 9, 0);
  return {
    id: "appt1",
    occurrenceKey: `appt1@${startAt.toISOString()}`,
    subject: "Standup",
    startAt,
    endAt: over.endAt ?? new Date(startAt.getTime() + 30 * 60_000),
    allDay: false,
    checkState: "open",
    projectId: null,
    isRecurring: false,
    calendarColor: null,
    eventColor: null,
    ...over,
  };
}

const WEDNESDAY = new Date(2026, 7, 12);

describe("agendaRows", () => {
  it("orders by day, then all-day, then start time", () => {
    const rows = agendaRows(
      [
        occurrence({ subject: "Thursday 8am", startAt: new Date(2026, 7, 13, 8, 0) }),
        occurrence({ subject: "Wednesday 2pm", startAt: new Date(2026, 7, 12, 14, 0) }),
        occurrence({
          subject: "Wednesday all day",
          startAt: new Date(2026, 7, 12, 0, 0),
          allDay: true,
        }),
        occurrence({ subject: "Wednesday 9am", startAt: new Date(2026, 7, 12, 9, 0) }),
      ],
      weekRange(WEDNESDAY).days,
    );
    expect(rows.map((row) => row.subject)).toEqual([
      "Wednesday all day",
      "Wednesday 9am",
      "Wednesday 2pm",
      "Thursday 8am",
    ]);
  });

  it("breaks a tie on subject rather than leaving the order to chance", () => {
    const at = new Date(2026, 7, 12, 9, 0);
    const rows = agendaRows(
      [
        occurrence({ id: "b", occurrenceKey: "b@1", subject: "Zebra", startAt: at }),
        occurrence({ id: "a", occurrenceKey: "a@1", subject: "Aardvark", startAt: at }),
      ],
      weekRange(WEDNESDAY).days,
    );
    expect(rows.map((row) => row.subject)).toEqual(["Aardvark", "Zebra"]);
  });

  it("drops a day the calendar is not drawing", () => {
    // Three days from Wednesday: Thursday is in, the following Monday is not.
    const range = scheduleRange(WEDNESDAY, {
      dayCount: 3,
      anchorMode: "rolling",
      workWeek: false,
    });
    const rows = agendaRows(
      [
        occurrence({ subject: "Thursday", startAt: new Date(2026, 7, 13, 9, 0) }),
        occurrence({ subject: "Monday", startAt: new Date(2026, 7, 17, 9, 0) }),
      ],
      range.days,
    );
    expect(rows.map((row) => row.subject)).toEqual(["Thursday"]);
  });

  it("hides the weekend the range spans but does not draw", () => {
    // The rule this function exists for: in Work Week Mode the range runs across a weekend
    // it never shows, so `start <= x < end` is not the same question as "is it on screen".
    const range = scheduleRange(WEDNESDAY, {
      dayCount: 5,
      anchorMode: "rolling",
      workWeek: true,
    });
    const rows = agendaRows(
      [
        occurrence({ subject: "Friday", startAt: new Date(2026, 7, 14, 9, 0) }),
        occurrence({ subject: "Saturday", startAt: new Date(2026, 7, 15, 9, 0) }),
        occurrence({ subject: "Monday", startAt: new Date(2026, 7, 17, 9, 0) }),
      ],
      range.days,
    );
    expect(rows.map((row) => row.subject)).toEqual(["Friday", "Monday"]);
  });

  it("files a late-evening appointment on the day it is drawn on", () => {
    // 9pm local is tomorrow in UTC. Reading UTC components off the instant — which is right
    // for a *stored calendar day* and wrong for an instant — would move this row a day on.
    const rows = agendaRows(
      [occurrence({ subject: "Late", startAt: new Date(2026, 7, 12, 21, 0) })],
      weekRange(WEDNESDAY).days,
    );
    expect(rows[0].dayKey).toBe("2026-08-12");
  });

  it("keeps each occurrence of a series as its own row", () => {
    const rows = agendaRows(
      [
        occurrence({
          occurrenceKey: "appt1@wed",
          startAt: new Date(2026, 7, 12, 9, 0),
          isRecurring: true,
        }),
        occurrence({
          occurrenceKey: "appt1@thu",
          startAt: new Date(2026, 7, 13, 9, 0),
          isRecurring: true,
        }),
      ],
      weekRange(WEDNESDAY).days,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(["appt1@wed", "appt1@thu"]);
    // Both point at the one stored appointment, which is what a row action has to act on.
    expect(new Set(rows.map((row) => row.appointmentId))).toEqual(new Set(["appt1"]));
  });

  it("resolves the project name so the column can sort on it", () => {
    const rows = agendaRows(
      [
        occurrence({ subject: "Filed", projectId: "p1" }),
        occurrence({
          occurrenceKey: "appt2@1",
          subject: "Loose",
          startAt: new Date(2026, 7, 12, 10, 0),
        }),
        occurrence({
          occurrenceKey: "appt3@1",
          subject: "Orphaned",
          projectId: "gone",
          startAt: new Date(2026, 7, 12, 11, 0),
        }),
      ],
      weekRange(WEDNESDAY).days,
      new Map([["p1", "Kitchen remodel"]]),
    );
    expect(rows.map((row) => row.projectName)).toEqual(["Kitchen remodel", "", ""]);
  });

  it("returns nothing rather than throwing on an empty range", () => {
    expect(agendaRows([occurrence()], [])).toEqual([]);
  });
});
