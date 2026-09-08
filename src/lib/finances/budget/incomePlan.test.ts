import { describe, expect, it } from "vitest";
import { regularIncomePlan } from "./incomePlan";
import type { BudgetCategoryRow } from "./queries";

type Row = Pick<
  BudgetCategoryRow,
  "id" | "name" | "kind" | "incomeRole" | "expectedMonthlyIncomeCents"
>;

const row = (id: string, patch: Partial<Row> = {}): Row => ({
  id,
  name: id,
  kind: "income",
  incomeRole: "regular",
  expectedMonthlyIncomeCents: 100_00,
  ...patch,
});

/**
 * `expectedCents` is the numerator of the affordability margin the Budget page prints, and
 * its whole job is to be **null rather than optimistic**. Every branch below that returns
 * null would read as "you can afford this" if it returned a number instead, which is the
 * one way this function can be wrong without looking wrong.
 */
describe("regularIncomePlan", () => {
  it("adds up the regular paycheques and reports no gaps", () => {
    const plan = regularIncomePlan([
      row("a"),
      row("b", { expectedMonthlyIncomeCents: 50_00 }),
    ]);
    expect(plan.knownCents).toBe(150_00);
    expect(plan.expectedCents).toBe(150_00);
    expect(plan.missing).toEqual([]);
    expect(plan.noRegularIncome).toBe(false);
  });

  it("counts only income envelopes whose role is regular", () => {
    const plan = regularIncomePlan([
      row("salary"),
      row("bonus", { incomeRole: "other" }),
      row("groceries", { kind: "spending", incomeRole: "other" }),
    ]);
    expect(plan.knownCents).toBe(100_00);
    expect(plan.expectedCents).toBe(100_00);
  });

  // The dangerous case: one estimate missing among several. Summing the rest would produce
  // a smaller, entirely plausible number that the margin would then treat as the whole
  // income.
  it("refuses an expected total while any regular envelope has no estimate", () => {
    const plan = regularIncomePlan([
      row("salary"),
      row("side", { expectedMonthlyIncomeCents: null }),
    ]);
    expect(plan.expectedCents).toBeNull();
    expect(plan.missing.map((entry) => entry.id)).toEqual(["side"]);
    // `knownCents` still reports what is known — it is the figure, not the verdict.
    expect(plan.knownCents).toBe(100_00);
  });

  // Zero regular envelopes is not "income of zero", which would make every plan look
  // unaffordable by exactly its own size; it is "we do not know yet".
  it("refuses an expected total when there is no regular income at all", () => {
    const plan = regularIncomePlan([row("bonus", { incomeRole: "other" })]);
    expect(plan.noRegularIncome).toBe(true);
    expect(plan.expectedCents).toBeNull();
    expect(plan.knownCents).toBe(0);
    expect(plan.missing).toEqual([]);
  });

  it("says the same about an empty budget", () => {
    const plan = regularIncomePlan([]);
    expect(plan.noRegularIncome).toBe(true);
    expect(plan.expectedCents).toBeNull();
  });

  it("treats a declared zero as a real estimate, not a missing one", () => {
    const plan = regularIncomePlan([row("unpaid", { expectedMonthlyIncomeCents: 0 })]);
    expect(plan.missing).toEqual([]);
    expect(plan.expectedCents).toBe(0);
    expect(plan.noRegularIncome).toBe(false);
  });
});
