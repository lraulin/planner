import { describe, expect, it } from "vitest";
import { SETTINGS_VERSION } from "@/lib/settings/scopes";
import {
  clampPerformanceHeight,
  DEFAULT_METRICS_LAYOUT,
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
    expect(parseMetricsLayout(null)).toEqual(DEFAULT_METRICS_LAYOUT);
  });

  it("reads a stored height", () => {
    expect(parseMetricsLayout({ performanceHeight: 400 })).toEqual({
      ...DEFAULT_METRICS_LAYOUT,
      performanceHeight: 400,
    });
  });

  /**
   * The switches were added to this scope after `performanceHeight` shipped, so every blob
   * already in `user_settings` is missing all five. Falling back per key — rather than
   * rejecting the whole record — is what stops the upgrade resetting a resized pane.
   */
  it("fills in switches a blob written before them does not carry", () => {
    expect(parseMetricsLayout({ v: SETTINGS_VERSION, performanceHeight: 400 })).toEqual(
      {
        ...DEFAULT_METRICS_LAYOUT,
        performanceHeight: 400,
      },
    );
  });

  it("keeps a switch turned off, rather than treating false as absent", () => {
    const parsed = parseMetricsLayout({
      performanceHeight: 300,
      activeOnly: false,
      groupByOwner: true,
      showPerformance: false,
      showLegend: false,
      showObjective: false,
    });
    expect(parsed).toEqual({
      performanceHeight: 300,
      activeOnly: false,
      groupByOwner: true,
      showPerformance: false,
      showLegend: false,
      showObjective: false,
    });
  });

  it("ignores non-booleans rather than coercing them", () => {
    const parsed = parseMetricsLayout({ activeOnly: "no", groupByOwner: 1 });
    expect(parsed.activeOnly).toBe(DEFAULT_METRICS_LAYOUT.activeOnly);
    expect(parsed.groupByOwner).toBe(DEFAULT_METRICS_LAYOUT.groupByOwner);
  });
});

describe("serializeMetricsLayout", () => {
  it("includes version and clamped height", () => {
    const out = serializeMetricsLayout({
      ...DEFAULT_METRICS_LAYOUT,
      performanceHeight: 50,
    }) as { v: number; performanceHeight: number };
    // The constant, not a literal: `v` is the shared settings version and moves when a
    // payload shape changes elsewhere.
    expect(out.v).toBe(SETTINGS_VERSION);
    expect(out.performanceHeight).toBe(MIN_PERFORMANCE_HEIGHT);
  });

  it("round-trips every switch", () => {
    const settings = {
      performanceHeight: 320,
      activeOnly: false,
      groupByOwner: true,
      showPerformance: false,
      showLegend: true,
      showObjective: false,
    };
    expect(parseMetricsLayout(serializeMetricsLayout(settings))).toEqual(settings);
  });
});
