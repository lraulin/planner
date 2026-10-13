import { describe, expect, it } from "vitest";
import { readerTodayKey } from "./readerZone";

describe("readerTodayKey", () => {
  it("is still the previous evening's date when UTC has already rolled over", () => {
    // 8:30 PM EDT on Oct 13 is 00:30 UTC on Oct 14: `toDateKey` and a UTC server's
    // `localDateKey` say the 14th, the reader says the 13th.
    expect(readerTodayKey(new Date("2026-10-14T00:30:00Z"))).toBe("2026-10-13");
  });

  it("rolls over at the reader's midnight, not UTC's", () => {
    // Midnight EDT is 04:00 UTC in October.
    expect(readerTodayKey(new Date("2026-10-14T03:59:00Z"))).toBe("2026-10-13");
    expect(readerTodayKey(new Date("2026-10-14T04:00:00Z"))).toBe("2026-10-14");
  });

  it("follows the standard-time offset in winter", () => {
    // EST is UTC-5, so midnight is 05:00 UTC.
    expect(readerTodayKey(new Date("2026-12-15T04:30:00Z"))).toBe("2026-12-14");
    expect(readerTodayKey(new Date("2026-12-15T05:00:00Z"))).toBe("2026-12-15");
  });
});
