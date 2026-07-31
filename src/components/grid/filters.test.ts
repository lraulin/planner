import { describe, expect, it } from "vitest";
import {
  ALL_FILTER,
  filterActive,
  filterOptions,
  matchesFilter,
  rowPassesFilters,
  shiftDays,
  type ColumnFilter,
} from "./filters";

const TODAY = "2026-07-28";

describe("matchesFilter — universal", () => {
  it("lets everything through under (All)", () => {
    expect(matchesFilter(null, ALL_FILTER, "text", TODAY)).toBe(true);
    expect(matchesFilter("A1", ALL_FILTER, "priority", TODAY)).toBe(true);
  });

  it("handles blanks and non-blanks", () => {
    expect(matchesFilter(null, ["blanks"], "text", TODAY)).toBe(true);
    expect(matchesFilter("", ["blanks"], "text", TODAY)).toBe(true);
    expect(matchesFilter("x", ["blanks"], "text", TODAY)).toBe(false);

    expect(matchesFilter("x", ["nonblanks"], "text", TODAY)).toBe(true);
    expect(matchesFilter(null, ["nonblanks"], "text", TODAY)).toBe(false);
  });

  it("matches a distinct value option", () => {
    expect(matchesFilter("NS", ["value:NS"], "enum", TODAY)).toBe(true);
    expect(matchesFilter("IP", ["value:NS"], "enum", TODAY)).toBe(false);
  });
});

describe("matchesFilter — priority presets", () => {
  const p = (id: string, value: string | null) =>
    matchesFilter(value, [id], "priority", TODAY);

  it("isolates A1, ranked As, and bare As", () => {
    expect(p("only-a1", "A1")).toBe(true);
    expect(p("only-a1", "A2")).toBe(false);
    expect(p("only-a1", "A")).toBe(false);

    expect(p("only-ranked-as", "A1")).toBe(true);
    expect(p("only-ranked-as", "A")).toBe(false);
    expect(p("only-ranked-as", "B1")).toBe(false);

    expect(p("only-unranked-as", "A")).toBe(true);
    expect(p("only-unranked-as", "A1")).toBe(false);

    expect(p("only-as", "A")).toBe(true);
    expect(p("only-as", "A3")).toBe(true);
    expect(p("only-as", "B")).toBe(false);
  });

  it("covers letter bands and ranked/unranked", () => {
    expect(p("only-as-bs", "B2")).toBe(true);
    expect(p("only-as-bs", "C")).toBe(false);
    expect(p("only-as-bs-cs", "C1")).toBe(true);
    expect(p("only-as-bs-cs", "D")).toBe(false);

    expect(p("ranked", "B2")).toBe(true);
    expect(p("ranked", "B")).toBe(false);
    expect(p("unranked", "B")).toBe(true);
    expect(p("unranked", "B2")).toBe(false);
    expect(p("unranked", null)).toBe(false);

    expect(p("prioritized", "D")).toBe(true);
    expect(p("unprioritized", null)).toBe(true);
    expect(p("unprioritized", "")).toBe(true);
    expect(p("unprioritized", "A")).toBe(false);
  });
});

describe("matchesFilter — deadline presets", () => {
  const d = (id: string, value: string | null) =>
    matchesFilter(value, [id], "date", TODAY);

  it("handles none / has-date / past bands", () => {
    expect(d("none", null)).toBe(true);
    expect(d("none", "2026-01-01")).toBe(false);
    expect(d("has-date", "2026-01-01")).toBe(true);

    expect(d("past", "2026-07-27")).toBe(true);
    expect(d("past", TODAY)).toBe(false);
    expect(d("past-and-none", null)).toBe(true);
    expect(d("past-and-none", "2026-07-27")).toBe(true);
    expect(d("past-and-none", "2026-07-29")).toBe(false);
  });

  it("handles today / tomorrow / ranges", () => {
    expect(d("today", TODAY)).toBe(true);
    expect(d("tomorrow", "2026-07-29")).toBe(true);
    expect(d("yesterday", "2026-07-27")).toBe(true);

    expect(d("next-7-days", "2026-08-01")).toBe(true);
    expect(d("next-7-days", "2026-08-05")).toBe(false);
    expect(d("next-7-days", TODAY)).toBe(false);

    expect(d("last-7-days", "2026-07-25")).toBe(true);
    expect(d("last-7-days", TODAY)).toBe(false);

    expect(d("today-and-future", TODAY)).toBe(true);
    expect(d("today-and-future", "2026-07-20")).toBe(false);
    expect(d("today-future-and-none", null)).toBe(true);
  });

  it("does not hide date-filtered rows before hydration", () => {
    expect(matchesFilter("2020-01-01", ["past"], "date", null)).toBe(true);
  });
});

