import { describe, expect, it } from "vitest";
import { calendarDaysAgo, formatDaysAgo } from "./daysAgo";

describe("calendarDaysAgo", () => {
  it("counts local calendar days, not elapsed hours", () => {
    const now = new Date(2026, 7, 31, 9, 0, 0);
    const yesterdayEvening = new Date(2026, 7, 30, 22, 0, 0);
    expect(calendarDaysAgo(yesterdayEvening, now)).toBe(1);
    expect(formatDaysAgo(yesterdayEvening, now)).toBe("yesterday");
    expect(formatDaysAgo(now, now)).toBe("today");
    expect(formatDaysAgo(new Date(2026, 7, 28, 18, 0, 0), now)).toBe("3 days ago");
  });
});
