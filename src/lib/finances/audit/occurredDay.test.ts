import { describe, expect, it } from "vitest";
import { activityOccurredDayKey } from "./occurredDay";

describe("activityOccurredDayKey", () => {
  it("keys an Eastern evening to that local day, not UTC tomorrow", () => {
    // Same trap as geometry.test.ts: 9pm EDT is 01:00Z the next day. The Time column
    // used toISOString().slice(0, 10) as the date-filter value, so an event shown as
    // "Aug 30, 9:00 PM" disappeared when the filter was "Aug 30".
    const evening = new Date(2026, 7, 30, 21, 0, 0);
    expect(activityOccurredDayKey(evening)).toBe("2026-08-30");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-08-31");
  });
});
