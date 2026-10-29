import { describe, expect, it } from "vitest";
import {
  minuteOfDayLabel,
  parseMinuteOfDay,
  shiftZonedDays,
  zonedMinuteOfDay,
  zonedWallTime,
} from "./zonedTime";

const NY = "America/New_York";

describe("zonedWallTime", () => {
  it("places 9:00 Eastern at 13:00 UTC in summer and 14:00 UTC in winter", () => {
    expect(zonedWallTime("2026-07-15", 9 * 60, NY).toISOString()).toBe(
      "2026-07-15T13:00:00.000Z",
    );
    expect(zonedWallTime("2026-12-15", 9 * 60, NY).toISOString()).toBe(
      "2026-12-15T14:00:00.000Z",
    );
  });

  // The day the clocks go back: midnight is still EDT, 9:00 is already EST. A single offset
  // read at midnight would put this an hour early.
  it("uses the offset in force at the answer, not at midnight", () => {
    expect(zonedWallTime("2026-11-01", 9 * 60, NY).toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
    expect(zonedWallTime("2026-03-08", 9 * 60, NY).toISOString()).toBe(
      "2026-03-08T13:00:00.000Z",
    );
  });

  it("does not depend on the process zone", () => {
    // The suite runs pinned to New York; ask for a zone that is not it.
    expect(zonedWallTime("2026-07-15", 9 * 60, "Asia/Tokyo").toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });
});

describe("shiftZonedDays", () => {
  it("keeps a reminder at 9:00 across the fall-back weekend", () => {
    const friday = zonedWallTime("2026-10-30", 9 * 60, NY);
    const monday = shiftZonedDays(friday, 3, NY);
    expect(monday.toISOString()).toBe("2026-11-02T14:00:00.000Z");
    expect(zonedMinuteOfDay(monday, NY)).toBe(9 * 60);
  });

  it("keeps the evening on its own day rather than UTC's", () => {
    // 22:30 Eastern is already tomorrow in UTC.
    const late = zonedWallTime("2026-10-29", 22 * 60 + 30, NY);
    expect(shiftZonedDays(late, 1, NY).toISOString()).toBe("2026-10-31T02:30:00.000Z");
  });
});

describe("minute-of-day text", () => {
  it("round-trips and rejects out-of-range input", () => {
    expect(minuteOfDayLabel(540)).toBe("09:00");
    expect(parseMinuteOfDay("09:00")).toBe(540);
    expect(parseMinuteOfDay("7:05")).toBe(425);
    expect(parseMinuteOfDay("24:00")).toBeNull();
    expect(parseMinuteOfDay("nine")).toBeNull();
  });
});
