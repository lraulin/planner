import { describe, expect, it } from "vitest";
import { GoogleEventGoneError } from "./client";
import { GOOGLE_EVENT_GONE_MESSAGE } from "./writeThrough";

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
