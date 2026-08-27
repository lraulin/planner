import { describe, expect, it } from "vitest";

import { GoogleEventGoneError } from "./client";
import {
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
