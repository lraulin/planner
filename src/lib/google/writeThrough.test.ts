import { beforeEach, describe, expect, it, vi } from "vitest";

const { patchEvent } = vi.hoisted(() => ({
  patchEvent: vi.fn(),
}));

vi.mock("./client", () => ({
  GoogleEventGoneError: class GoogleEventGoneError extends Error {},
  deleteEvent: vi.fn(),
  insertEvent: vi.fn(),
  patchEvent,
}));

import { GoogleEventGoneError } from "./client";
import { GOOGLE_EVENT_GONE_MESSAGE, pushUpdate } from "./writeThrough";

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

describe("pushUpdate", () => {
  beforeEach(() => {
    patchEvent.mockReset();
    patchEvent.mockResolvedValue({
      id: "evt-1",
      etag: '"v2"',
      updated: "2026-08-10T12:00:00.000Z",
    });
  });

  it("targets the Google series id for recurring rows", async () => {
    await pushUpdate(
      "user-1",
      {
        externalSource: "google",
        externalId: "evt-1_20260810T090000Z",
        externalSeriesId: "evt-1",
        externalCalendarId: "calendar-1",
      },
      {
        subject: "Standup",
        location: "",
        notes: "",
        startAt: new Date("2026-08-10T09:00:00.000Z"),
        endAt: new Date("2026-08-10T09:30:00.000Z"),
        allDay: false,
        showAs: "busy",
        colorId: "5",
        recurrenceFrequency: "weekly",
        recurrenceInterval: 1,
        recurrenceByWeekday: null,
        recurrenceEnd: "never",
        recurrenceCount: null,
        recurrenceUntil: null,
      },
    );

    expect(patchEvent).toHaveBeenCalledWith(
      "user-1",
      "calendar-1",
      "evt-1",
      expect.objectContaining({ summary: "Standup", colorId: "5" }),
    );
  });
});
