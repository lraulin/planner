import { describe, expect, it } from "vitest";
import { indentParentId, keyAtPosition, verticalPosition } from "./siblingOrder";

const level = [
  { id: "a", sortKey: "a1" },
  { id: "b", sortKey: "a3" },
  { id: "c", sortKey: "a5" },
];

describe("keyAtPosition", () => {
  it("lands strictly between the neighbours it names", () => {
    const key = keyAtPosition(level, { at: "after", siblingId: "a" });
    expect(key > "a1" && key < "a3").toBe(true);
    const before = keyAtPosition(level, { at: "before", siblingId: "c" });
    expect(before > "a3" && before < "a5").toBe(true);
  });

  it("goes past the ends for first and last", () => {
    expect(keyAtPosition(level, { at: "first" }) < "a1").toBe(true);
    expect(keyAtPosition(level, { at: "last" }) > "a5").toBe(true);
  });

  it("ignores the row being moved, so it is not its own neighbour", () => {
    // Moving b after a: counted, b would cap the gap at its own key; excluded, the gap
    // runs to c.
    const key = keyAtPosition(level, { at: "after", siblingId: "a" }, "b");
    expect(key > "a1" && key < "a5").toBe(true);
    expect(key).not.toBe(keyAtPosition(level, { at: "after", siblingId: "a" }));
  });

  it("refuses a sibling that is not on the level", () => {
    expect(() => keyAtPosition(level, { at: "before", siblingId: "z" })).toThrow(
      "Sibling not found: z",
    );
  });
});

describe("indentParentId", () => {
  it("files the row under the sibling above it", () => {
    expect(indentParentId(level, "c", "item")).toBe("b");
  });

  it("refuses the first row of a level", () => {
    expect(() => indentParentId(level, "a", "note")).toThrow(
      "this is the first note at its level",
    );
  });
});

describe("verticalPosition", () => {
  it("swaps with the neighbour in the direction asked", () => {
    expect(verticalPosition(level, "b", "up")).toEqual({
      at: "before",
      siblingId: "a",
    });
    expect(verticalPosition(level, "b", "down")).toEqual({
      at: "after",
      siblingId: "c",
    });
  });

  it("is a no-op at either end", () => {
    expect(verticalPosition(level, "a", "up")).toBeNull();
    expect(verticalPosition(level, "c", "down")).toBeNull();
  });
});
