import { describe, expect, it } from "vitest";
import { displayPercentComplete } from "./percent";

describe("displayPercentComplete", () => {
  it("uses the stored value on a leaf, even when the rollup is 0", () => {
    // No effort estimate → weighted rollup collapses to 0, but the row still has progress.
    expect(
      displayPercentComplete({
        hasChildren: false,
        percentComplete: 40,
        percentCompleteRollup: 0,
      }),
    ).toBe(40);
  });

  it("treats a null leaf percent as 0", () => {
    expect(
      displayPercentComplete({
        hasChildren: false,
        percentComplete: null,
        percentCompleteRollup: 0,
      }),
    ).toBe(0);
  });

  it("uses the effort-weighted rollup on a parent", () => {
    expect(
      displayPercentComplete({
        hasChildren: true,
        percentComplete: 0,
        percentCompleteRollup: 75,
      }),
    ).toBe(75);
  });
});
