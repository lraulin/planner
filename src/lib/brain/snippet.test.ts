import { describe, expect, it } from "vitest";
import { snippetAround } from "./snippet";

describe("snippetAround", () => {
  it("is empty when there is no match in the note", () => {
    expect(snippetAround("anything", -1)).toBe("");
  });

  it("starts at the beginning when the match is near it", () => {
    expect(snippetAround("Plant after the last frost.", 21)).toBe(
      "Plant after the last frost.",
    );
  });

  it("starts on a word boundary, with an ellipsis, deep into a note", () => {
    const note =
      "Seeds go in early and the tomatoes want staking before the first frost arrives.";
    const out = snippetAround(note, note.indexOf("frost"));
    expect(out.startsWith("…")).toBe(true);
    expect(out).toContain("frost");
    // The first word after the ellipsis is a whole word of the note, not a fragment.
    expect(note).toContain(` ${out.slice(1).split(" ")[0]} `);
  });

  it("keeps the match when there is no space before it to snap to", () => {
    const note = "x".repeat(40) + "frost";
    expect(snippetAround(note, 40)).toContain("frost");
  });
});
