import { describe, expect, it } from "vitest";
import { indentColumns, splitIndent, stripLeadingMarkers } from "./markers";

describe("splitIndent", () => {
  it("separates leading whitespace from the rest of the line", () => {
    expect(splitIndent("  hello")).toEqual({ indent: "  ", rest: "hello" });
    expect(splitIndent("\t\thello")).toEqual({ indent: "\t\t", rest: "hello" });
    expect(splitIndent("hello")).toEqual({ indent: "", rest: "hello" });
  });
});

describe("indentColumns", () => {
  it("counts spaces as one column and tabs as tabWidth", () => {
    expect(indentColumns("  ")).toBe(2);
    expect(indentColumns("\t")).toBe(4);
    expect(indentColumns("\t  ", 4)).toBe(6);
    expect(indentColumns("\t", 2)).toBe(2);
  });

  it("is monotonic so deeper paste lines always measure larger", () => {
    expect(indentColumns("  ")).toBeLessThan(indentColumns("\t"));
    expect(indentColumns("\t")).toBeLessThan(indentColumns("\t  "));
  });
});

describe("stripLeadingMarkers", () => {
  it.each([
    ["dash", "- Call the dentist", "Call the dentist"],
    ["asterisk", "* Call the dentist", "Call the dentist"],
    ["plus", "+ Call the dentist", "Call the dentist"],
    ["numbered with a dot", "1. Call the dentist", "Call the dentist"],
    ["numbered with a paren", "1) Call the dentist", "Call the dentist"],
    ["an unchecked box", "[ ] Call the dentist", "Call the dentist"],
    ["a checked box", "[x] Call the dentist", "Call the dentist"],
    ["a bulleted box", "- [ ] Call the dentist", "Call the dentist"],
    ["a quote", "> Call the dentist", "Call the dentist"],
    ["a heading", "### Call the dentist", "Call the dentist"],
    ["a quoted checked bullet", "> - [X] Call the dentist", "Call the dentist"],
  ])("strips %s", (_label, input, expected) => {
    expect(stripLeadingMarkers(input)).toBe(expected);
  });

  it("peels nested markers until the line stops changing", () => {
    expect(stripLeadingMarkers("> > - item")).toBe("item");
  });

  /**
   * Empty bullets left by a copied list must not survive as the task name "-".
   * Capture then drops blank names; snippets would show a lone dash.
   */
  it("strips a marker with nothing after it", () => {
    expect(stripLeadingMarkers("-")).toBe("");
    expect(stripLeadingMarkers("1.")).toBe("");
    expect(stripLeadingMarkers("###")).toBe("");
  });

  it("leaves a hyphen inside a name alone", () => {
    expect(stripLeadingMarkers("Buy e-ink display")).toBe("Buy e-ink display");
  });
});