describe("multi-select selections", () => {
  it("passes a row matching any selected option", () => {
    // The point of multi-select: "A1 or B1", which one choice per column cannot express.
    expect(matchesFilter("A1", ["only-a1", "value:B1"], "priority", TODAY)).toBe(true);
    expect(matchesFilter("B1", ["only-a1", "value:B1"], "priority", TODAY)).toBe(true);
    expect(matchesFilter("C1", ["only-a1", "value:B1"], "priority", TODAY)).toBe(false);
  });

  it("mixes a preset with literal values", () => {
    expect(matchesFilter("A3", ["only-as", "value:D"], "priority", TODAY)).toBe(true);
    expect(matchesFilter("D", ["only-as", "value:D"], "priority", TODAY)).toBe(true);
    expect(matchesFilter("B", ["only-as", "value:D"], "priority", TODAY)).toBe(false);
  });

  it("treats an empty selection and (All) as the same unfiltered state", () => {
    // Otherwise an empty grid could sit behind a filter button that looks inactive.
    expect(filterActive(ALL_FILTER)).toBe(false);
    expect(filterActive([])).toBe(false);
    expect(filterActive(["all"])).toBe(false);
    expect(filterActive(["only-as"])).toBe(true);

    expect(matchesFilter("B", [], "priority", TODAY)).toBe(true);
    expect(matchesFilter("B", ["all"], "priority", TODAY)).toBe(true);
  });

  it("stays unfiltered when (All) rides along with a real option", () => {
    expect(matchesFilter("B", ["all", "only-as"], "priority", TODAY)).toBe(true);
  });

  it("combines blanks with a value, which one choice per column could not", () => {
    expect(matchesFilter(null, ["blanks", "value:A1"], "priority", TODAY)).toBe(true);
    expect(matchesFilter("A1", ["blanks", "value:A1"], "priority", TODAY)).toBe(true);
    expect(matchesFilter("B2", ["blanks", "value:A1"], "priority", TODAY)).toBe(false);
  });
});

describe("filterOptions", () => {
  it("stacks universal, presets, and distinct values", () => {
    const options = filterOptions("priority", ["A1", "B", ""]);
    const ids = options.map((o) => o.id);
    expect(ids[0]).toBe("all");
    expect(ids).toContain("only-a1");
    expect(ids).toContain("value:A1");
    expect(ids).toContain("value:B");
    expect(ids).not.toContain("value:");
  });
});

describe("rowPassesFilters", () => {
  it("ignores columns with nothing selected", () => {
    expect(rowPassesFilters({ priority: "D" }, { priority: [] }, {}, TODAY)).toBe(true);
  });

  it("requires every active column filter to pass", () => {
    const filters: Record<string, ColumnFilter> = {
      priority: ["only-as"],
      deadline: ["today"],
    };
    const kinds = { priority: "priority" as const, deadline: "date" as const };

    expect(
      rowPassesFilters({ priority: "A1", deadline: TODAY }, filters, kinds, TODAY),
    ).toBe(true);

    expect(
      rowPassesFilters({ priority: "B", deadline: TODAY }, filters, kinds, TODAY),
    ).toBe(false);
  });
});

describe("shiftDays", () => {
  it("moves whole calendar days without landing mid-day", () => {
    expect(shiftDays("2026-07-28", 1)).toBe("2026-07-29");
    expect(shiftDays("2026-07-28", -1)).toBe("2026-07-27");
    expect(shiftDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
