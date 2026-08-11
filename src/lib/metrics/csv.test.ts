import { describe, expect, it } from "vitest";
import {
  displayEntryType,
  entriesToClipboardTsv,
  entriesToCsv,
  parseEntriesCsv,
  pickEntriesInOrder,
  splitCsvLine,
} from "./csv";

describe("entriesToCsv", () => {
  it("writes a header and date-desc rows", () => {
    const csv = entriesToCsv([
      {
        id: "a",
        entryDate: "2025-01-05",
        entryType: "new_total",
        target: 80,
        value: 95,
      },
      {
        id: "b",
        entryDate: "2025-02-01",
        entryType: "new_total",
        target: 80,
        value: 91,
      },
    ]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("Date,Type,Target,Value");
    expect(lines[1]).toBe("2025-02-01,New Total,80,91");
    expect(lines[2]).toBe("2025-01-05,New Total,80,95");
  });

  it("quotes fields that need it", () => {
    const csv = entriesToCsv([
      { entryDate: "2025-01-01", entryType: 'say "hi"', target: null, value: 1 },
    ]);
    expect(csv).toContain('"say ""hi"""');
  });
});

describe("entriesToClipboardTsv", () => {
  it("includes a header and keeps caller order", () => {
    const tsv = entriesToClipboardTsv(
      [
        {
          entryDate: "2025-01-05",
          entryType: "new_total",
          target: null,
          value: 95,
        },
        {
          entryDate: "2025-02-01",
          entryType: "new_total",
          target: 80,
          value: 1.618,
        },
      ],
      { includeTarget: true },
    );
    expect(tsv).toBe(
      "Date\tType\tTarget\tValue\n2025-01-05\tNew Total\t\t95\n2025-02-01\tNew Total\t80\t1.618",
    );
  });

  it("omits Target when includeTarget is false", () => {
    const tsv = entriesToClipboardTsv(
      [
        {
          entryDate: "2025-01-05",
          entryType: "new_total",
          target: 80,
          value: 95,
        },
      ],
      { includeTarget: false },
    );
    expect(tsv).toBe("Date\tType\tValue\n2025-01-05\tNew Total\t95");
  });
});

describe("pickEntriesInOrder", () => {
  it("keeps display order and skips missing ids", () => {
    const rows = [
      {
        id: "a",
        entryDate: "2025-01-01",
        entryType: "new_total",
        target: null,
        value: 1,
      },
      {
        id: "b",
        entryDate: "2025-02-01",
        entryType: "new_total",
        target: null,
        value: 2,
      },
      {
        id: "c",
        entryDate: "2025-03-01",
        entryType: "new_total",
        target: null,
        value: 3,
      },
    ];
    expect(pickEntriesInOrder(rows, new Set(["c", "a"])).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
  });
});

describe("displayEntryType", () => {
  it("labels new_total", () => {
    expect(displayEntryType("new_total")).toBe("New Total");
  });
});

describe("splitCsvLine", () => {
  it("splits plain and quoted fields", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
    expect(splitCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(splitCsvLine('"say ""hi""",1')).toEqual(['say "hi"', "1"]);
  });
});

describe("parseEntriesCsv", () => {
  it("round-trips export shape newest-first", () => {
    const csv = entriesToCsv([
      {
        id: "a",
        entryDate: "2025-01-05",
        entryType: "new_total",
        target: 80,
        value: 95,
      },
      {
        id: "b",
        entryDate: "2025-02-01",
        entryType: "new_total",
        target: null,
        value: 91,
      },
    ]);
    const { entries, errors } = parseEntriesCsv(csv);
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      {
        entryDate: "2025-02-01",
        entryType: "new_total",
        target: null,
        value: 91,
      },
      {
        entryDate: "2025-01-05",
        entryType: "new_total",
        target: 80,
        value: 95,
      },
    ]);
  });

  it("strips trailing lb and reports bad dates", () => {
    const { entries, errors } = parseEntriesCsv(
      "Date,Type,Target,Value\n2025-10-29,New Total,,93 lb\nbad-date,New Total,,1\n",
    );
    expect(entries).toEqual([
      {
        entryDate: "2025-10-29",
        entryType: "new_total",
        target: null,
        value: 93,
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
  });

  it("requires Date and Value headers", () => {
    const { entries, errors } = parseEntriesCsv("Foo,Bar\n1,2\n");
    expect(entries).toEqual([]);
    expect(errors[0]?.message).toMatch(/Date/);
  });

  it("accepts a quoted multi-line cell without inventing a broken next row", () => {
    // Tracking columns today never hold newlines, but escapeCsvField will write them and
    // a hand-edited sheet can too — split-on-newline used to turn one row into two errors.
    const csv = ["Date,Type,Target,Value", '2025-10-29,"Custom\nType",80,93', ""].join(
      "\n",
    );
    const { entries, errors } = parseEntriesCsv(csv);
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      {
        entryDate: "2025-10-29",
        entryType: "Custom\nType",
        target: 80,
        value: 93,
      },
    ]);
  });
});
