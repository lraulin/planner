import { describe, expect, it } from "vitest";
import { rowMatchesSearch, searchActive } from "./search";

describe("searchActive", () => {
  it("ignores an empty or whitespace-only query", () => {
    // A stray space must not silently filter the grid to nothing.
    expect(searchActive("")).toBe(false);
    expect(searchActive("   ")).toBe(false);
    expect(searchActive("\t\n")).toBe(false);
    expect(searchActive("a")).toBe(true);
  });
});

describe("rowMatchesSearch", () => {
  const row = {
    name: "Quarterly report",
    purpose: "Health and fitness",
    state: "IP",
    deadline: null,
  };

  it("passes every row when there is no query", () => {
    expect(rowMatchesSearch(row, "")).toBe(true);
    expect(rowMatchesSearch(row, "   ")).toBe(true);
    expect(rowMatchesSearch({}, "")).toBe(true);
  });

  it("matches a substring in any column, ignoring case", () => {
    expect(rowMatchesSearch(row, "quarterly")).toBe(true);
    expect(rowMatchesSearch(row, "REPORT")).toBe(true);
    expect(rowMatchesSearch(row, "fitness")).toBe(true);
    expect(rowMatchesSearch(row, "ip")).toBe(true);
    expect(rowMatchesSearch(row, "missing")).toBe(false);
  });

  it("matches mid-word, not only at a boundary", () => {
    expect(rowMatchesSearch(row, "arter")).toBe(true);
  });

  /**
   * The reason a second word must narrow rather than widen: typing more is how people
   * expect to get fewer results. Each term may land in a different column, though — the
   * row as a whole is the unit being searched, not any one cell.
   */
  it("requires every term, allowing each to match a different column", () => {
    expect(rowMatchesSearch(row, "report health")).toBe(true);
    expect(rowMatchesSearch(row, "report missing")).toBe(false);
    expect(rowMatchesSearch(row, "  report   health  ")).toBe(true);
  });

  /**
   * Show Fields hides a column but does not un-index it. Search, column filters and the
   * advanced filter all reach every *defined* column; if they disagreed, a word would find
   * a row from one control and not another, which is impossible to reason about.
   */
  it("finds a hit in a column that is not currently visible", () => {
    expect(rowMatchesSearch({ name: "Report", purpose: "Health" }, "health")).toBe(
      true,
    );
  });

  it("skips blank and missing cells rather than matching them", () => {
    expect(rowMatchesSearch({ name: null, purpose: "" }, "a")).toBe(false);
    expect(rowMatchesSearch({}, "a")).toBe(false);
  });
});
