import { describe, expect, it } from "vitest";
import {
  ALL_FILTER,
  NONE_FILTER,
  NONE_OPTION_ID,
  filterActive,
  filterOptions,
  matchesFilter,
  optionsFilter,
  presetOptions,
  rowPassesFilters,
  selectPreset,
  shiftDays,
  usesSetFilter,
  type ColumnFilter,
} from "./filters";

const TODAY = "2026-07-28";

describe("matchesFilter — universal", () => {
  it("lets everything through under (All)", () => {
    expect(matchesFilter(null, ALL_FILTER, "text", TODAY)).toBe(true);
    expect(matchesFilter("A1", ALL_FILTER, "priority", TODAY)).toBe(true);
  });

  it("handles blanks and non-blanks", () => {
    expect(matchesFilter(null, optionsFilter(["blanks"]), "text", TODAY)).toBe(true);
    expect(matchesFilter("", optionsFilter(["blanks"]), "text", TODAY)).toBe(true);
    expect(matchesFilter("x", optionsFilter(["blanks"]), "text", TODAY)).toBe(false);

    expect(matchesFilter("x", optionsFilter(["nonblanks"]), "text", TODAY)).toBe(true);
    expect(matchesFilter(null, optionsFilter(["nonblanks"]), "text", TODAY)).toBe(
      false,
    );
  });

  it("matches a distinct value option", () => {
    expect(matchesFilter("NS", optionsFilter(["value:NS"]), "enum", TODAY)).toBe(true);
    expect(matchesFilter("IP", optionsFilter(["value:NS"]), "enum", TODAY)).toBe(false);
  });

  /**
   * `(Select none)` has to hide every row, including blanks, on every kind. The date presets
   * carry their own `none` meaning "blank", so the sentinel losing to that lookup would turn
   * a cleared Deadline checklist into a filter that shows exactly the undated rows.
   */
  it("hides every row under a cleared checklist", () => {
    expect(filterActive(NONE_FILTER)).toBe(true);
    for (const kind of ["text", "enum", "priority", "date", "number"] as const) {
      expect(matchesFilter("NS", NONE_FILTER, kind, TODAY)).toBe(false);
      expect(matchesFilter(null, NONE_FILTER, kind, TODAY)).toBe(false);
      expect(matchesFilter("", NONE_FILTER, kind, TODAY)).toBe(false);
    }
  });

  /** A leftover tick still counts: the sentinel only speaks for itself. */
  it("still shows rows matching another id selected alongside the sentinel", () => {
    const filter = optionsFilter([NONE_OPTION_ID, "value:NS"]);
    expect(matchesFilter("NS", filter, "enum", TODAY)).toBe(true);
    expect(matchesFilter("IP", filter, "enum", TODAY)).toBe(false);
  });
});

describe("matchesFilter — priority presets", () => {
  const p = (id: string, value: string | null) =>
    matchesFilter(value, optionsFilter([id]), "priority", TODAY);

  it("isolates A1 from the rest of the As", () => {
    expect(p("only-a1", "A1")).toBe(true);
    expect(p("only-a1", "A2")).toBe(false);

    expect(p("only-as", "A1")).toBe(true);
    expect(p("only-as", "A3")).toBe(true);
    expect(p("only-as", "B1")).toBe(false);
  });

  it("covers letter bands and prioritized/unprioritized", () => {
    expect(p("only-as-bs", "B2")).toBe(true);
    expect(p("only-as-bs", "C1")).toBe(false);
    expect(p("only-as-bs-cs", "C1")).toBe(true);
    expect(p("only-as-bs-cs", "D1")).toBe(false);

    expect(p("prioritized", "D1")).toBe(true);
    expect(p("unprioritized", null)).toBe(true);
    expect(p("unprioritized", "")).toBe(true);
    expect(p("unprioritized", "A1")).toBe(false);
  });

  it("keeps unprioritized rows in the 'up to letter' bands", () => {
    // Daily pattern: hide letters already decided (often D) without burying blanks that
    // still need a priority assigned.
    expect(p("as-and-unprioritized", "A1")).toBe(true);
    expect(p("as-and-unprioritized", "A")).toBe(true);
    expect(p("as-and-unprioritized", null)).toBe(true);
    expect(p("as-and-unprioritized", "")).toBe(true);
    expect(p("as-and-unprioritized", "B")).toBe(false);
    expect(p("as-and-unprioritized", "D")).toBe(false);

    expect(p("as-bs-and-unprioritized", "B2")).toBe(true);
    expect(p("as-bs-and-unprioritized", null)).toBe(true);
    expect(p("as-bs-and-unprioritized", "C")).toBe(false);
    expect(p("as-bs-and-unprioritized", "D")).toBe(false);

    expect(p("as-bs-cs-and-unprioritized", "C1")).toBe(true);
    expect(p("as-bs-cs-and-unprioritized", null)).toBe(true);
    expect(p("as-bs-cs-and-unprioritized", "D")).toBe(false);
    // Contrast: Achieve's "Only As Bs & Cs" drops blanks.
    expect(p("only-as-bs-cs", null)).toBe(false);
  });
});

