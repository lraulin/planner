import { describe, expect, it } from "vitest";
import { placeAt } from "./listOrder";

describe("placeAt", () => {
  it("inserts a new id at the requested drop slot", () => {
    expect(placeAt(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(placeAt(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(placeAt(["a", "b"], "c", 99)).toEqual(["a", "b", "c"]);
  });

  it("moves an existing id using list-including drop slots", () => {
    // Drag c before a (slot 0).
    expect(placeAt(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    // Drag a to the end (slot 3) or just before where c was after a left (slot 2).
    expect(placeAt(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
    expect(placeAt(["a", "b", "c"], "a", 2)).toEqual(["b", "a", "c"]);
    // Dropping on its own slot is a no-op.
    expect(placeAt(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(placeAt(["a", "b", "c"], "b", 2)).toEqual(["a", "b", "c"]);
  });
});
