import { describe, expect, it } from "vitest";
import {
  DATE_FORMAT_OPTIONS,
  DEFAULT_DATE_FORMAT,
  formatDateKey,
  formatFullDateKey,
} from "./dateFormat";

const EXPECTED: Record<(typeof DATE_FORMAT_OPTIONS)[number]["id"], string> = {
  "M/D/YYYY": "1/5/2026",
  "M/D/YY": "1/5/26",
  "MM/DD/YYYY": "01/05/2026",
  "MM/DD/YY": "01/05/26",
  "D/M/YYYY": "5/1/2026",
  "D/M/YY": "5/1/26",
  "DD/MM/YYYY": "05/01/2026",
  "DD/MM/YY": "05/01/26",
  "YYYY-MM-DD": "2026-01-05",
  "YYYY/MM/DD": "2026/01/05",
  "MMM D, YYYY": "Jan 5, 2026",
  "MMMM D, YYYY": "January 5, 2026",
  "D MMM YYYY": "5 Jan 2026",
  "D MMMM YYYY": "5 January 2026",
  "D-MMM-YY": "5-Jan-26",
  "D-MMM-YYYY": "5-Jan-2026",
  "DDD, MMM D, YYYY": "Mon, Jan 5, 2026",
  "DDDD, MMMM D, YYYY": "Monday, January 5, 2026",
  "M/D": "1/5",
  "MM/DD": "01/05",
  "D/M": "5/1",
  "DD/MM": "05/01",
  "MMM D": "Jan 5",
  "MMMM D": "January 5",
  "D MMM": "5 Jan",
  "D-MMM": "5-Jan",
  "MMM-YY": "Jan-26",
  "MMM YYYY": "Jan 2026",
  "MMMM YYYY": "January 2026",
  DDD: "Mon",
  DDDD: "Monday",
};

describe("formatDateKey", () => {
  it("formats every preset deterministically in English", () => {
    expect(DATE_FORMAT_OPTIONS).toHaveLength(31);
    for (const option of DATE_FORMAT_OPTIONS) {
      expect(formatDateKey("2026-01-05", option.id), option.id).toBe(
        EXPECTED[option.id],
      );
    }
  });

  it("uses the four-digit Achieve default", () => {
    expect(DEFAULT_DATE_FORMAT).toBe("M/D/YYYY");
    expect(formatDateKey("2026-01-05")).toBe("1/5/2026");
    expect(formatDateKey("2026-01-05", "retired-format")).toBe("1/5/2026");
  });

  it("validates real calendar days including leap years", () => {
    expect(formatDateKey("2024-02-29", "DDDD, MMMM D, YYYY")).toBe(
      "Thursday, February 29, 2024",
    );
    expect(formatDateKey("2026-02-29")).toBe("");
    expect(formatDateKey("2026-04-31")).toBe("");
  });

  it("returns blank for missing or malformed calendar keys", () => {
    for (const value of [
      null,
      undefined,
      "",
      "not-a-date",
      "2026-1-05",
      "2026-13-01",
      "2026-01-32",
      "2026-01-05T00:00:00Z",
    ]) {
      expect(formatDateKey(value)).toBe("");
    }
  });

  it("derives weekdays from written calendar components, not a timezone", () => {
    expect(formatDateKey("2026-01-01", "DDDD")).toBe("Thursday");
    expect(formatDateKey("2000-01-01", "DDDD")).toBe("Saturday");
    expect(formatFullDateKey("2026-01-05")).toBe("Monday, January 5, 2026");
  });

  /**
   * Weekly-plan "last week's rewrite" used to ship weekStart as ISO midnight and format
   * it with `toLocaleDateString`. Under America/New_York a UTC-midnight Sunday paints as
   * Saturday. Day keys + formatDateKey never re-parse an instant, so the label sticks.
   */
  it("keeps a plan-week day label on the written day west of UTC", () => {
    expect(formatDateKey("2026-07-26", "MMM D")).toBe("Jul 26");

    const utcMidnightSunday = new Date("2026-07-26T00:00:00.000Z");
    expect(
      utcMidnightSunday.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    ).toBe("Jul 25");
  });
});