describe("matchesFilter — deadline presets", () => {
  const d = (id: string, value: string | null) =>
    matchesFilter(value, optionsFilter([id]), "date", TODAY);

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
    expect(matchesFilter("2020-01-01", optionsFilter(["past"]), "date", null)).toBe(
      true,
    );
  });
});

describe("matchesFilter — number presets", () => {
  const positive = optionsFilter(["positive"]);
  const negative = optionsFilter(["negative"]);
  const zero = optionsFilter(["zero"]);

  it("splits formatted money on the sign, not the string", () => {
    // Amount cells are `$1,200.00` / `($12.34)` / `-$50.00`. Matching the display
    // string would put every spend next to every deposit because both contain "0".
    expect(matchesFilter("$10.00", positive, "number", TODAY)).toBe(true);
    expect(matchesFilter("-$5.00", positive, "number", TODAY)).toBe(false);
    expect(matchesFilter("($12.34)", negative, "number", TODAY)).toBe(true);
    expect(matchesFilter("$1,200.00", negative, "number", TODAY)).toBe(false);
    expect(matchesFilter("$0.00", zero, "number", TODAY)).toBe(true);
    expect(matchesFilter("$0.00", positive, "number", TODAY)).toBe(false);
  });

  it("treats a blank cell as none of the sign bands", () => {
    expect(matchesFilter(null, positive, "number", TODAY)).toBe(false);
    expect(matchesFilter("", negative, "number", TODAY)).toBe(false);
    expect(matchesFilter(null, zero, "number", TODAY)).toBe(false);
  });
});

describe("multi-select selections", () => {
  it("passes a row matching any selected option", () => {
    // The point of multi-select: "A1 or B1", which one choice per column cannot express.
    const sel = optionsFilter(["only-a1", "value:B1"]);
    expect(matchesFilter("A1", sel, "priority", TODAY)).toBe(true);
    expect(matchesFilter("B1", sel, "priority", TODAY)).toBe(true);
    expect(matchesFilter("C1", sel, "priority", TODAY)).toBe(false);
  });

  it("mixes a preset with literal values", () => {
    const sel = optionsFilter(["only-as", "value:D"]);
    expect(matchesFilter("A3", sel, "priority", TODAY)).toBe(true);
    expect(matchesFilter("D", sel, "priority", TODAY)).toBe(true);
    expect(matchesFilter("B", sel, "priority", TODAY)).toBe(false);
  });

  it("treats an empty selection and (All) as the same unfiltered state", () => {
    // Otherwise an empty grid could sit behind a filter button that looks inactive.
    expect(filterActive(ALL_FILTER)).toBe(false);
    expect(filterActive(optionsFilter([]))).toBe(false);
    expect(filterActive(optionsFilter(["all"]))).toBe(false);
    expect(filterActive(optionsFilter(["only-as"]))).toBe(true);

    expect(matchesFilter("B", optionsFilter([]), "priority", TODAY)).toBe(true);
    expect(matchesFilter("B", optionsFilter(["all"]), "priority", TODAY)).toBe(true);
  });

  it("stays unfiltered when (All) rides along with a real option", () => {
    expect(
      matchesFilter("B", optionsFilter(["all", "only-as"]), "priority", TODAY),
    ).toBe(true);
  });

  it("combines blanks with a value, which one choice per column could not", () => {
    const sel = optionsFilter(["blanks", "value:A1"]);
    expect(matchesFilter(null, sel, "priority", TODAY)).toBe(true);
    expect(matchesFilter("A1", sel, "priority", TODAY)).toBe(true);
    expect(matchesFilter("B2", sel, "priority", TODAY)).toBe(false);
  });
});

describe("filterOptions", () => {
  it("stacks universal, presets, and distinct values", () => {
    const options = filterOptions("priority", ["A1", "B", ""]);
    const ids = options.map((o) => o.id);
    expect(ids[0]).toBe("all");
    expect(ids[1]).toBe("custom");
    expect(ids).toContain("only-a1");
    expect(ids).toContain("value:A1");
    expect(ids).toContain("value:B");
    expect(ids).not.toContain("value:");
  });

  it("names number sign bands so a chip can say (Positive), not the raw id", () => {
    // filterOptions is how the chip bar resolves a stored option id. Missing the
    // number bands here is how Amount: positive leaked onto the bar.
    const ids = filterOptions("number", []).map((o) => o.id);
    expect(ids).toContain("positive");
    expect(ids).toContain("negative");
    expect(ids).toContain("zero");
    expect(filterOptions("number", []).find((o) => o.id === "positive")?.label).toBe(
      "(Positive)",
    );
  });
});

