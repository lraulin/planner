import { describe, expect, it } from "vitest";
import { SETTINGS_VERSION } from "@/lib/settings/scopes";
import {
  clampPerformanceHeight,
  DEFAULT_PERFORMANCE_HEIGHT,
  MAX_PERFORMANCE_HEIGHT,
  MIN_PERFORMANCE_HEIGHT,
  parseMetricsLayout,
  serializeMetricsLayout,
} from "./layout";

describe("clampPerformanceHeight", () => {
  it("clamps to min/max", () => {
    expect(clampPerformanceHeight(10)).toBe(MIN_PERFORMANCE_HEIGHT);
    expect(clampPerformanceHeight(9999)).toBe(MAX_PERFORMANCE_HEIGHT);
    expect(clampPerformanceHeight(300)).toBe(300);
  });

  it("falls back on non-finite input", () => {
    expect(clampPerformanceHeight(Number.NaN)).toBe(DEFAULT_PERFORMANCE_HEIGHT);
  });
});

describe("parseMetricsLayout", () => {
  it("defaults when missing", () => {
    expect(parseMetricsLayout(null)).toEqual({
      performanceHeight: DEFAULT_PERFORMANCE_HEIGHT,
    });
  });

  it("reads a stored height", () => {
    expect(parseMetricsLayout({ performanceHeight: 400 })).toEqual({
      performanceHeight: 400,
    });
  });
});

describe("serializeMetricsLayout", () => {
  it("includes version and clamped height", () => {
    const out = serializeMetricsLayout({ performanceHeight: 50 }) as {
      v: number;
      performanceHeight: number;
    };
    // The constant, not a literal: `v` is the shared settings version and moves when a
    // payload shape changes elsewhere.
    expect(out.v).toBe(SETTINGS_VERSION);
    expect(out.performanceHeight).toBe(MIN_PERFORMANCE_HEIGHT);
  });
});
