import { describe, expect, it } from "vitest";
import { noteSnippet } from "./snippet";

describe("noteSnippet", () => {
  it("returns plain prose unchanged", () => {
    expect(noteSnippet("Just a plain sentence.")).toBe("Just a plain sentence.");
  });

  it("returns empty for a note with no body", () => {
    expect(noteSnippet("")).toBe("");
    expect(noteSnippet("\n\n   \n")).toBe("");
  });

  it("drops the heading marker but keeps the heading text", () => {
    // A heading followed by a blank line is the most common note shape, and naively
    // splitting on the first line would preview as "" for all of them.
    expect(noteSnippet("# Meeting notes\n\nWe agreed to ship.")).toBe(
      "Meeting notes We agreed to ship.",
    );
  });

  it("skips a fenced code block entirely", () => {
    // A note that opens with pasted output would otherwise preview as "```" or as code.
    const body = "```ts\nconst x = 1;\n```\n\nThe fix is to inline it.";
    expect(noteSnippet(body)).toBe("The fix is to inline it.");
  });

  it("handles an unterminated fence without swallowing everything before it", () => {
    expect(noteSnippet("Intro line.\n\n```\nnever closed")).toBe("Intro line.");
  });

  it("keeps link text and drops the URL", () => {
    // A line that is nothing but a link is common in notes; previewing the URL is useless.
    expect(noteSnippet("See [the architecture doc](/docs/ARCH.md) for context.")).toBe(
      "See the architecture doc for context.",
    );
  });

  it("keeps image alt text, which is the only prose in an image", () => {
    expect(noteSnippet("![the failing graph](graph.png)")).toBe("the failing graph");
  });

  it("unwraps emphasis, strong, strikethrough, and inline code", () => {
    expect(noteSnippet("**Bold** and *thin* and ~~gone~~ and `code`.")).toBe(
      "Bold and thin and gone and code.",
    );
  });

  it("strips list bullets, numbers, and task-list boxes", () => {
    expect(noteSnippet("- first\n- second\n1. third\n- [ ] fourth\n- [x] fifth")).toBe(
      "first second third fourth fifth",
    );
  });

  it("peels nested quote and list markers off one line", () => {
    expect(noteSnippet("> - [ ] quoted task")).toBe("quoted task");
  });

  it("skips thematic breaks and table delimiter rows", () => {
    expect(noteSnippet("---\n\nAfter the rule.")).toBe("After the rule.");
    expect(noteSnippet("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(
      "| a | b | | 1 | 2 |",
    );
  });

  it("collapses newlines and runs of whitespace into single spaces", () => {
    expect(noteSnippet("one\n\n\ntwo    three")).toBe("one two three");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const body = "alpha bravo charlie delta echo foxtrot";
    expect(noteSnippet(body, 20)).toBe("alpha bravo charlie…");
  });

  it("hard-cuts when the first word is longer than the whole column", () => {
    // Word-boundary truncation would otherwise return just "…" for a pasted URL or hash.
    const body = "a".repeat(50);
    expect(noteSnippet(body, 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("does not truncate a body that exactly fills the limit", () => {
    const body = "12345";
    expect(noteSnippet(body, 5)).toBe("12345");
  });

  it("stops reading long notes early rather than flattening the whole body", () => {
    // A 5,000-line note must not cost a full pass on every render of every row.
    const body = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    expect(noteSnippet(body, 40)).toMatch(/^line 0 line 1 .*…$/);
  });
});
