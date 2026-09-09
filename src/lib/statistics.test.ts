import { describe, expect, it } from "vitest";
import { median, medianRounded } from "./statistics";

describe("median", () => {
  it("takes the middle of an odd-length set regardless of input order", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([3, 1, 5])).toBe(3);
  });

  it("sorts numerically, not as strings", () => {
    // The plausible mistake: a bare `.sort()` puts 100 before 9 and answers 100.
    expect(median([9, 100, 11])).toBe(11);
  });

  it("averages the two middle values of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("answers a half when the two middle integers straddle one", () => {
    // What `isBiweekly` reads: 14 and 15 day gaps are a 14.5-day cadence, not 15.
    expect(median([14, 15])).toBe(14.5);
  });

  it("treats an empty set as zero rather than NaN", () => {
    expect(median([])).toBe(0);
  });

  it("does not reorder the caller's array", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it("handles negatives, which cents can be", () => {
    expect(median([-500, -100, -300])).toBe(-300);
    expect(median([-500, -100])).toBe(-300);
  });
});

describe("medianRounded", () => {
  it("rounds an even-length half away from zero on the positive side", () => {
    expect(medianRounded([14, 15])).toBe(15);
  });

  it("rounds half toward zero on the negative side, as Math.round does", () => {
    expect(medianRounded([-15, -14])).toBe(-14);
  });

  it("leaves a whole median alone", () => {
    expect(medianRounded([1000, 2000, 3000])).toBe(2000);
    expect(medianRounded([])).toBe(0);
  });
});
