import { describe, expect, it } from "vitest";
import { parentIdForResultAreaChange } from "./resultAreaParent";

describe("parentIdForResultAreaChange", () => {
  it("does not move when the owning area is unchanged", () => {
    // A project nested under a goal already belongs to that goal's Result Area.
    // Re-saving the form with the same area must not yank it out to sit under the area.
    expect(
      parentIdForResultAreaChange({
        currentResultAreaId: "health",
        nextResultAreaId: "health",
      }),
    ).toBeUndefined();
  });

  it("does not move when both sides are unset", () => {
    expect(
      parentIdForResultAreaChange({
        currentResultAreaId: null,
        nextResultAreaId: null,
      }),
    ).toBeUndefined();
  });

  it("reparents under the newly chosen area", () => {
    expect(
      parentIdForResultAreaChange({
        currentResultAreaId: "health",
        nextResultAreaId: "career",
      }),
    ).toBe("career");
  });

  it("files an unassigned row under the chosen area", () => {
    expect(
      parentIdForResultAreaChange({
        currentResultAreaId: null,
        nextResultAreaId: "career",
      }),
    ).toBe("career");
  });

  it("clears the parent when the area is cleared", () => {
    expect(
      parentIdForResultAreaChange({
        currentResultAreaId: "health",
        nextResultAreaId: null,
      }),
    ).toBeNull();
  });
});
