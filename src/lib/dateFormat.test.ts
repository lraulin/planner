import { describe, expect, it } from "vitest";
import { formatShortDate } from "./dateFormat";

describe("formatShortDate", () => {
  it("uses the same compact format for every calendar-day key", () => {
    expect(formatShortDate("2026-01-05")).toBe("1/5/26");
    expect(formatShortDate("2025-12-31")).toBe("12/31/25");
  });

  it("reads the written day without a timezone shift", () => {
    expect(formatShortDate("2026-01-01")).toBe("1/1/26");
  });

  it("returns blank for missing or malformed keys", () => {
    expect(formatShortDate(null)).toBe("");
    expect(formatShortDate(undefined)).toBe("");
    expect(formatShortDate("")).toBe("");
    expect(formatShortDate("not-a-date")).toBe("");
    expect(formatShortDate("2026-13-01")).toBe("");
    expect(formatShortDate("2026-01-32")).toBe("");
  });
});
