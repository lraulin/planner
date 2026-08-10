import { describe, expect, it } from "vitest";
import {
  applyFrozenEntryOrder,
  chartPoints,
  dateKeyOrdinal,
  dateXFraction,
  displayValue,
  latestEntry,
  niceTicks,
  niceTimeTicks,
  normalizeMetricType,
  plotPoint,
  seriesPolyline,
  shouldShowEntryTargetColumn,
  sortEntriesByDate,
  yDomain,
} from "./derive";

describe("applyFrozenEntryOrder", () => {
  const rows = [
    { id: "a", entryDate: "2025-01-01" },
    { id: "b", entryDate: "2025-02-01" },
    { id: "c", entryDate: "2025-03-01" },
  ];

  it("returns a copy when no freeze is active", () => {
    expect(applyFrozenEntryOrder(rows, null).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps frozen positions even if the source order changed", () => {
    // After a date edit, sorted data is c,a,b but freeze holds a,b,c.
    const resorted = [rows[2], rows[0], rows[1]];
    expect(applyFrozenEntryOrder(resorted, ["a", "b", "c"]).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("appends ids that are not in the freeze list", () => {
    const withNew = [...rows, { id: "d", entryDate: "2025-04-01" }];
    expect(applyFrozenEntryOrder(withNew, ["c", "a"]).map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });
});

describe("sortEntriesByDate", () => {
  const rows = [
    { id: "a", entryDate: "2025-01-01" },
    { id: "c", entryDate: "2025-03-01" },
    { id: "b", entryDate: "2025-02-01" },
  ];

  it("defaults to newest first", () => {
    expect(sortEntriesByDate(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts oldest first when ascending", () => {
    expect(sortEntriesByDate(rows, "asc").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    const copy = [...rows];
    sortEntriesByDate(rows, "asc");
    expect(rows).toEqual(copy);
  });

  it("breaks same-day ties by id in the same direction", () => {
    const sameDay = [
      { id: "z", entryDate: "2025-06-01" },
      { id: "a", entryDate: "2025-06-01" },
    ];
    expect(sortEntriesByDate(sameDay, "asc").map((r) => r.id)).toEqual(["a", "z"]);
    expect(sortEntriesByDate(sameDay, "desc").map((r) => r.id)).toEqual(["z", "a"]);
  });
});

describe("shouldShowEntryTargetColumn", () => {
  it("hides when no objective and no entry targets", () => {
    expect(shouldShowEntryTargetColumn(null, [{ target: null }])).toBe(false);
    expect(shouldShowEntryTargetColumn(null, [])).toBe(false);
  });

  it("shows when metric has an objective target", () => {
    expect(shouldShowEntryTargetColumn(80, [])).toBe(true);
  });

  it("shows when any entry has a target (import history)", () => {
    expect(shouldShowEntryTargetColumn(null, [{ target: null }, { target: 50 }])).toBe(
      true,
    );
  });

  it("shows while the user is typing an objective in the draft", () => {
    expect(shouldShowEntryTargetColumn(null, [], "1.6")).toBe(true);
    expect(shouldShowEntryTargetColumn(null, [], "   ")).toBe(false);
  });
});

describe("latestEntry", () => {
  it("returns null for empty", () => {
    expect(latestEntry([])).toBeNull();
  });

  it("picks the latest date, then higher id on a tie", () => {
    const result = latestEntry([
      { id: "a", entryDate: "2024-01-01", value: 10 },
      { id: "b", entryDate: "2025-06-01", value: 20 },
      { id: "c", entryDate: "2025-06-01", value: 21 },
    ]);
    expect(result).toEqual({ entryDate: "2025-06-01", value: 21 });
  });
});

describe("normalizeMetricType", () => {
  it("accepts the three codes case-insensitively", () => {
    expect(normalizeMetricType("instance")).toBe("instance");
    expect(normalizeMetricType("Cumulative")).toBe("cumulative");
    expect(normalizeMetricType("TOTAL")).toBe("total");
  });

  it("defaults unknown and empty to total", () => {
    expect(normalizeMetricType(null)).toBe("total");
    expect(normalizeMetricType("")).toBe("total");
    expect(normalizeMetricType("bogus")).toBe("total");
  });
});

describe("displayValue", () => {
  const series = [
    { id: "a", entryDate: "2025-01-01", value: 10 },
    { id: "b", entryDate: "2025-02-01", value: 20 },
    { id: "c", entryDate: "2025-03-01", value: 5 },
  ];

  it("returns null for empty", () => {
    expect(displayValue([], "cumulative")).toBeNull();
  });

  it("instance and total use latest entry only", () => {
    expect(displayValue(series, "instance")).toEqual({
      entryDate: "2025-03-01",
      value: 5,
    });
    expect(displayValue(series, "total")).toEqual({
      entryDate: "2025-03-01",
      value: 5,
    });
  });

  it("cumulative sums all values; date is still the latest entry", () => {
    // 10+20+5 = 35 — tripwire if someone uses latest only for cumulative.
    expect(displayValue(series, "cumulative")).toEqual({
      entryDate: "2025-03-01",
      value: 35,
    });
  });
});

describe("chartPoints", () => {
  it("sorts chronologically and falls back to objective target", () => {
    const pts = chartPoints(
      [
        { entryDate: "2025-02-01", value: 90, target: null },
        { entryDate: "2025-01-01", value: 95, target: 80 },
      ],
      80,
      "total",
    );
    expect(pts.map((p) => p.date)).toEqual(["2025-01-01", "2025-02-01"]);
    expect(pts[0].value).toBe(95);
    expect(pts[1].value).toBe(90);
    expect(pts[0].target).toBe(80);
    expect(pts[1].target).toBe(80);
  });

  it("cumulative charts a running sum", () => {
    const pts = chartPoints(
      [
        { entryDate: "2025-01-01", value: 10, target: null },
        { entryDate: "2025-02-01", value: 20, target: null },
        { entryDate: "2025-03-01", value: 5, target: null },
      ],
      100,
      "cumulative",
    );
    expect(pts.map((p) => p.value)).toEqual([10, 30, 35]);
  });

  it("instance does not sum", () => {
    const pts = chartPoints(
      [
        { entryDate: "2025-01-01", value: 10, target: null },
        { entryDate: "2025-02-01", value: 20, target: null },
      ],
      null,
      "instance",
    );
    expect(pts.map((p) => p.value)).toEqual([10, 20]);
  });
});

describe("yDomain", () => {
  it("pads a flat series", () => {
    const d = yDomain([10, 10]);
    expect(d.min).toBeLessThan(10);
    expect(d.max).toBeGreaterThan(10);
  });

  it("includes an objective target", () => {
    const d = yDomain([90, 95], 80);
    expect(d.min).toBeLessThan(80);
    expect(d.max).toBeGreaterThan(95);
  });
});

describe("seriesPolyline", () => {
  it("returns empty for no values", () => {
    expect(seriesPolyline([], 100, 50, 5, 0, 1)).toBe("");
  });

  it("emits one point for a single value at horizontal centre", () => {
    const s = seriesPolyline([{ date: "2025-01-01", value: 50 }], 100, 50, 10, 0, 100);
    expect(s.split(" ")).toHaveLength(1);
    expect(s.startsWith("50.00,")).toBe(true);
  });

  it("spaces points by calendar day, not by sample index", () => {
    // Day 0, day 1, day 10 — gap 0→1 is 1/10 of gap 0→10, not equal index spacing.
    const s = seriesPolyline(
      [
        { date: "2025-01-01", value: 0 },
        { date: "2025-01-02", value: 0 },
        { date: "2025-01-11", value: 0 },
      ],
      110,
      50,
      5,
      0,
      1,
    );
    const xs = s.split(" ").map((pair) => Number(pair.split(",")[0]));
    expect(xs[0]).toBeCloseTo(5, 5);
    expect(xs[2]).toBeCloseTo(105, 5);
    // 1 day of a 10-day span → 10% of the 100px inner width from the left pad.
    expect(xs[1] - xs[0]).toBeCloseTo(10, 5);
    expect(xs[2] - xs[0]).toBeCloseTo(100, 5);
  });
});

describe("niceTicks", () => {
  it("returns regular steps covering the range", () => {
    const ticks = niceTicks(0, 100, 5);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(100);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    // Even steps
    const step = ticks[1] - ticks[0];
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step, 8);
    }
  });

  it("handles a flat domain", () => {
    const ticks = niceTicks(50, 50, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    expect(ticks[0]).toBeLessThan(50);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(50);
  });
});

describe("dateXFraction / time axis", () => {
  it("gives equal day width across a range", () => {
    expect(dateXFraction("2025-01-01", "2025-01-01", "2025-01-11")).toBeCloseTo(0, 8);
    expect(dateXFraction("2025-01-06", "2025-01-01", "2025-01-11")).toBeCloseTo(0.5, 8);
    expect(dateXFraction("2025-01-11", "2025-01-01", "2025-01-11")).toBeCloseTo(1, 8);
  });

  it("centres a single-day range", () => {
    expect(dateXFraction("2025-06-01", "2025-06-01", "2025-06-01")).toBe(0.5);
  });

  it("round-trips ordinals for consecutive days", () => {
    expect(dateKeyOrdinal("2025-01-02") - dateKeyOrdinal("2025-01-01")).toBe(1);
  });

  it("uses daily ticks for a short range", () => {
    const ticks = niceTimeTicks("2025-01-01", "2025-01-07", 12);
    expect(ticks.map((t) => t.dateKey)).toEqual([
      "2025-01-01",
      "2025-01-02",
      "2025-01-03",
      "2025-01-04",
      "2025-01-05",
      "2025-01-06",
      "2025-01-07",
    ]);
  });

  it("uses month starts for ~1 year, with years prominent", () => {
    // Matches a Dante-like span: late Sep 2024 → late Oct 2025.
    const ticks = niceTimeTicks("2024-09-21", "2025-10-29", 12);
    expect(ticks.length).toBeGreaterThanOrEqual(10);
    expect(ticks.length).toBeLessThanOrEqual(14);
    // Calendar-aligned (not sample dates like 9/21 or 10/29).
    for (const t of ticks) {
      expect(t.dateKey.endsWith("-01")).toBe(true);
      expect(t.dateKey >= "2024-09-21" || t.dateKey.endsWith("-01")).toBe(true);
      expect(t.dateKey <= "2025-10-29").toBe(true);
    }
    const jan = ticks.find((t) => t.dateKey === "2025-01-01");
    expect(jan?.major).toBe(true);
    expect(jan?.label).toBe("2025");
    // Regular month labels, not erratic sample days.
    expect(ticks.some((t) => t.label === "Feb" || t.label.startsWith("Feb"))).toBe(
      true,
    );
  });

  it("uses year ticks for a multi-year range", () => {
    const ticks = niceTimeTicks("2016-03-15", "2026-08-01", 12);
    expect(ticks.every((t) => t.dateKey.endsWith("-01-01"))).toBe(true);
    expect(ticks.every((t) => t.major)).toBe(true);
    expect(ticks.map((t) => t.label)).toEqual(
      expect.arrayContaining(["2017", "2020", "2025"]),
    );
    // Even year spacing
    const years = ticks.map((t) => Number(t.label));
    if (years.length >= 3) {
      const step = years[1] - years[0];
      for (let i = 1; i < years.length; i++) {
        expect(years[i] - years[i - 1]).toBe(step);
      }
    }
  });

  it("does not place labels on arbitrary sample midpoints", () => {
    const ticks = niceTimeTicks("2024-09-21", "2025-10-29", 12);
    const labels = ticks.map((t) => t.label);
    // Old index-based axis produced dates like 1/28/25, 5/7/25, 7/11/25.
    expect(labels.join(" ")).not.toMatch(/\d+\/\d+\/\d+/);
  });
});

describe("plotPoint", () => {
  const pad = { left: 10, right: 10, top: 10, bottom: 10 };

  it("places xFraction 0.5 in the horizontal centre", () => {
    const p = plotPoint(0.5, 50, 100, 100, pad, 0, 100);
    expect(p.x).toBe(50);
    expect(p.y).toBe(50);
  });

  it("maps xFraction 0 and 1 to the plot edges", () => {
    expect(plotPoint(0, 0, 100, 100, pad, 0, 100).x).toBe(10);
    expect(plotPoint(1, 0, 100, 100, pad, 0, 100).x).toBe(90);
  });
});
