import { describe, expect, it } from "vitest";
import { resolvePickerSelection } from "./pickerSelection";

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

describe("searchable picker selection", () => {
  it("keeps a selection that is still on screen", () => {
    expect(resolvePickerSelection(rows("a", "b", "c"), "b")).toBe("b");
  });

  // The case that made this worth extracting: search narrows the list to one row, nothing
  // looks selected, and confirming would otherwise act on the row the query just hid.
  it("falls back to the first candidate when the query hides the selection", () => {
    expect(resolvePickerSelection(rows("spanish"), "career")).toBe("spanish");
  });

  it("picks the first candidate when nothing has been selected yet", () => {
    expect(resolvePickerSelection(rows("a", "b"), null)).toBe("a");
  });

  it("has nothing to act on when the query matches nothing", () => {
    expect(resolvePickerSelection([], "a")).toBeNull();
  });
});
