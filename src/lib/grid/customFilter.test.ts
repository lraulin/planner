import { describe, expect, it } from "vitest";
import {
  ALL_FILTER,
  customFilter,
  describeCustom,
  filterActive,
  matchesCondition,
  matchesCustom,
  operatorsForKind,
  optionsFilter,
  parseColumnFilter,
} from "./customFilter";

describe("filterActive", () => {
  it("treats empty options and All as inactive", () => {
    expect(filterActive(ALL_FILTER)).toBe(false);
    expect(filterActive(optionsFilter(["all"]))).toBe(false);
    expect(filterActive(optionsFilter(["value:NS"]))).toBe(true);
  });

  it("treats empty custom conditions as inactive", () => {
    expect(filterActive(customFilter("and", []))).toBe(false);
    expect(filterActive(customFilter("and", [{ op: "neq", value: "Cn" }]))).toBe(true);
  });
});

describe("operatorsForKind", () => {
  it("gives text the string operators and enum only equals-family", () => {
    const text = operatorsForKind("text").map((o) => o.id);
    expect(text).toContain("contains");
    expect(text).toContain("starts_with");
    expect(text).not.toContain("lt");

    const en = operatorsForKind("enum").map((o) => o.id);
    expect(en).toEqual(["eq", "neq", "blank", "nonblank"]);
  });

  it("gives date and priority comparisons", () => {
    for (const kind of ["date", "priority"] as const) {
      const ids = operatorsForKind(kind).map((o) => o.id);
      expect(ids).toContain("gte");
      expect(ids).not.toContain("contains");
    }
  });
});

describe("matchesCondition — text", () => {
  it("handles equals and not-equals case-insensitively", () => {
    expect(matchesCondition("NS", { op: "eq", value: "ns" }, "enum")).toBe(true);
    expect(matchesCondition("IP", { op: "eq", value: "NS" }, "enum")).toBe(false);
    expect(matchesCondition("Cn", { op: "neq", value: "C" }, "enum")).toBe(true);
    // Blank is not equal to a concrete value — keep empty cells under "≠ Cancelled".
    expect(matchesCondition(null, { op: "neq", value: "Cn" }, "enum")).toBe(true);
  });

  it("handles contains / not_contains / starts / ends", () => {
    expect(
      matchesCondition("Archive project", { op: "contains", value: "ARCH" }, "text"),
    ).toBe(true);
    expect(
      matchesCondition(
        "Archive project",
        { op: "not_contains", value: "draft" },
        "text",
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        "Archive project",
        { op: "not_contains", value: "archive" },
        "text",
      ),
    ).toBe(false);
    expect(matchesCondition("Hello", { op: "starts_with", value: "he" }, "text")).toBe(
      true,
    );
    expect(matchesCondition("Hello", { op: "ends_with", value: "LO" }, "text")).toBe(
      true,
    );
  });

  it("handles blank / nonblank", () => {
    expect(matchesCondition(null, { op: "blank", value: "" }, "text")).toBe(true);
    expect(matchesCondition("", { op: "blank", value: "" }, "text")).toBe(true);
    expect(matchesCondition("x", { op: "blank", value: "" }, "text")).toBe(false);
    expect(matchesCondition("x", { op: "nonblank", value: "" }, "text")).toBe(true);
  });
});

describe("matchesCondition — date and priority compares", () => {
  it("compares ISO dates", () => {
    expect(
      matchesCondition("2026-08-01", { op: "lt", value: "2026-08-02" }, "date"),
    ).toBe(true);
    expect(
      matchesCondition("2026-08-01", { op: "gte", value: "2026-08-01" }, "date"),
    ).toBe(true);
    expect(matchesCondition(null, { op: "lt", value: "2026-08-01" }, "date")).toBe(
      false,
    );
  });

  it("orders priorities like the grid (A1 < A10 < B)", () => {
    expect(matchesCondition("A1", { op: "lt", value: "A10" }, "priority")).toBe(true);
    expect(matchesCondition("A10", { op: "lt", value: "B" }, "priority")).toBe(true);
    expect(matchesCondition("B", { op: "gte", value: "A" }, "priority")).toBe(true);
    expect(matchesCondition("A1", { op: "gt", value: "B" }, "priority")).toBe(false);
    expect(matchesCondition(null, { op: "gte", value: "A" }, "priority")).toBe(false);
  });
});

describe("matchesCustom — And / Or", () => {
  it("requires every condition under And", () => {
    const filter = customFilter("and", [
      { op: "neq", value: "C" },
      { op: "neq", value: "Cn" },
    ]);
    expect(matchesCustom("NS", filter, "enum")).toBe(true);
    expect(matchesCustom("C", filter, "enum")).toBe(false);
    expect(matchesCustom("Cn", filter, "enum")).toBe(false);
  });

  it("accepts any condition under Or", () => {
    const filter = customFilter("or", [
      { op: "eq", value: "A1" },
      { op: "eq", value: "B1" },
    ]);
    expect(matchesCustom("A1", filter, "priority")).toBe(true);
    expect(matchesCustom("B1", filter, "priority")).toBe(true);
    expect(matchesCustom("C", filter, "priority")).toBe(false);
  });

  it("passes everything when conditions are empty", () => {
    expect(matchesCustom("anything", customFilter("and", []), "text")).toBe(true);
  });
});

describe("describeCustom", () => {
  it("renders a readable expression", () => {
    expect(
      describeCustom(
        "State",
        customFilter("and", [
          { op: "neq", value: "C" },
          { op: "neq", value: "Cn" },
        ]),
      ),
    ).toBe("[State] ≠ 'C' AND [State] ≠ 'Cn'");
  });
});

describe("parseColumnFilter", () => {
  it("accepts legacy string arrays as options mode", () => {
    expect(parseColumnFilter(["only-as", "value:B1"])).toEqual({
      mode: "options",
      ids: ["only-as", "value:B1"],
    });
  });

  it("accepts structured custom and options", () => {
    expect(
      parseColumnFilter({
        mode: "custom",
        join: "or",
        conditions: [{ op: "eq", value: "NS" }],
      }),
    ).toEqual({
      mode: "custom",
      join: "or",
      conditions: [{ op: "eq", value: "NS" }],
    });
    expect(parseColumnFilter({ mode: "options", ids: ["blanks"] })).toEqual({
      mode: "options",
      ids: ["blanks"],
    });
  });

  it("rejects garbage", () => {
    expect(parseColumnFilter(null)).toBeNull();
    expect(parseColumnFilter("done")).toBeNull();
    expect(parseColumnFilter({ mode: "custom", conditions: "nope" })).toBeNull();
  });
});
