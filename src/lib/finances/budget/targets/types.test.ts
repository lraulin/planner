import { describe, expect, it } from "vitest";

import {
  assertCents,
  isLegalPairing,
  parseNullableTargetOrThrow,
  parseTarget,
  parseTargetOrThrow,
  summarize,
  type Target,
} from "./types";

/** D2's table, one row per legal sentence. Nothing outside it may parse. */
const LEGAL: Array<[string, Target]> = [
  [
    "Add $X every month",
    { behavior: "add", cadence: { unit: "month", day: 31 }, amountCents: 5000 },
  ],
  [
    "Add $X each Sunday",
    { behavior: "add", cadence: { unit: "week", weekday: 0 }, amountCents: 5000 },
  ],
  [
    "Have $X available each month",
    { behavior: "upTo", cadence: { unit: "month", day: 15 }, amountCents: 5000 },
  ],
  [
    "Have $X available each Sunday",
    { behavior: "upTo", cadence: { unit: "week", weekday: 0 }, amountCents: 21_096 },
  ],
  [
    "Have $X available each year",
    { behavior: "upTo", cadence: { unit: "year", month: 10 }, amountCents: 40_000 },
  ],
  [
    "Have $X available by October 2026",
    {
      behavior: "balance",
      cadence: { unit: "by", month: "2026-10" },
      amountCents: 100_000,
    },
  ],
  [
    "Have $X available (no deadline)",
    { behavior: "balance", cadence: { unit: "none" }, amountCents: 10_000_000 },
  ],
];

