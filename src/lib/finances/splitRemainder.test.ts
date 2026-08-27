import { describe, expect, it } from "vitest";

import {
  assignRemainderTo,
  defaultStrategy,
  distributeRemainder,
  splitRemainderCents,
} from "./splitRemainder";

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

describe("splitRemainderCents", () => {
  it("is what the children have not claimed", () => {
    expect(splitRemainderCents(-3497, [-1300, -1999])).toBe(-198);
    expect(splitRemainderCents(-3497, [-3497])).toBe(0);
    expect(splitRemainderCents(-3497, [])).toBe(-3497);
  });

  it("rejects a fraction of a cent rather than carrying it", () => {
    expect(() => splitRemainderCents(-3497.5, [-1300])).toThrow(/integer cents/);
    expect(() => splitRemainderCents(-3497, [-1300.25])).toThrow(/child 0/);
  });
});

describe("defaultStrategy", () => {
  it("waits on an empty child before assuming tax", () => {
    expect(defaultStrategy([-1300, 0])).toBe("even");
    expect(defaultStrategy([-1300, -1999])).toBe("proportional");
  });
});

describe("distributeRemainder", () => {
  it("allocates the Apple charge's tax in proportion to price", () => {
    // Parent $34.97 = a $13.00 monthly subscription + a $19.99 annual membership + $1.98 tax.
    // Proportional shares are 78.02¢ and 119.98¢; the odd cent goes to the larger fraction.
    const result = distributeRemainder(-3497, [-1300, -1999]);
    expect(result).toEqual([-1378, -2119]);
    expect(sum(result)).toBe(-3497);
  });

  it("spreads across empty children only, when there are any", () => {
    expect(distributeRemainder(-3497, [-1300, 0, 0])).toEqual([-1300, -1099, -1098]);
  });

  it("deals the odd cents of an even split to the earliest children", () => {
    expect(distributeRemainder(-100, [0, 0, 0], "even")).toEqual([-34, -33, -33]);
  });

  it("gives a single child the whole remainder under either strategy", () => {
    expect(distributeRemainder(-3497, [-1300], "proportional")).toEqual([-3497]);
    expect(distributeRemainder(-3497, [0], "even")).toEqual([-3497]);
  });

  it("leaves a balanced split alone rather than reshuffling it", () => {
    expect(distributeRemainder(-3497, [-1378, -2119])).toEqual([-1378, -2119]);
  });

  it("falls back to every child when the strategy has no eligible one", () => {
    // Proportional over all-zero children, and even over a fully-filled split: neither has a
    // natural target, and an exact-but-arbitrary answer beats one the mutation would reject.
    expect(distributeRemainder(-100, [0, 0], "proportional")).toEqual([-50, -50]);
    expect(distributeRemainder(-100, [-20, -20], "even")).toEqual([-50, -50]);
  });

  it("weights a refund by magnitude, not by signed amount", () => {
    // A positive parent split across positive children: the larger line still takes more.
    const result = distributeRemainder(3497, [1300, 1999]);
    expect(result).toEqual([1378, 2119]);
    expect(sum(result)).toBe(3497);
  });

  it("handles a remainder that runs the other way from the amounts", () => {
    // The children over-claim: $14.00 + $21.00 against a $34.97 charge, so 3¢ comes back.
    const result = distributeRemainder(-3497, [-1400, -2100]);
    expect(sum(result)).toBe(-3497);
    expect(result).toEqual([-1399, -2098]);
  });

  it("sums to the parent exactly across awkward proportions", () => {
    const cases: Array<[number, number[]]> = [
      [-10000, [-3333, -3333, -3333]],
      [-1, [-100, 100]],
      [99999, [1, 2, 3, 4, 5, 6, 7]],
      [-4501, [-1000, -1000, -1000, -1000]],
      [7, [0, 0, 0]],
    ];
    for (const [parent, children] of cases) {
      for (const strategy of ["proportional", "even"] as const) {
        const result = distributeRemainder(parent, children, strategy);
        expect(sum(result), `${parent} over ${children.join("/")} (${strategy})`).toBe(
          parent,
        );
        expect(result.every(Number.isInteger)).toBe(true);
      }
    }
  });

  it("is deterministic — the same split allocates the same way twice", () => {
    const first = distributeRemainder(-1000, [-333, -333, -334]);
    const second = distributeRemainder(-1000, [-333, -333, -334]);
    expect(first).toEqual(second);
  });

  it("has nothing to allocate with no children", () => {
    expect(distributeRemainder(-3497, [])).toEqual([]);
  });
});

describe("assignRemainderTo", () => {
  it("hands one child the whole gap", () => {
    expect(assignRemainderTo(-3497, [-1300, -1999], 1)).toEqual([-1300, -2197]);
    expect(assignRemainderTo(-3497, [-1300, -1999], 0)).toEqual([-1498, -1999]);
  });

  it("refuses an index that is not a child", () => {
    expect(() => assignRemainderTo(-3497, [-1300], 1)).toThrow(/no child/);
    expect(() => assignRemainderTo(-3497, [-1300], -1)).toThrow(/no child/);
  });
});
