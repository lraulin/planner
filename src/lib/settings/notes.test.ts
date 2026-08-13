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

  /**
   * Grid vs Journal is a page now, so the choice lives in the URL and the stored blobs written
   * before that carry a key nothing reads. It has to fall out silently rather than survive as
   * an extra property, or a saved View would round-trip a presentation it can no longer honour.
   */
  it("ignores the presentation key left behind by older builds", () => {
    expect(parseNotesView({ presentation: "journal" })).toEqual(DEFAULT_NOTES_VIEW);
    expect(
      parseNotesView({ mode: "flat", presentation: "journal" }),
    ).not.toHaveProperty("presentation");
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