describe("parseTarget", () => {
  it.each(LEGAL)("round-trips %s", (_sentence, target) => {
    expect(parseTarget(target)).toEqual(target);
  });

  it("round-trips the derived schedule target only when schedule is allowed", () => {
    const derived: Target = {
      behavior: "upTo",
      cadence: { unit: "schedule" },
      amountCents: 12_345,
    };
    expect(parseTarget(derived, true)).toEqual(derived);
    expect(parseTarget(derived)).toBeNull();
  });

  it("rejects every pairing outside the table", () => {
    expect(
      parseTarget({
        behavior: "balance",
        cadence: { unit: "week", weekday: 0 },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({
        behavior: "balance",
        cadence: { unit: "month", day: 1 },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({
        behavior: "balance",
        cadence: { unit: "year", month: 3 },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({
        behavior: "add",
        cadence: { unit: "year", month: 3 },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({
        behavior: "add",
        cadence: { unit: "by", month: "2026-10" },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({ behavior: "add", cadence: { unit: "none" }, amountCents: 100 }),
    ).toBeNull();
    expect(
      parseTarget({
        behavior: "upTo",
        cadence: { unit: "by", month: "2026-10" },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({ behavior: "upTo", cadence: { unit: "none" }, amountCents: 100 }),
    ).toBeNull();
    expect(
      parseTarget(
        { behavior: "add", cadence: { unit: "schedule" }, amountCents: 100 },
        true,
      ),
    ).toBeNull();
  });

  it("rejects an unknown behavior or cadence unit", () => {
    expect(
      parseTarget({
        behavior: "refill",
        cadence: { unit: "month", day: 1 },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({
        behavior: "add",
        cadence: { unit: "fortnight" },
        amountCents: 100,
      }),
    ).toBeNull();
    expect(
      parseTarget({ behavior: "add", cadence: "month", amountCents: 100 }),
    ).toBeNull();
  });

  it("rejects an amount that is not positive integer cents", () => {
    const base = { behavior: "add", cadence: { unit: "month", day: 1 } };
    expect(parseTarget({ ...base, amountCents: 100.5 })).toBeNull();
    expect(parseTarget({ ...base, amountCents: 0 })).toBeNull();
    expect(parseTarget({ ...base, amountCents: -100 })).toBeNull();
    expect(parseTarget({ ...base, amountCents: "100" })).toBeNull();
    expect(parseTarget(base)).toBeNull();
  });

  it("rejects a weekday outside 0–6 and a fractional one", () => {
    const of = (weekday: unknown) =>
      parseTarget({
        behavior: "upTo",
        cadence: { unit: "week", weekday },
        amountCents: 100,
      });
    expect(of(0)).not.toBeNull();
    expect(of(6)).not.toBeNull();
    expect(of(7)).toBeNull();
    expect(of(-1)).toBeNull();
    expect(of(1.5)).toBeNull();
    expect(of("0")).toBeNull();
  });

  it("rejects a month day outside 1–31", () => {
    const of = (day: unknown) =>
      parseTarget({
        behavior: "upTo",
        cadence: { unit: "month", day },
        amountCents: 100,
      });
    expect(of(1)).not.toBeNull();
    expect(of(31)).not.toBeNull();
    expect(of(0)).toBeNull();
    expect(of(32)).toBeNull();
  });

  it("rejects a year month outside 1–12", () => {
    const of = (month: unknown) =>
      parseTarget({
        behavior: "upTo",
        cadence: { unit: "year", month },
        amountCents: 100,
      });
    expect(of(1)).not.toBeNull();
    expect(of(12)).not.toBeNull();
    expect(of(0)).toBeNull();
    expect(of(13)).toBeNull();
  });

  it("rejects a `by` month that is not YYYY-MM", () => {
    const of = (month: unknown) =>
      parseTarget({
        behavior: "balance",
        cadence: { unit: "by", month },
        amountCents: 100,
      });
    expect(of("2026-10")).not.toBeNull();
    expect(of("2026-13")).toBeNull();
    expect(of("2026-00")).toBeNull();
    expect(of("2026-10-01")).toBeNull();
    expect(of("Oct 2026")).toBeNull();
  });

  it("rejects garbage rather than passing it to the math", () => {
    expect(parseTarget(null)).toBeNull();
    expect(parseTarget("nope")).toBeNull();
    expect(parseTarget([LEGAL[0][1]])).toBeNull();
  });
});

describe("isLegalPairing", () => {
  it("agrees with the parser about what the evaluator will see", () => {
    expect(isLegalPairing("upTo", "week")).toBe(true);
    expect(isLegalPairing("balance", "week")).toBe(false);
  });
});

describe("parseTargetOrThrow", () => {
  it("throws on write of an invalid target", () => {
    expect(() => parseTargetOrThrow({ behavior: "add" })).toThrow(
      "That target is not valid.",
    );
  });

  it("passes null and undefined through the nullable form", () => {
    expect(parseNullableTargetOrThrow(null)).toBeNull();
    expect(parseNullableTargetOrThrow(undefined)).toBeNull();
    expect(parseNullableTargetOrThrow(LEGAL[0][1])).toEqual(LEGAL[0][1]);
  });
});

describe("assertCents", () => {
  it("throws on a non-integer", () => {
    expect(() => assertCents(1.5, "amount")).toThrow(
      "amount must be integer cents, got 1.5",
    );
  });
});

describe("summarize", () => {
  it("says each legal shape as one sentence, in our words and not YNAB's", () => {
    expect(summarize(LEGAL[0][1])).toBe("Add $50.00 every month");
    expect(summarize(LEGAL[1][1])).toBe("Add $50.00 each Sunday");
    expect(summarize(LEGAL[2][1])).toBe("Have $50.00 available each month");
    expect(summarize(LEGAL[3][1])).toBe("Have $210.96 available each Sunday");
    expect(summarize(LEGAL[4][1])).toBe("Have $400.00 available each year by October");
    expect(summarize(LEGAL[5][1])).toBe("Have $1,000.00 available by October 2026");
    expect(summarize(LEGAL[6][1])).toBe("Have $100,000.00 available (no deadline)");
    expect(
      summarize({
        behavior: "upTo",
        cadence: { unit: "schedule" },
        amountCents: 12_345,
      }),
    ).toBe("Have $123.45 available for each charge");
  });

  it("uses neither the word refill nor set aside", () => {
    const all = LEGAL.map(([, target]) => summarize(target))
      .join(" ")
      .toLowerCase();
    expect(all).not.toContain("refill");
    expect(all).not.toContain("set aside");
  });
});
