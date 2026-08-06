import { describe, expect, it } from "vitest";
import { depthForOutlineLevel } from "./outlineLevel";

describe("outline level to tree depth", () => {
  // Level 1 is the top row of result areas, which sit at depth 0. Passing the level
  // through unchanged is the plausible mistake, and it shows one level too many.
  it("maps Achieve's 1-based level onto the tree's 0-based depth", () => {
    expect(depthForOutlineLevel(1)).toBe(0);
    expect(depthForOutlineLevel(2)).toBe(1);
    expect(depthForOutlineLevel(9)).toBe(8);
  });

  it("does not go below the roots", () => {
    expect(depthForOutlineLevel(0)).toBe(0);
    expect(depthForOutlineLevel(-3)).toBe(0);
  });
});
