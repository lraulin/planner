import { describe, expect, it } from "vitest";
import {
  crossFilterActive,
  describeCrossFilter,
  parseCrossColumnFilter,
  rowPassesCrossFilter,
  type CrossColumnFilter,
} from "./crossFilter";

/**
 * The advanced filter decides which rows a user sees, from an expression they can no longer
 * see once the dialog closes. A wrong answer here looks like missing data, not like a bug —
 * which is exactly the class of mistake these are here to catch.
 */

const KINDS = {
  priority: "priority" as const,
  deadline: "date" as const,
  state: "enum" as const,
  purpose: "text" as const,
};

const and = (...conditions: CrossColumnFilter["conditions"]): CrossColumnFilter => ({
  join: "and",
  conditions,
});

const or = (...conditions: CrossColumnFilter["conditions"]): CrossColumnFilter => ({
  join: "or",
  conditions,
});

describe("crossFilterActive", () => {
  it("treats null and an empty expression as inactive", () => {
    // A builder the user opened and left empty must never empty the grid.
    expect(crossFilterActive(null)).toBe(false);
    expect(crossFilterActive(and())).toBe(false);
    expect(crossFilterActive(and({ columnId: "state", op: "blank", value: "" }))).toBe(
      true,
    );
  });
});

describe("rowPassesCrossFilter — joins", () => {
  const row = { priority: "B2", state: "IP", purpose: "Health and fitness" };

  it("requires every condition under And", () => {
    expect(
      rowPassesCrossFilter(
        row,
        and(
          { columnId: "priority", op: "lte", value: "B2" },
          { columnId: "state", op: "eq", value: "IP" },
        ),
        KINDS,
      ),
    ).toBe(true);

    expect(
      rowPassesCrossFilter(
        row,
        and(
          { columnId: "priority", op: "lte", value: "B2" },
          { columnId: "state", op: "eq", value: "C" },
        ),
        KINDS,
      ),
    ).toBe(false);
  });

  it("requires only one condition under Or", () => {
    expect(
      rowPassesCrossFilter(
        row,
        or(
          { columnId: "priority", op: "eq", value: "A1" },
          { columnId: "state", op: "eq", value: "IP" },
        ),
        KINDS,
      ),
    ).toBe(true);

    expect(
      rowPassesCrossFilter(
        row,
        or(
          { columnId: "priority", op: "eq", value: "A1" },
          { columnId: "state", op: "eq", value: "C" },
        ),
        KINDS,
      ),
    ).toBe(false);
  });

  it("passes everything when there is nothing to test", () => {
    expect(rowPassesCrossFilter(row, null, KINDS)).toBe(true);
    expect(rowPassesCrossFilter(row, and(), KINDS)).toBe(true);
  });
});

describe("rowPassesCrossFilter — column reach", () => {
  /**
   * The feature this whole module exists for: Show Fields hides a column, but the question
   * the user asked about it still applies. `values` carries every *defined* column.
   */
  it("filters on a column the grid is not currently showing", () => {
    const values = { priority: "A1", purpose: "Archive of old work" };

    expect(
      rowPassesCrossFilter(
        values,
        and({ columnId: "purpose", op: "not_contains", value: "archive" }),
        KINDS,
      ),
    ).toBe(false);

    expect(
      rowPassesCrossFilter(
        values,
        and({ columnId: "purpose", op: "contains", value: "archive" }),
        KINDS,
      ),
    ).toBe(true);
  });

  /**
   * A column that no longer exists is inert, never failing. Treating a missing key as a
   * blank cell would empty the grid, and the offending condition is invisible once the
   * dialog is closed — the user would have no way to work out why.
   */
  it("ignores a condition naming a column that no longer exists", () => {
    const values = { priority: "A1" };

    expect(
      rowPassesCrossFilter(
        values,
        and({ columnId: "retired", op: "eq", value: "anything" }),
        KINDS,
      ),
    ).toBe(true);
  });

  it("still applies the live conditions beside a stale one under And", () => {
    const values = { priority: "C1" };

    expect(
      rowPassesCrossFilter(
        values,
        and(
          { columnId: "retired", op: "eq", value: "anything" },
          { columnId: "priority", op: "lte", value: "B" },
        ),
        KINDS,
      ),
    ).toBe(false);
  });

  /**
   * Under Or a stale condition must **drop out** of the disjunction rather than count as
   * false — but it must also not count as true, which would make the whole filter vacuous.
   */
  it("drops a stale condition out of an Or without satisfying it", () => {
    const values = { priority: "C1" };

    expect(
      rowPassesCrossFilter(
        values,
        or(
          { columnId: "retired", op: "eq", value: "anything" },
          { columnId: "priority", op: "lte", value: "B" },
        ),
        KINDS,
      ),
    ).toBe(false);

    expect(
      rowPassesCrossFilter(
        values,
        or(
          { columnId: "retired", op: "eq", value: "anything" },
          { columnId: "priority", op: "gte", value: "B" },
        ),
        KINDS,
      ),
    ).toBe(true);
  });

  it("passes when every condition names a missing column", () => {
    expect(
      rowPassesCrossFilter(
        { priority: "A1" },
        and(
          { columnId: "retired", op: "eq", value: "x" },
          { columnId: "gone", op: "blank", value: "" },
        ),
        KINDS,
      ),
    ).toBe(true);
  });
});

