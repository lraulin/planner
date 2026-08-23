import { describe, expect, it } from "vitest";
import {
  amountMatches,
  approxThreshold,
  extractScheduleConds,
  getScheduledAmount,
  parseConditions,
  payeeValues,
} from "./conditions";

describe("approxThreshold", () => {
  it("is 7.5 percent of the absolute amount, rounded", () => {
    // Actual's getApproxNumberThreshold. A $50 bill (±$3.75) and a $10 coffee (±$0.75).
    expect(approxThreshold(-5000)).toBe(375);
    expect(approxThreshold(5000)).toBe(375);
    expect(approxThreshold(1000)).toBe(75);
  });
});

describe("parseConditions", () => {
  it("accepts the four schedule fields in Actual's shape", () => {
    const parsed = parseConditions([
      { field: "payee", op: "oneOf", value: ["NETFLIX", "NETFLIX.COM"] },
      { field: "account", op: "is", value: "acct-1" },
      { field: "amount", op: "isapprox", value: -1599 },
      {
        field: "date",
        op: "is",
        value: { frequency: "monthly", start: "2026-01-15", interval: 1 },
      },
    ]);
    expect(parsed).not.toBeNull();
    expect(extractScheduleConds(parsed ?? []).payee?.op).toBe("oneOf");
  });

  it("rejects a blob that is not a usable condition list", () => {
    expect(parseConditions(null)).toBeNull();
    expect(parseConditions({ field: "payee" })).toBeNull();
    expect(
      parseConditions([{ field: "payee", op: "contains", value: "x" }]),
    ).toBeNull();
    expect(parseConditions([{ field: "amount", op: "is", value: 12.5 }])).toBeNull();
    expect(
      parseConditions([{ field: "date", op: "is", value: { frequency: "monthly" } }]),
    ).toBeNull();
  });
});

describe("amountMatches", () => {
  it("uses the threshold for isapprox and the closed interval for isbetween", () => {
    expect(amountMatches({ field: "amount", op: "is", value: -5000 }, -5000)).toBe(
      true,
    );
    expect(
      amountMatches({ field: "amount", op: "isapprox", value: -5000 }, -5300),
    ).toBe(true);
    expect(
      amountMatches({ field: "amount", op: "isapprox", value: -5000 }, -5400),
    ).toBe(false);
    expect(
      amountMatches(
        { field: "amount", op: "isbetween", value: { num1: -6000, num2: -4000 } },
        -5000,
      ),
    ).toBe(true);
  });
});

describe("getScheduledAmount", () => {
  it("returns zero with no condition and the midpoint of a range", () => {
    expect(getScheduledAmount(null)).toBe(0);
    expect(
      getScheduledAmount({
        field: "amount",
        op: "isbetween",
        value: { num1: -10, num2: -20 },
      }),
    ).toBe(-15);
  });
});

describe("payeeValues", () => {
  it("unwraps is and oneOf to a list of matcher strings", () => {
    expect(payeeValues({ field: "payee", op: "is", value: "NETFLIX" })).toEqual([
      "NETFLIX",
    ]);
    expect(
      payeeValues({ field: "payee", op: "oneOf", value: ["NETFLIX", "NETFLIX.COM"] }),
    ).toEqual(["NETFLIX", "NETFLIX.COM"]);
  });
});