describe("usesSetFilter", () => {
  it("offers the value checklist only where the values are a closed set", () => {
    expect(usesSetFilter("enum")).toBe(true);

    // Open-ended or continuous: a list of the values present is a list of the rows.
    expect(usesSetFilter("priority")).toBe(false);
    expect(usesSetFilter("date")).toBe(false);
    expect(usesSetFilter("text")).toBe(false);
    expect(usesSetFilter("number")).toBe(false);
    expect(usesSetFilter(undefined)).toBe(false);
  });
});

describe("presetOptions", () => {
  it("gives every non-enum kind bands to pick from, and enums none", () => {
    expect(presetOptions("enum")).toEqual([]);

    expect(presetOptions("date").map((o) => o.id)).toContain("today-and-past");
    expect(presetOptions("priority").map((o) => o.id)).toContain("only-as");

    // Free text has no bands of its own, but "has a value at all" is still worth one click.
    expect(presetOptions("text").map((o) => o.id)).toEqual(["blanks", "nonblanks"]);
    expect(presetOptions("number").map((o) => o.id)).toEqual([
      "positive",
      "negative",
      "zero",
      "blanks",
      "nonblanks",
    ]);
    expect(presetOptions(undefined).map((o) => o.id)).toEqual(["blanks", "nonblanks"]);
  });

  it("never offers bands and the checklist on the same column", () => {
    for (const kind of [
      "text",
      "priority",
      "date",
      "enum",
      "number",
      undefined,
    ] as const) {
      expect(presetOptions(kind).length > 0).toBe(!usesSetFilter(kind));
    }
  });
});

describe("selectPreset", () => {
  it("replaces the column's selection rather than adding to it", () => {
    // Two date bands OR'd would widen the filter on a click that reads like narrowing it.
    expect(selectPreset("today")).toEqual(optionsFilter(["today"]));
    expect(selectPreset("past")).toEqual(optionsFilter(["past"]));
    expect(filterActive(selectPreset("past"))).toBe(true);
  });
});

describe("rowPassesFilters", () => {
  it("ignores columns with nothing selected", () => {
    expect(
      rowPassesFilters({ priority: "D" }, { priority: optionsFilter([]) }, {}, TODAY),
    ).toBe(true);
  });

  it("requires every active column filter to pass", () => {
    const filters: Record<string, ColumnFilter> = {
      priority: optionsFilter(["only-as"]),
      deadline: optionsFilter(["today"]),
    };
    const kinds = { priority: "priority" as const, deadline: "date" as const };

    expect(
      rowPassesFilters({ priority: "A1", deadline: TODAY }, filters, kinds, TODAY),
    ).toBe(true);

    expect(
      rowPassesFilters({ priority: "B", deadline: TODAY }, filters, kinds, TODAY),
    ).toBe(false);
  });

  /**
   * Show Fields hides a column but does not un-ask the question. `values` carries an entry
   * for every column the tab *defines*, so a filter on a hidden one keeps selecting rows.
   */
  it("filters on a column that is not currently visible", () => {
    const filters = { purpose: optionsFilter(["value:Health"]) };
    const kinds = { purpose: "text" as const };

    expect(rowPassesFilters({ purpose: "Health" }, filters, kinds, TODAY)).toBe(true);
    expect(rowPassesFilters({ purpose: "Career" }, filters, kinds, TODAY)).toBe(false);
    expect(rowPassesFilters({ purpose: null }, filters, kinds, TODAY)).toBe(false);
  });

  /**
   * The regression this guards: a missing key used to read as a blank cell, so a filter
   * left over from a renamed or removed column failed every row and emptied the grid with
   * no funnel on screen to explain it. It must be inert instead.
   */
  it("ignores a filter naming a column that no longer exists", () => {
    const filters = { gone: optionsFilter(["value:Health"]) };

    expect(rowPassesFilters({ priority: "A1" }, filters, {}, TODAY)).toBe(true);
    expect(rowPassesFilters({}, filters, {}, TODAY)).toBe(true);
  });

  it("still applies the columns that do exist alongside a stale one", () => {
    const filters = {
      gone: optionsFilter(["value:Health"]),
      priority: optionsFilter(["only-as"]),
    };
    const kinds = { priority: "priority" as const };

    expect(rowPassesFilters({ priority: "A1" }, filters, kinds, TODAY)).toBe(true);
    expect(rowPassesFilters({ priority: "B1" }, filters, kinds, TODAY)).toBe(false);
  });
});

describe("shiftDays", () => {
  it("moves whole calendar days without landing mid-day", () => {
    expect(shiftDays("2026-07-28", 1)).toBe("2026-07-29");
    expect(shiftDays("2026-07-28", -1)).toBe("2026-07-27");
    expect(shiftDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});
