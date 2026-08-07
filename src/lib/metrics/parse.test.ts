import { describe, expect, it } from "vitest";
import { formatMetricNumber, isDateKey, parseMetricInput, parseNumeric } from "./parse";

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

describe("isDateKey", () => {
  it("accepts a real calendar day", () => {
    expect(isDateKey("2026-06-30")).toBe(true);
    expect(isDateKey("2024-02-29")).toBe(true);
    expect(isDateKey("2026-12-31")).toBe(true);
  });

  it("rejects anything that is not the YYYY-MM-DD shape", () => {
    for (const bad of [
      "",
      "2026-6-30",
      "30/06/2026",
      "2026-06-30T00:00:00Z",
      "today",
    ]) {
      expect(isDateKey(bad)).toBe(false);
    }
  });

  /**
   * The shape is not the question — the column is a Postgres `date`, which refuses these
   * outright. Left to the driver, that refusal reached the agent API as
   * `{"code":"internal","message":"Internal error"}` and told the caller nothing about
   * which field was wrong.
   */
  it("rejects a day the month does not have", () => {
    for (const bad of ["2026-06-31", "2026-02-30", "2026-04-31", "2025-02-29"]) {
      expect(isDateKey(bad)).toBe(false);
    }
  });

  it("rejects a month or day of zero, which the shape allows", () => {
    expect(isDateKey("2026-00-10")).toBe(false);
    expect(isDateKey("2026-13-10")).toBe(false);
    expect(isDateKey("2026-06-00")).toBe(false);
  });
});
