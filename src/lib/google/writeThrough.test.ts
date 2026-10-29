import { describe, expect, it } from "vitest";

import { GoogleEventGoneError } from "./client";
import { SeriesDateChangeError } from "./errors";
import {
  anchorToSeries,
  buildUpdatePatch,
  GOOGLE_EVENT_GONE_MESSAGE,
  type PushableAppointment,
} from "./writeThrough";

/**
 * `pushUpdate` rewrites `GoogleEventGoneError` to this sentence so the appointment drawer
 * (and any action that surfaces `error.message`) tells the user to refresh rather than
 * showing a calendar-id blob or leaving them on a permanent save failure with no guidance.
 *
 * The network path itself is not unit-tested here — it needs a live Google token — but the
 * message is the part a refactor tends to "simplify" away into a generic Internal error.
 */
describe("GOOGLE_EVENT_GONE_MESSAGE", () => {
  it("names Google and tells the user to refresh", () => {
    expect(GOOGLE_EVENT_GONE_MESSAGE).toMatch(/Google Calendar/i);
    expect(GOOGLE_EVENT_GONE_MESSAGE).toMatch(/refresh/i);
  });

  it("is distinct from the low-level client wording", () => {
    // The client error is resource-neutral ("item") because 404 also means a missing
    // calendar. The write-through message is specific: this edit was of an event.
    const lowLevel = new GoogleEventGoneError().message;
    expect(GOOGLE_EVENT_GONE_MESSAGE).not.toBe(lowLevel);
  });
});

const weekly = (over: Partial<PushableAppointment>): PushableAppointment => ({
  subject: "Standup",
  location: "",
  notes: "",
  startAt: new Date("2026-08-10T09:00:00.000Z"),
  endAt: new Date("2026-08-10T09:30:00.000Z"),
  allDay: false,
  showAs: "busy",
  colorId: null,
  recurrenceFrequency: "weekly",
  recurrenceInterval: 1,
  recurrenceByWeekday: null,
  recurrenceEnd: "never",
  recurrenceCount: null,
  recurrenceUntil: null,
  ...over,
});

describe("buildUpdatePatch", () => {
  it("targets the Google series id for recurring rows", () => {
    const { targetEventId, patch } = buildUpdatePatch(
      { externalId: "evt-1_20260810T090000Z", externalSeriesId: "evt-1" },
      weekly({ colorId: "5" }),
    );

    // The instance id would have edited Monday only.
    expect(targetEventId).toBe("evt-1");
    expect(patch).toMatchObject({ summary: "Standup", colorId: "5" });
  });

  it("falls back to the event id when there is no series", () => {
    const { targetEventId } = buildUpdatePatch(
      { externalId: "evt-9", externalSeriesId: null },
      weekly({ recurrenceFrequency: "none" }),
    );

    expect(targetEventId).toBe("evt-9");
  });

  it("omits recurrence for a one-off so a PATCH cannot invent a series", () => {
    const { patch } = buildUpdatePatch(
      { externalId: "evt-9", externalSeriesId: null },
      weekly({ recurrenceFrequency: "none" }),
    );

    expect(patch).not.toHaveProperty("recurrence");
  });

  it("sends the RRULE when converting a repeating event to all-day", () => {
    // Same-day 9–10 plus all-day, without the exclusive end and without clearing
    // dateTime, is the 400 "Invalid start time" that landed in the drawer.
    const { patch } = buildUpdatePatch(
      { externalId: "evt-1_20260812T130000Z", externalSeriesId: "evt-1" },
      weekly({
        subject: "Retreat",
        startAt: new Date(2026, 7, 12, 9, 0, 0),
        endAt: new Date(2026, 7, 12, 10, 0, 0),
        allDay: true,
      }),
    );

    expect(patch).toMatchObject({
      start: { date: "2026-08-12", dateTime: null },
      end: { date: "2026-08-13", dateTime: null },
      recurrence: ["RRULE:FREQ=WEEKLY"],
    });
  });
});

