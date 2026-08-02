import { describe, expect, it } from "vitest";
import {
  displayEntryType,
  entriesToClipboardTsv,
  entriesToCsv,
  pickEntriesInOrder,
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
