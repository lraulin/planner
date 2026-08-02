import { describe, expect, it } from "vitest";
import {
  chartPoints,
  displayValue,
  latestEntry,
  normalizeMetricType,
  seriesPolyline,
  shouldShowEntryTargetColumn,
  sortEntriesByDate,
  yDomain,
} from "./derive";

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

  it("emits one point for a single value", () => {
    const s = seriesPolyline([50], 100, 50, 10, 0, 100);
    expect(s.split(" ")).toHaveLength(1);
    expect(s.startsWith("50.00,")).toBe(true);
  });
});
