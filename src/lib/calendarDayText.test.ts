import { describe, expect, it } from "vitest";
import { parseCalendarDayText } from "./calendarDayText";

describe("parseCalendarDayText", () => {
  it.each([
    ["2026-08-29", "2026-08-29"],
    ["Sat, Aug 29, 2026", "2026-08-29"],
    ["Saturday August 29, 2026", "2026-08-29"],
    ["Aug 29, 2026", "2026-08-29"],
    ["Sept 3, 2026", "2026-09-03"],
    ["8/29/2026", "2026-08-29"],
    ["  08/29/2026 ", "2026-08-29"],
  ])("reads %s as a day", (text, expected) => {
    expect(parseCalendarDayText(text)).toBe(expected);
  });

  it.each([
    ["Feb 30, 2026"],
    ["2026-02-30"],
    ["13/01/2026"],
    ["Smarch 3, 2026"],
    ["2026-08-29T10:00:00Z"],
    ["Aug 29 2026"],
    [""],
  ])("refuses %s", (text) => {
    expect(parseCalendarDayText(text)).toBeNull();
  });
});
