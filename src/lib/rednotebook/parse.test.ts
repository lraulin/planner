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

describe("extractTextField — YAML flow scalars", () => {
  // PyYAML wraps a long scalar at the first space past column 80 and indents the
  // continuation. YAML reads one line break as one space, so the wrap is not content.
  it("folds a wrapped single-quoted scalar back into one line", () => {
    const chunk = `{text: 'one two three\n    four five'}`;
    expect(extractTextField(chunk)).toBe("one two three four five");
  });

  it("reads an empty line inside a quoted scalar as a newline", () => {
    expect(extractTextField(`{text: 'first\n\n    second'}`)).toBe("first\nsecond");
    expect(extractTextField(`{text: 'first\n\n\n    second'}`)).toBe("first\n\nsecond");
  });

  it("drops trailing space before a fold rather than doubling it", () => {
    expect(extractTextField(`{text: 'one  \n    two'}`)).toBe("one two");
  });

  it("folds a wrapped double-quoted scalar and honours an escaped break", () => {
    expect(extractTextField(`{text: "one two\n    three"}`)).toBe("one two three");
    // A backslash before the break joins the pieces with nothing between them.
    expect(extractTextField(`{text: "abc\\\n    def"}`)).toBe("abcdef");
  });

  it("decodes the numeric and named escapes PyYAML writes for non-ASCII text", () => {
    expect(extractTextField(`{text: "caf\\xE9 \\u2019s \\U0001F600"}`)).toBe(
      "caf\u00e9 \u2019s \u{1F600}",
    );
    expect(extractTextField(`{text: "a\\tb \\\\ \\" \\/ \\_ \\N \\0 \\e"}`)).toBe(
      'a\tb \\ " / \u00a0 \u0085 \0 \u001b',
    );
  });

  it("keeps an escape it cannot decode as written, not as a half-eaten letter", () => {
    expect(extractTextField(`{text: "a\\xZZb"}`)).toBe("a\\xZZb");
  });

  it("folds a wrapped plain scalar inside a flow mapping", () => {
    expect(extractTextField(`{text: one two\n    three, Cat: {a: 1}}`)).toBe(
      "one two three",
    );
  });

  it("folds a wrapped plain scalar in block style and stops at the next key", () => {
    const chunk = `\n  text: one two\n    three\n  Cat: {a: 1}\n`;
    expect(extractTextField(chunk)).toBe("one two three");
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

  it("keeps a wrapped block-style plain scalar whole and does not run into the next key", () => {
    // The day header's own whitespace match has already eaten the key's indentation by the
    // time `text:` is read, so where the scalar ends has to come from the next line itself.
    const content = `3:
  text: went out early
    and came back late
  Cat: {Walk: null}
4: {text: 'x'}
`;
    const result = parseMonthFile("2018-05.txt", content);
    expect(result.days).toEqual([
      { dayOfMonth: 3, text: "went out early and came back late" },
      { dayOfMonth: 4, text: "x" },
    ]);
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
