import { describe, expect, it } from "vitest";
import { EMPTY_NOTE_FILTER } from "@/lib/notes/filter";
import { DEFAULT_NOTES_VIEW, parseNotesView, serializeNotesView } from "./notes";

describe("parseNotesView", () => {
  it("falls back entirely for a non-object", () => {
    for (const value of [null, undefined, 42, "notes", [], true]) {
      expect(parseNotesView(value)).toEqual(DEFAULT_NOTES_VIEW);
    }
  });

  it("round-trips what it serializes", () => {
    const settings = {
      mode: "flat" as const,
      sort: "title" as const,
      presentation: "journal" as const,
      filter: {
        ...EMPTY_NOTE_FILTER,
        search: "health",
        subjects: ["Journal"],
        matchMode: "any" as const,
      },
    };
    expect(parseNotesView(serializeNotesView(settings))).toEqual(settings);
  });

  it("drops unknown mode and sort values", () => {
    const parsed = parseNotesView({ mode: "tree", sort: "flag" });
    expect(parsed.mode).toBe("nested");
    expect(parsed.sort).toBe("manual");
  });

  it("defaults presentation to grid and drops unknown values", () => {
    expect(parseNotesView({}).presentation).toBe("grid");
    expect(parseNotesView({ presentation: "diary" }).presentation).toBe("grid");
    expect(parseNotesView({ presentation: "journal" }).presentation).toBe("journal");
  });

  it("honours an explicitly empty subject list", () => {
    // Same rule as grid filters: empty is not absent.
    const parsed = parseNotesView({
      filter: { subjects: [], search: "x" },
    });
    expect(parsed.filter.subjects).toEqual([]);
    expect(parsed.filter.search).toBe("x");
  });
});
