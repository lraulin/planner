import { describe, expect, it } from "vitest";
import { escapeCsvField, parseCsvRows, splitCsvLine } from "./text";

describe("escapeCsvField", () => {
  it("quotes fields that contain commas, quotes, or newlines", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("splitCsvLine", () => {
  it("splits plain and quoted fields on one line", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine('"say ""hi""",1')).toEqual(['say "hi"', "1"]);
  });

  it("keeps a quoted newline when the whole string is passed at once", () => {
    // splitCsvLine is a single-string walker — it handles embedded newlines fine if the
    // caller did not already split the document on `\n`. The bug lives one layer up:
    // `text.split(/\r?\n/).map(splitCsvLine)` breaks the same cell.
    expect(splitCsvLine('"a\nb",c')).toEqual(["a\nb", "c"]);
  });
});

describe("parseCsvRows", () => {
  it("parses a simple document and drops blank rows", () => {
    expect(parseCsvRows("a,b\n1,2\n\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps newlines inside quoted fields as one cell", () => {
    // escapeCsvField writes these; split-then-splitCsvLine would break them.
    const doc = ["Date,Note,Value", '2026-01-05,"hello\nworld",1', ""].join("\n");
    expect(parseCsvRows(doc)).toEqual([
      ["Date", "Note", "Value"],
      ["2026-01-05", "hello\nworld", "1"],
    ]);
  });

  it("handles CRLF, doubled quotes, and a leading BOM", () => {
    expect(parseCsvRows('\uFEFF"a""b",c\r\n1,2\r\n')).toEqual([
      ['a"b', "c"],
      ["1", "2"],
    ]);
  });

  it("round-trips fields that escapeCsvField quotes", () => {
    const cells = ["plain", "a,b", 'say "hi"', "line1\nline2"];
    const line = cells.map(escapeCsvField).join(",");
    expect(parseCsvRows(line)).toEqual([cells]);
  });
});
