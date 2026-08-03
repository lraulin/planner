import { describe, expect, it } from "vitest";
import {
  dateKeyFor,
  extractTextField,
  parseMonthFile,
  yearMonthFromFilename,
} from "./parse";

describe("yearMonthFromFilename", () => {
  it("accepts YYYY-MM.txt and basenames with paths", () => {
    expect(yearMonthFromFilename("2018-06.txt")).toBe("2018-06");
    expect(yearMonthFromFilename("/tmp/data/2023-11.txt")).toBe("2023-11");
  });

  it("rejects non-month names and conflict backups", () => {
    expect(yearMonthFromFilename("notes.txt")).toBeNull();
    expect(
      yearMonthFromFilename("2018-06.CONFLICT_BACKUP1527985144.8344388.txt"),
    ).toBeNull();
  });
});

describe("dateKeyFor", () => {
  it("builds a valid day and rejects impossible dates", () => {
    expect(dateKeyFor("2018-06", 4)).toBe("2018-06-04");
    expect(dateKeyFor("2018-02", 31)).toBeNull();
  });
});

describe("extractTextField", () => {
  it("reads single-quoted text with doubled quotes", () => {
    const chunk = `{text: 'It''s fine.'}`;
    expect(extractTextField(chunk)).toBe("It's fine.");
  });

  it("reads double-quoted text with escapes", () => {
    const chunk = `{text: "line one\\nline two"}`;
    expect(extractTextField(chunk)).toBe("line one\nline two");
  });

  it("strips !!python/unicode tags", () => {
    const chunk = `{text: !!python/unicode 'hello'}`;
    expect(extractTextField(chunk)).toBe("hello");
  });
});

describe("parseMonthFile", () => {
  it("parses multiple days from a month document", () => {
    const content = `15: {text: 'First day'}
17:
  text: "Second\\nday"
`;
    const result = parseMonthFile("2017-12.txt", content);
    expect(result.yearMonth).toBe("2017-12");
    expect(result.days).toEqual([
      { dayOfMonth: 15, text: "First day" },
      { dayOfMonth: 17, text: "Second\nday" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("warns and skips an unreadable day without failing the month", () => {
    const content = `1: {text: 'ok'}
2: {notext: 1}
`;
    const result = parseMonthFile("2018-01.txt", content);
    expect(result.days).toEqual([{ dayOfMonth: 1, text: "ok" }]);
    expect(result.warnings.some((w) => w.includes("2018-01-02"))).toBe(true);
  });
});
