import { describe, expect, it } from "vitest";
import { defaultOffBudget, isCoreBudgetKind, resolvedOffBudget } from "./accountKind";

describe("account membership", () => {
  it("treats checking, savings, cash and cards as core on-budget kinds", () => {
    expect(isCoreBudgetKind("checking")).toBe(true);
    expect(isCoreBudgetKind("savings")).toBe(true);
    expect(isCoreBudgetKind("cash")).toBe(true);
    expect(isCoreBudgetKind("credit_card")).toBe(true);
    expect(isCoreBudgetKind("investment")).toBe(false);
    expect(isCoreBudgetKind("loan")).toBe(false);
    expect(isCoreBudgetKind("other")).toBe(false);
  });

  it("defaults new investments and loans off-budget, and everything else on", () => {
    expect(defaultOffBudget("investment")).toBe(true);
    expect(defaultOffBudget("loan")).toBe(true);
    expect(defaultOffBudget("checking")).toBe(false);
    expect(defaultOffBudget("savings")).toBe(false);
    expect(defaultOffBudget("other")).toBe(false);
  });

  it("refuses to store a core kind as off-budget even when asked", () => {
    expect(resolvedOffBudget("savings", true)).toBe(false);
    expect(resolvedOffBudget("checking", true)).toBe(false);
    expect(resolvedOffBudget("credit_card")).toBe(false);
  });

  it("lets a flexible kind keep an explicit membership, and defaults when omitted", () => {
    expect(resolvedOffBudget("investment", false)).toBe(false);
    expect(resolvedOffBudget("investment", true)).toBe(true);
    expect(resolvedOffBudget("investment")).toBe(true);
    expect(resolvedOffBudget("other")).toBe(false);
    expect(resolvedOffBudget("other", true)).toBe(true);
  });
});
