import { describe, expect, it } from "vitest";
import {
  addTagToNotes,
  legacyCategoryTag,
  normalizeTagInput,
  noteTagOccurrences,
  tagsInNotes,
} from "./tags";

describe("Actual-style note tags", () => {
  it("extracts multiple case-sensitive tags and ignores escaped hashes", () => {
    expect(tagsInNotes("Trip #Travel #travel ##literal #Travel")).toEqual([
      "Travel",
      "travel",
    ]);
  });

  it("reports occurrence offsets for rendering without changing the note", () => {
    expect(noteTagOccurrences("Pay #gift now")).toEqual([
      { tag: "gift", start: 4, end: 9 },
    ]);
  });

  it("appends once and preserves existing whitespace", () => {
    expect(addTagToNotes("Dinner", "#dining-out")).toBe("Dinner #dining-out");
    expect(addTagToNotes("Dinner #dining-out", "dining-out")).toBe(
      "Dinner #dining-out",
    );
    expect(addTagToNotes("Dinner\n", "dining-out")).toBe("Dinner\n#dining-out");
  });

  it("rejects values Notes could not parse as one tag", () => {
    expect(() => normalizeTagInput("two words")).toThrow(/whitespace/i);
    expect(() => normalizeTagInput("bad#tag")).toThrow(/#/);
  });

  it("creates deterministic migration slugs", () => {
    expect(legacyCategoryTag("Rent & Housing")).toBe("rent-and-housing");
    expect(legacyCategoryTag("Café / Dining")).toBe("cafe-dining");
  });
});
