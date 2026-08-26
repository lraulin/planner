import { describe, expect, it } from "vitest";
import { amountMatches, approxThreshold } from "./amountMatch";

describe("approxThreshold", () => {
  it("is Actual's 7.5% band in cents", () => {
    // $9.99 → 75¢, so $10.99 (100¢ away) is a different product.
    expect(approxThreshold(999)).toBe(75);
    expect(approxThreshold(0)).toBe(0);
    expect(approxThreshold(-59498)).toBe(4462);
  });
});

describe("amountMatches", () => {
  it("keeps a $9.99 Apple charge from matching a $10.99 one", () => {
    expect(amountMatches(999, 999)).toBe(true);
    expect(amountMatches(1020, 999)).toBe(true);
    expect(amountMatches(1099, 999)).toBe(false);
    expect(amountMatches(99, 999)).toBe(false);
  });

  it("treats a Geico premium as one amount across a small swing", () => {
    expect(amountMatches(59498, 59498)).toBe(true);
    expect(amountMatches(58000, 59498)).toBe(true);
  });
});
