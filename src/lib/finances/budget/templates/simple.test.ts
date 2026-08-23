import { describe, expect, it } from "vitest";

import { applyLimit, runSimple } from "./simple";
import type { SimpleTemplate } from "./types";

const monthly: SimpleTemplate = {
  id: "t1",
  directive: "template",
  type: "simple",
  priority: 0,
  monthlyCents: 5000,
};

const refill: SimpleTemplate = {
  id: "t2",
  directive: "template",
  type: "simple",
  priority: 0,
  limit: { amountCents: 15000, hold: false },
};

describe("runSimple", () => {
  it("assigns the monthly amount even when carry-in is already higher — it is not a refill", () => {
    expect(runSimple(monthly, 8000)).toBe(5000);
  });

  it("with only a limit is a refill: limit minus carry-in", () => {
    expect(runSimple(refill, 4000)).toBe(11000);
  });

  it("treats the refill against whatever carry-in it was given, including zero", () => {
    expect(runSimple(refill, 0)).toBe(15000);
  });
});

describe("applyLimit", () => {
  it("will not assign past the cap when hold is false", () => {
    expect(applyLimit(5000, 8000, 0, { amountCents: 10000, hold: false })).toBe(2000);
  });

  it("will not remove funds already over the cap when hold is true", () => {
    expect(applyLimit(5000, 12000, 0, { amountCents: 10000, hold: true })).toBe(0);
  });

  it("pulls money back when hold is false and carry-in already exceeds the cap", () => {
    expect(applyLimit(5000, 12000, 0, { amountCents: 10000, hold: false })).toBe(-2000);
  });
});
