import { describe, expect, it } from "vitest";
import { displayEntryType, entriesToCsv } from "./csv";

describe("entriesToCsv", () => {
  it("writes a header and date-desc rows", () => {
    const csv = entriesToCsv([
      { entryDate: "2025-01-05", entryType: "new_total", target: 80, value: 95 },
      { entryDate: "2025-02-01", entryType: "new_total", target: 80, value: 91 },
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

describe("displayEntryType", () => {
  it("labels new_total", () => {
    expect(displayEntryType("new_total")).toBe("New Total");
  });
});
