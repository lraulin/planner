import { describe, expect, it } from "vitest";
import { hideField, moveField, placeField, showField } from "./fieldOrder";

describe("moveField", () => {
  it("swaps one step up or down", () => {
    expect(moveField(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveField(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the ends or for unknown ids", () => {
    expect(moveField(["a", "b"], "a", "up")).toEqual(["a", "b"]);
    expect(moveField(["a", "b"], "b", "down")).toEqual(["a", "b"]);
    expect(moveField(["a", "b"], "z", "up")).toEqual(["a", "b"]);
  });
});

describe("placeField", () => {
  it("inserts a new id at the requested drop slot", () => {
    expect(placeField(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(placeField(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(placeField(["a", "b"], "c", 99)).toEqual(["a", "b", "c"]);
  });

  it("moves an existing id using list-including drop slots", () => {
    // Drag c before a (slot 0).
    expect(placeField(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    // Drag a to the end (slot 3) or just before where c was after a left (slot 2).
    expect(placeField(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
    expect(placeField(["a", "b", "c"], "a", 2)).toEqual(["b", "a", "c"]);
    // Dropping on its own slot is a no-op.
    expect(placeField(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(placeField(["a", "b", "c"], "b", 2)).toEqual(["a", "b", "c"]);
  });
});

describe("showField / hideField", () => {
  it("appends only once and removes by id", () => {
    expect(showField(["a"], "b")).toEqual(["a", "b"]);
    expect(showField(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(hideField(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});
