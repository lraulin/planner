import { describe, expect, it } from "vitest";
import { filterValueBlank, scalarFilterValues } from "./filterValue";

describe("scalarFilterValues", () => {
  it("gives a present value back as a one-entry list", () => {
    expect(scalarFilterValues("Groceries")).toEqual(["Groceries"]);
  });

  it("treats null and empty string alike, because a blank cell has no value to match", () => {
    // The distinction the grid draws is present/absent, not null/"": a column that returns
    // "" for a missing field must land in the `blanks` bucket with one that returns null.
    expect(scalarFilterValues(null)).toEqual([]);
    expect(scalarFilterValues("")).toEqual([]);
  });

  it("keeps a value that is only whitespace, which is not the same as absent", () => {
    expect(scalarFilterValues(" ")).toEqual([" "]);
  });
});

describe("filterValueBlank", () => {
  it("is what the blanks and nonblanks presets read", () => {
    expect(filterValueBlank(null)).toBe(true);
    expect(filterValueBlank("")).toBe(true);
    expect(filterValueBlank("0")).toBe(false);
    expect(filterValueBlank("Groceries")).toBe(false);
  });
});