describe("rowPassesCrossFilter — blanks and kinds", () => {
  it("distinguishes a blank cell from a missing column", () => {
    // Blank is a value and answers `blank`; missing is not a value and answers nothing.
    expect(
      rowPassesCrossFilter(
        { purpose: null },
        and({ columnId: "purpose", op: "blank", value: "" }),
        KINDS,
      ),
    ).toBe(true);

    expect(
      rowPassesCrossFilter(
        {},
        and({ columnId: "purpose", op: "blank", value: "" }),
        KINDS,
      ),
    ).toBe(true);

    expect(
      rowPassesCrossFilter(
        { purpose: "x" },
        and({ columnId: "purpose", op: "blank", value: "" }),
        KINDS,
      ),
    ).toBe(false);
  });

  it("compares priorities by rank, not alphabetically", () => {
    // A10 must sort after A2, which plain string comparison gets wrong.
    const under = (value: string) =>
      rowPassesCrossFilter(
        { priority: value },
        and({ columnId: "priority", op: "lte", value: "A10" }),
        KINDS,
      );

    expect(under("A2")).toBe(true);
    expect(under("A10")).toBe(true);
    expect(under("B1")).toBe(false);
  });

  it("compares dates as calendar days", () => {
    expect(
      rowPassesCrossFilter(
        { deadline: "2026-07-28" },
        and({ columnId: "deadline", op: "lt", value: "2026-08-01" }),
        KINDS,
      ),
    ).toBe(true);
  });

  it("keeps blank cells under a negation", () => {
    // "State ≠ Cancelled" is asking to exclude cancelled work, not to exclude work with no
    // state yet. Inherited from matchesCondition and pinned here because the cross-column
    // builder is where users will most often write a negation.
    expect(
      rowPassesCrossFilter(
        { state: null },
        and({ columnId: "state", op: "neq", value: "Cn" }),
        KINDS,
      ),
    ).toBe(true);
  });
});

describe("parseCrossColumnFilter", () => {
  it("degrades garbage to none rather than a broken expression", () => {
    for (const value of [null, undefined, 7, "and", [], { join: "and" }]) {
      expect(parseCrossColumnFilter(value)).toBeNull();
    }
  });

  it("drops malformed conditions and keeps their siblings", () => {
    expect(
      parseCrossColumnFilter({
        join: "or",
        conditions: [
          { columnId: "purpose", op: "contains", value: "health" },
          { columnId: "purpose", op: "sideways", value: "x" },
          { op: "eq", value: "no column id" },
          { columnId: "", op: "eq", value: "blank column id" },
          { columnId: "state", op: "blank" },
        ],
      }),
    ).toEqual({
      join: "or",
      conditions: [
        { columnId: "purpose", op: "contains", value: "health" },
        { columnId: "state", op: "blank", value: "" },
      ],
    });
  });

  it("defaults an unknown join to And", () => {
    expect(
      parseCrossColumnFilter({
        join: "maybe",
        conditions: [{ columnId: "state", op: "blank", value: "" }],
      })?.join,
    ).toBe("and");
  });
});

describe("describeCrossFilter", () => {
  it("renders an expression the user can check against what they asked for", () => {
    expect(
      describeCrossFilter(
        and(
          { columnId: "priority", op: "lte", value: "B2" },
          { columnId: "assignedTo", op: "nonblank", value: "" },
        ),
        (id) => (id === "priority" ? "Priority" : "Assigned"),
      ),
    ).toBe("[Priority] ≤ 'B2' AND [Assigned] ≠∅");
  });

  it("is empty for an empty expression", () => {
    expect(describeCrossFilter(and(), () => "x")).toBe("");
  });
});
