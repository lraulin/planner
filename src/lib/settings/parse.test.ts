import { describe, expect, it } from "vitest";
import {
  asBoolean,
  asClampedNumber,
  asFiniteNumber,
  asKnownStringArray,
  asMap,
  asOneOf,
  asRecord,
  asString,
  asStringArray,
} from "./parse";

describe("asRecord", () => {
  it("accepts a plain object only", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toBeNull();
    expect(asRecord("{}")).toBeNull();
    // An array is an object to `typeof`, and is never the shape a settings blob wants.
    expect(asRecord([1, 2])).toBeNull();
  });
});

describe("scalar readers", () => {
  it("falls back on the wrong type", () => {
    expect(asString(7, "x")).toBe("x");
    expect(asBoolean("true", false)).toBe(false);
    expect(asFiniteNumber("3", 1)).toBe(1);
  });

  it("rejects NaN and the infinities, which typeof lets through", () => {
    expect(asFiniteNumber(Number.NaN, 5)).toBe(5);
    expect(asFiniteNumber(Number.POSITIVE_INFINITY, 5)).toBe(5);
    expect(asFiniteNumber(-0, 5)).toBe(-0);
  });

  it("clamps after the finite check, so junk lands on the fallback not the bound", () => {
    expect(asClampedNumber(500, 100, 40, 400)).toBe(400);
    expect(asClampedNumber(10, 100, 40, 400)).toBe(40);
    expect(asClampedNumber("wide", 100, 40, 400)).toBe(100);
  });

  it("keeps a value only while it is still one of the allowed options", () => {
    expect(asOneOf("desc", ["asc", "desc"], "asc")).toBe("desc");
    expect(asOneOf("sideways", ["asc", "desc"], "asc")).toBe("asc");
    expect(asOneOf(null, ["asc", "desc"], "asc")).toBe("asc");
  });
});

describe("asStringArray", () => {
  it("honours an explicitly empty list", () => {
    // The one rule worth stating: "the user chose nothing" and "the user chose nothing
    // yet" are different, and only a missing key means the latter.
    expect(asStringArray([], ["a"])).toEqual([]);
    expect(asStringArray(undefined, ["a"])).toEqual(["a"]);
  });

  it("drops non-strings and de-duplicates", () => {
    expect(asStringArray(["a", 1, "a", null, "b"], [])).toEqual(["a", "b"]);
  });
});

describe("asKnownStringArray", () => {
  it("degrades a renamed value to absent rather than to a filter matching nothing", () => {
    // A state removed from the enum should read as "that state is not shown", never as a
    // selection that silently matches no rows.
    expect(asKnownStringArray(["done", "retired"], ["done", "open"], [])).toEqual([
      "done",
    ]);
  });

  it("still falls back when the stored value is not a list", () => {
    expect(asKnownStringArray("done", ["done"], ["open"])).toEqual(["open"]);
  });
});

describe("asMap", () => {
  it("drops entries the reader rejects and keeps their siblings", () => {
    const read = (entry: unknown) => (typeof entry === "number" ? entry : null);
    expect(asMap({ a: 1, b: "two", c: 3 }, read)).toEqual({ a: 1, c: 3 });
  });

  it("is empty for a non-object", () => {
    expect(asMap(["a"], () => 1)).toEqual({});
    expect(asMap(null, () => 1)).toEqual({});
  });
});
