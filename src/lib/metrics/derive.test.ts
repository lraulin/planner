import { describe, expect, it } from "vitest";
import { chartPoints, latestEntry, seriesPolyline, yDomain } from "./derive";

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

describe("chartPoints", () => {
  it("sorts chronologically and falls back to objective target", () => {
    const pts = chartPoints(
      [
        { entryDate: "2025-02-01", value: 90, target: null },
        { entryDate: "2025-01-01", value: 95, target: 80 },
      ],
      80,
    );
    expect(pts.map((p) => p.date)).toEqual(["2025-01-01", "2025-02-01"]);
    expect(pts[0].target).toBe(80);
    expect(pts[1].target).toBe(80);
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
