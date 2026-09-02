import { describe, expect, it } from "vitest";
import {
  collectColumnValues,
  collectDistinctValues,
  distinctValuesOf,
} from "./distinct";

type Row = { name: string; state: string | null; priority: string };

const columns = [
  { id: "name", filterValue: (r: Row) => r.name },
  { id: "state", filterValue: (r: Row) => r.state },
  { id: "priority", filterValue: (r: Row) => r.priority },
  // Columns without filterValue are invisible to the collector — the builder still
  // offers every defined column, but only filterable ones contribute values.
  { id: "notes" },
] as const;

const rows: Row[] = [
  { name: "Alpha", state: "not_started", priority: "A" },
  { name: "Beta", state: "not_started", priority: "B" },
  { name: "Gamma", state: null, priority: "A" },
  { name: "", state: "completed", priority: "A" },
];

describe("collectColumnValues", () => {
  it("counts each non-blank value and blanks separately", () => {
    const values = collectColumnValues(columns, rows);
    expect(values.name).toEqual({
      counts: new Map([
        ["Alpha", 1],
        ["Beta", 1],
        ["Gamma", 1],
      ]),
      blanks: 1,
    });
    expect(values.state).toEqual({
      counts: new Map([
        ["not_started", 2],
        ["completed", 1],
      ]),
      blanks: 1,
    });
    expect(values.priority.counts.get("A")).toBe(3);
    expect(values.priority.blanks).toBe(0);
  });

  it("skips columns that do not declare filterValue", () => {
    const values = collectColumnValues(columns, rows);
    expect(values.notes).toBeUndefined();
  });

  /**
   * Header set-filter, advanced builder enum list, and chip labels all share this walk.
   * Two walks that disagree about a value is how a filter option appears to do nothing.
   */
  it("agrees with collectDistinctValues on the same input", () => {
    const values = collectColumnValues(columns, rows);
    expect(collectDistinctValues(columns, rows)).toEqual(distinctValuesOf(values));
    expect(collectDistinctValues(columns, rows).priority.sort()).toEqual(["A", "B"]);
  });
});
