import { describe, expect, it } from "vitest";
import { canonicalLink } from "./links";
import { bezierPath, dropResult, moveExceedsThreshold, relationForGate } from "./drag";

describe("relationForGate", () => {
  it.each([
    ["top", "parent"],
    ["bottom", "child"],
    ["left", "jump"],
    ["right", "jump"],
  ] as const)("%s gate means the other thought is a %s", (side, relation) => {
    expect(relationForGate(side)).toBe(relation);
  });
});

describe("dropResult", () => {
  it("links the source to the thought under the pointer, in the gate's relation", () => {
    expect(dropResult("A", "bottom", "B", true)).toEqual({
      kind: "link",
      thoughtId: "A",
      relation: "child",
      otherId: "B",
    });
    // Dragging from B's top gate onto A is the same stored link, read from the other end.
    const fromTop = dropResult("B", "top", "A", true);
    expect(
      fromTop.kind === "link" &&
        canonicalLink(fromTop.thoughtId, fromTop.relation, fromTop.otherId),
    ).toEqual(canonicalLink("A", "child", "B"));
  });

  it("asks for a new thought when released over empty canvas", () => {
    expect(dropResult("A", "left", null, true)).toEqual({
      kind: "create",
      thoughtId: "A",
      relation: "jump",
    });
  });

  it("does nothing on itself, on a +N more chip, or without a real drag", () => {
    expect(dropResult("A", "top", "A", true)).toEqual({ kind: "none" });
    expect(dropResult("A", "top", "more:children", true)).toEqual({ kind: "none" });
    expect(dropResult("A", "top", null, false)).toEqual({ kind: "none" });
    expect(dropResult("A", "top", "B", false)).toEqual({ kind: "none" });
  });
});

describe("moveExceedsThreshold", () => {
  it("treats a wobble as a click and a real move as a drag", () => {
    expect(moveExceedsThreshold({ x: 0, y: 0 }, { x: 2, y: 1 })).toBe(false);
    expect(moveExceedsThreshold({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true);
  });
});

describe("bezierPath", () => {
  it("leaves a vertical gate straight down and a horizontal one straight sideways", () => {
    expect(bezierPath({ x: 0, y: 0 }, { x: 10, y: 20 }, "vertical")).toBe(
      "M0,0 C0,10 10,10 10,20",
    );
    expect(bezierPath({ x: 0, y: 0 }, { x: 20, y: 10 }, "horizontal")).toBe(
      "M0,0 C10,0 10,10 20,10",
    );
  });
});
