import { describe, expect, it } from "vitest";
import { rtfToPlainText } from "./rtf";

describe("rtfToPlainText", () => {
  it("returns plain text unchanged", () => {
    expect(rtfToPlainText("just a note")).toBe("just a note");
    expect(rtfToPlainText("")).toBe("");
    expect(rtfToPlainText(null)).toBe("");
  });

  it("strips a minimal RTF document to its body text", () => {
    const rtf =
      "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24 Hello\\par world}";
    expect(rtfToPlainText(rtf)).toBe("Hello\nworld");
  });
});