describe("buildUpdatePatch occurrence scope", () => {
  it("targets the instance id and sends only the times", () => {
    // A drag moves one occurrence. Aiming it at the series id moved the whole series.
    const { targetEventId, patch } = buildUpdatePatch(
      { externalId: "evt-1_20260810T090000Z", externalSeriesId: "evt-1" },
      weekly({
        startAt: new Date("2026-08-11T15:00:00.000Z"),
        endAt: new Date("2026-08-11T15:30:00.000Z"),
      }),
      "occurrence",
    );

    expect(targetEventId).toBe("evt-1_20260810T090000Z");
    expect(Object.keys(patch).sort()).toEqual(["end", "start"]);
    expect(patch.start).toMatchObject({ dateTime: "2026-08-11T15:00:00.000Z" });
  });
});

describe("anchorToSeries", () => {
  const ZONE = "America/New_York";
  // Weekly from Monday 2026-08-03, 9:00 Eastern.
  const seriesStart = { dateTime: "2026-08-03T09:00:00-04:00", timeZone: ZONE };
  // The third Monday as stored: 9:00 EDT.
  const previousStart = { dateTime: "2026-08-17T13:00:00.000Z", timeZone: ZONE };

  const timed = (start: string, end: string) => ({
    summary: "Standup",
    start: { date: null, dateTime: start, timeZone: ZONE },
    end: { date: null, dateTime: end, timeZone: ZONE },
  });

  it("keeps the series' first date and takes the occurrence's new time", () => {
    const anchored = anchorToSeries(
      timed("2026-08-17T14:00:00.000Z", "2026-08-17T14:45:00.000Z"),
      previousStart,
      seriesStart,
      ZONE,
    );

    expect(anchored).toEqual({
      summary: "Standup",
      start: { date: null, dateTime: "2026-08-03T10:00:00", timeZone: ZONE },
      end: { date: null, dateTime: "2026-08-03T10:45:00", timeZone: ZONE },
    });
  });

  it("reads the series' first day in the write zone, not UTC", () => {
    // A series whose DTSTART was stamped UTC: 02:00Z Tuesday is 10 PM Monday Eastern.
    const anchored = anchorToSeries(
      timed("2026-08-18T02:30:00.000Z", "2026-08-18T03:00:00.000Z"),
      { dateTime: "2026-08-18T02:00:00.000Z" },
      { dateTime: "2026-08-04T02:00:00Z", timeZone: "UTC" },
      ZONE,
    );

    expect(anchored.start).toMatchObject({ dateTime: "2026-08-03T22:30:00" });
    expect(anchored.end).toMatchObject({ dateTime: "2026-08-03T23:00:00" });
  });

  it("keeps an end that runs past midnight on the following day", () => {
    const anchored = anchorToSeries(
      timed("2026-08-18T03:00:00.000Z", "2026-08-18T05:00:00.000Z"), // 11 PM – 1 AM
      { dateTime: "2026-08-18T03:00:00.000Z" },
      { dateTime: "2026-08-03T23:00:00-04:00", timeZone: ZONE },
      ZONE,
    );

    expect(anchored.start).toMatchObject({ dateTime: "2026-08-03T23:00:00" });
    expect(anchored.end).toMatchObject({ dateTime: "2026-08-04T01:00:00" });
  });

  it("anchors an all-day edit on the series' first day, keeping its length", () => {
    const anchored = anchorToSeries(
      {
        start: { date: "2026-08-17", dateTime: null, timeZone: ZONE },
        end: { date: "2026-08-19", dateTime: null, timeZone: ZONE },
      },
      { date: "2026-08-17" },
      seriesStart,
      ZONE,
    );

    expect(anchored).toEqual({
      start: { date: "2026-08-03", dateTime: null, timeZone: ZONE },
      end: { date: "2026-08-05", dateTime: null, timeZone: ZONE },
    });
  });

  it("refuses an edit that moves the occurrence to another day", () => {
    expect(() =>
      anchorToSeries(
        timed("2026-08-18T13:00:00.000Z", "2026-08-18T13:30:00.000Z"),
        previousStart,
        seriesStart,
        ZONE,
      ),
    ).toThrow(SeriesDateChangeError);
  });

  it("leaves a patch without times alone", () => {
    expect(
      anchorToSeries({ summary: "Renamed" }, previousStart, seriesStart, ZONE),
    ).toEqual({ summary: "Renamed" });
  });
});
