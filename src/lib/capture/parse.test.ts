import { describe, expect, it } from "vitest";
import { parseCapture } from "./parse";

/** Indented names, so a case reads as the tree it is meant to produce. */
function shape(text: string): string[] {
  return parseCapture(text).map((item) => `${"  ".repeat(item.depth)}${item.name}`);
}

describe("parseCapture", () => {
  it("returns one item per line", () => {
    expect(shape("Call the dentist\nRenew registration")).toEqual([
      "Call the dentist",
      "Renew registration",
    ]);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(shape("\n\n  Call the dentist  \n\n\nRenew registration\n\n")).toEqual([
      "Call the dentist",
      "Renew registration",
    ]);
  });

  it("handles CRLF from a Windows clipboard", () => {
    expect(shape("Parent\r\n  Child")).toEqual(["Parent", "  Child"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCapture("")).toEqual([]);
    expect(parseCapture("   \n\t\n")).toEqual([]);
  });

  describe("indentation", () => {
    // The three widths anyone actually pastes. All three mean the same thing, and the
    // parser must not care which one it got.
    it.each([
      ["two spaces", "Parent\n  Child"],
      ["four spaces", "Parent\n    Child"],
      ["a tab", "Parent\n\tChild"],
    ])("reads %s as one level down", (_label, text) => {
      expect(shape(text)).toEqual(["Parent", "  Child"]);
    });

    it("mixes widths within one paste", () => {
      // Tab then four spaces then two: inconsistent, but each is deeper than the last, so
      // the intent is unambiguous even though the widths disagree.
      expect(shape("A\n\tB\n\t    C\n\t      D")).toEqual([
        "A",
        "  B",
        "    C",
        "      D",
      ]);
    });

    it("normalises a block pasted with everything indented", () => {
      // Copied out of the middle of a document. The shallowest line is the top level, or
      // the whole paste would arrive nested under nothing.
      expect(shape("    A\n        B\n    C")).toEqual(["A", "  B", "C"]);
    });

    it("returns to a shallower level", () => {
      expect(shape("A\n  B\n    C\n  D\nE")).toEqual(["A", "  B", "    C", "  D", "E"]);
    });

    it("lands a jump of several levels one step below its parent", () => {
      // There is no node between A and B to hang B from, so the extra indentation cannot
      // mean anything deeper than "child of A".
      expect(shape("A\n            B")).toEqual(["A", "  B"]);
    });

    it("treats an unindented line after a deeper one as a new top-level item", () => {
      expect(shape("  A\n    B\nC")).toEqual(["A", "  B", "C"]);
    });

    it("keeps a level open across a line that is indented between two known levels", () => {
      // 0, 4, then 2: shallower than 4 but deeper than 0, so it is a sibling of the depth-1
      // line rather than a third level.
      expect(shape("A\n    B\n  C")).toEqual(["A", "  B", "  C"]);
    });
  });

  describe("pasted list formats", () => {
    it.each([
      ["dash", "- Call the dentist"],
      ["asterisk", "* Call the dentist"],
      ["plus", "+ Call the dentist"],
      ["numbered with a dot", "1. Call the dentist"],
      ["numbered with a paren", "1) Call the dentist"],
      ["an unchecked box", "[ ] Call the dentist"],
      ["a checked box", "[x] Call the dentist"],
      ["a bulleted box", "- [ ] Call the dentist"],
      ["a quote", "> Call the dentist"],
      ["a heading", "### Call the dentist"],
      ["a quoted checked bullet", "> - [X] Call the dentist"],
    ])("strips %s", (_label, text) => {
      expect(shape(text)).toEqual(["Call the dentist"]);
    });

    it("keeps indentation while stripping the marker in front of it", () => {
      expect(shape("- Parent\n    * Child\n    1. Sibling")).toEqual([
        "Parent",
        "  Child",
        "  Sibling",
      ]);
    });

    it("skips a line that is nothing but a marker", () => {
      // A trailing empty bullet is a common paste artifact. It must not become a task, and
      // must not open an indent level that swallows what follows.
      expect(shape("- A\n-\n- B")).toEqual(["A", "B"]);
    });

    it("leaves a hyphen inside a name alone", () => {
      expect(shape("Buy e-ink display")).toEqual(["Buy e-ink display"]);
    });
  });

  describe("the ## note separator", () => {
    it("splits a name from its note", () => {
      expect(parseCapture("Buy milk ## whole, not 2%")).toEqual([
        { depth: 0, name: "Buy milk", note: "whole, not 2%" },
      ]);
    });

    it("reads a heading as a name rather than an empty name with a note", () => {
      // Markers are stripped first, so `## Groceries` is a heading that has already become
      // plain text by the time the separator is looked for. Getting this backwards would
      // turn every pasted heading into a nameless task.
      expect(parseCapture("## Groceries")).toEqual([
        { depth: 0, name: "Groceries", note: "" },
      ]);
    });

    it("splits at the first separator only", () => {
      expect(parseCapture("A ## first ## second")).toEqual([
        { depth: 0, name: "A", note: "first ## second" },
      ]);
    });

    it("tolerates an empty note", () => {
      expect(parseCapture("Buy milk ##")).toEqual([
        { depth: 0, name: "Buy milk", note: "" },
      ]);
    });

    it("keeps the note on the indented item it belongs to", () => {
      expect(parseCapture("Parent\n  Child ## detail")).toEqual([
        { depth: 0, name: "Parent", note: "" },
        { depth: 1, name: "Child", note: "detail" },
      ]);
    });
  });

  it("parses a realistic mixed-format paste", () => {
    const pasted = [
      "- Call the dentist",
      "    * Find the insurance card",
      "    1. Check the copay",
      "[ ] Renew registration ## expires end of month",
    ].join("\n");

    expect(parseCapture(pasted)).toEqual([
      { depth: 0, name: "Call the dentist", note: "" },
      { depth: 1, name: "Find the insurance card", note: "" },
      { depth: 1, name: "Check the copay", note: "" },
      { depth: 0, name: "Renew registration", note: "expires end of month" },
    ]);
  });
});
