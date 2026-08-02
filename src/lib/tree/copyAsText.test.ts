import { describe, expect, it } from "vitest";
import { copyAsText, type CopyableRow } from "./copyAsText";

const TREE: CopyableRow[] = [
  { id: "ra", name: "Work", depth: 0 },
  { id: "g", name: "Ship planner", depth: 1 },
  { id: "p", name: "Outline polish", depth: 2 },
  { id: "t1", name: "Multiselect", depth: 3 },
  { id: "t2", name: "Copy as text", depth: 3 },
  { id: "p2", name: "Other project", depth: 2 },
];

describe("copyAsText", () => {
  it("returns empty string when nothing is selected", () => {
    expect(copyAsText(TREE, new Set())).toBe("");
  });

  it("copies a single name with no indent", () => {
    expect(copyAsText(TREE, new Set(["t1"]))).toBe("Multiselect");
  });

  it("preserves relative nesting, not absolute depth", () => {
    // Selecting the project and its tasks should start flush left at the project.
    expect(copyAsText(TREE, new Set(["p", "t1", "t2"]))).toBe(
      ["Outline polish", "  Multiselect", "  Copy as text"].join("\n"),
    );
  });

  it("keeps display order, not selection order", () => {
    expect(copyAsText(TREE, new Set(["t2", "t1", "p"]))).toBe(
      ["Outline polish", "  Multiselect", "  Copy as text"].join("\n"),
    );
  });

  it("uses Untitled for a blank name", () => {
    expect(copyAsText([{ id: "x", name: "  ", depth: 0 }], new Set(["x"]))).toBe(
      "Untitled",
    );
  });

  it("rebases indent to the shallowest selected row", () => {
    // t1 is deeper than p2, so p2 is flush and t1 keeps one level of relative indent.
    expect(copyAsText(TREE, new Set(["t1", "p2"]))).toBe(
      ["  Multiselect", "Other project"].join("\n"),
    );
  });
});
