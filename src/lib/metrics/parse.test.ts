import { describe, expect, it } from "vitest";
import { formatMetricNumber, parseMetricInput, parseNumeric } from "./parse";

describe("parseMetricInput", () => {
  it("empty is null", () => {
    expect(parseMetricInput("")).toEqual({ ok: true, value: null });
    expect(parseMetricInput("   ")).toEqual({ ok: true, value: null });
  });

  it("parses integers and decimals", () => {
    expect(parseMetricInput("80")).toEqual({ ok: true, value: 80 });
    expect(parseMetricInput("1.618")).toEqual({ ok: true, value: 1.618 });
    expect(parseMetricInput("86.5")).toEqual({ ok: true, value: 86.5 });
    expect(parseMetricInput("0.25")).toEqual({ ok: true, value: 0.25 });
  });

  it("accepts comma as decimal separator", () => {
    expect(parseMetricInput("1,618")).toEqual({ ok: true, value: 1.618 });
  });

  it("trailing dot becomes the integer part", () => {
    expect(parseMetricInput("1.")).toEqual({ ok: true, value: 1 });
  });

  it("rejects garbage", () => {
    expect(parseMetricInput("abc")).toEqual({ ok: false });
    expect(parseMetricInput(".")).toEqual({ ok: false });
    expect(parseMetricInput("-")).toEqual({ ok: false });
  });
});

describe("formatMetricNumber", () => {
  it("keeps short decimals without trailing zeros", () => {
    expect(formatMetricNumber(1.618)).toBe("1.618");
    expect(formatMetricNumber(86.5)).toBe("86.5");
    expect(formatMetricNumber(80)).toBe("80");
  });
});

describe("parseNumeric", () => {
  it("reads DB strings", () => {
    expect(parseNumeric("1.618000")).toBe(1.618);
    expect(parseNumeric(null)).toBeNull();
  });
});
