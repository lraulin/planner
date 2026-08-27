import { describe, expect, it } from "vitest";
import { evalArithmetic } from "./arithmetic";

describe("evalArithmetic", () => {
  it("reads a plain number", () => {
    expect(evalArithmetic("50")).toBe(50);
    expect(evalArithmetic("12.99")).toBe(12.99);
    expect(evalArithmetic("  7  ")).toBe(7);
  });

  // Ported from Actual's arithmetic.test.ts — the cases their evaluator is pinned on.
  it("evaluates the ported Actual cases", () => {
    expect(evalArithmetic("10 + -4")).toBe(6);
    expect(evalArithmetic("(12 + 3) + (10)")).toBe(25);
    expect(evalArithmetic("2400 / 2 / 5")).toBe(240);
  });

  it("applies precedence rather than reading left to right", () => {
    expect(evalArithmetic("2+3*4")).toBe(14);
    expect(evalArithmetic("(2+3)*4")).toBe(20);
    expect(evalArithmetic("(40+60)/2")).toBe(50);
  });

  it("handles unary signs", () => {
    expect(evalArithmetic("-5")).toBe(-5);
    expect(evalArithmetic("+5")).toBe(5);
    expect(evalArithmetic("2*-3")).toBe(-6);
    expect(evalArithmetic("-(2+3)")).toBe(-5);
  });

  it("tolerates currency chrome inside a token", () => {
    expect(evalArithmetic("$1,000 + 50")).toBe(1050);
    expect(evalArithmetic("$12.99*2")).toBe(25.98);
  });

  it("returns null for nothing to evaluate", () => {
    expect(evalArithmetic("")).toBeNull();
    expect(evalArithmetic("   ")).toBeNull();
  });

  it("returns null rather than guessing at malformed input", () => {
    expect(evalArithmetic("abc")).toBeNull();
    expect(evalArithmetic("2+")).toBeNull();
    expect(evalArithmetic("*3")).toBeNull();
    expect(evalArithmetic("(2+3")).toBeNull();
    expect(evalArithmetic("2+3)")).toBeNull();
    expect(evalArithmetic("5 apples")).toBeNull();
  });

  // Actual strips every space before scanning, so `1 2` becomes twelve. Two numbers with a
  // space between them is a typo, and a silent 12 is the worst possible reading of it.
  it("rejects two numbers separated by a space", () => {
    expect(evalArithmetic("1 2")).toBeNull();
  });

  it("returns null for a non-finite result", () => {
    expect(evalArithmetic("1/0")).toBeNull();
    expect(evalArithmetic("0/0")).toBeNull();
  });
});
