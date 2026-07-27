import { describe, expect, it } from "vitest";
import { after, before, between, first, sequence } from "./sortKey";

describe("sortKey", () => {
  it("generates a key for an empty list", () => {
    expect(first()).toBe("V");
  });

  it("orders a new key after an existing one", () => {
    const a = first();
    expect(after(a) > a).toBe(true);
  });

  it("orders a new key before an existing one", () => {
    const a = first();
    expect(before(a) < a).toBe(true);
  });

  it("places a key strictly between two others", () => {
    const a = first();
    const c = after(a);
    const b = between(a, c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it("subdivides repeatedly without collision", () => {
    let low = first();
    let high = after(low);

    for (let i = 0; i < 200; i++) {
      const mid = between(low, high);
      expect(low < mid).toBe(true);
      expect(mid < high).toBe(true);
      // Alternate which side we squeeze, so both branches get exercised.
      if (i % 2 === 0) low = mid;
      else high = mid;
    }
  });

  it("handles adjacent leading digits by extending the key", () => {
    // "A" and "B" are consecutive in the alphabet, leaving no room at the first digit.
    const mid = between("A", "B");
    expect("A" < mid).toBe(true);
    expect(mid < "B").toBe(true);
    expect(mid.length).toBeGreaterThan(1);
  });

  it("preserves shared prefixes", () => {
    const mid = between("AV", "AW");
    expect(mid.startsWith("A")).toBe(true);
    expect("AV" < mid).toBe(true);
    expect(mid < "AW").toBe(true);
  });

  it("treats null bounds as the start and end of the list", () => {
    const a = first();
    expect(between(null, a) < a).toBe(true);
    expect(between(a, null) > a).toBe(true);
    expect(between(null, null)).toBe(first());
  });

  it("generates an ascending sequence", () => {
    const keys = sequence(50);
    expect(keys).toHaveLength(50);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(50);
  });

  it("rejects out-of-order bounds", () => {
    expect(() => between("V", "G")).toThrow(/out of order/);
    expect(() => between("V", "V")).toThrow(/out of order/);
  });

  it("rejects keys ending in 0, which have no room below them", () => {
    expect(() => after("A0")).toThrow(/must not end with/);
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => after("A-B")).toThrow(/outside the key alphabet/);
  });

  it("never generates a key ending in 0", () => {
    let key = first();
    for (let i = 0; i < 100; i++) {
      expect(key.endsWith("0")).toBe(false);
      key = between(key, after(key));
    }
  });
});
