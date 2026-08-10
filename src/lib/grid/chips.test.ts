import { describe, expect, it } from "vitest";
import { buildGridChips, type ChipContext } from "./chips";

/**
 * The chips are the only place a user can see what is narrowing their grid — two of the
 * three controls behind them are invisible once their popover closes. Wrong or missing
 * wording here reads as missing data, not as a labelling bug.
 */

const LABELS: Record<string, string> = {
  priority: "Priority",
  state: "State",
  purpose: "Purpose",
};

function context(overrides: Partial<ChipContext> = {}): ChipContext {
  return {
    filters: {},
    advancedFilter: null,
    search: "",
    labelOf: (id) => LABELS[id] ?? id,
    optionLabelOf: (_columnId, optionId) =>
      optionId.startsWith("value:") ? optionId.slice(6) : optionId,
    ...overrides,
  };
}

describe("buildGridChips", () => {
  it("is empty when nothing narrows the grid", () => {
    expect(buildGridChips(context())).toEqual([]);
  });

  it("ignores a column whose funnel is on (All) or empty", () => {
    expect(
      buildGridChips(
        context({
          filters: {
            state: { mode: "options", ids: [] },
            priority: { mode: "options", ids: ["all"] },
          },
        }),
      ),
    ).toEqual([]);
  });

  it("names the column and its selected options", () => {
    const chips = buildGridChips(
      context({
        filters: { state: { mode: "options", ids: ["value:IP", "value:NS"] } },
      }),
    );

    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({
      kind: "column",
      columnId: "state",
      label: "State: IP, NS",
    });
  });

  it("summarises past the point a chip stays scannable", () => {
    const chips = buildGridChips(
      context({
        filters: {
          state: {
            mode: "options",
            ids: ["value:A", "value:B", "value:C", "value:D"],
          },
        },
      }),
    );

    expect(chips[0].label).toBe("State: 4 selected");
  });

  /**
   * `(All)` is a reset, not one option among many: `filterActive` treats a selection
   * containing it as unfiltered. The chip bar has to agree, or it would advertise a filter
   * that is not narrowing anything and offer an × that changes nothing on screen.
   */
  it("shows no chip when (All) is part of the selection", () => {
    expect(
      buildGridChips(
        context({
          filters: { state: { mode: "options", ids: ["all", "value:IP"] } },
        }),
      ),
    ).toEqual([]);
  });

  it("renders a per-column custom expression", () => {
    const chips = buildGridChips(
      context({
        filters: {
          state: {
            mode: "custom",
            join: "and",
            conditions: [
              { op: "neq", value: "C" },
              { op: "neq", value: "Cn" },
            ],
          },
        },
      }),
    );

    expect(chips[0].label).toBe("[State] ≠ 'C' AND [State] ≠ 'Cn'");
  });

  it("uses the presentation label supplied for exact date operands", () => {
    const chips = buildGridChips(
      context({
        filters: {
          deadline: {
            mode: "custom",
            join: "and",
            conditions: [{ op: "eq", value: "2026-01-05" }],
          },
        },
        labelOf: (id) => (id === "deadline" ? "Deadline" : id),
        operandLabelOf: (columnId, value) =>
          columnId === "deadline" && value === "2026-01-05" ? "January 5, 2026" : value,
      }),
    );

    expect(chips[0].label).toBe("[Deadline] = 'January 5, 2026'");
  });

  /**
   * One chip per condition, not one per advanced filter: removing a single criterion
   * without rebuilding the whole expression is the point of having chips at all.
   */
  it("gives each advanced-filter condition its own removable chip", () => {
    const chips = buildGridChips(
      context({
        advancedFilter: {
          join: "and",
          conditions: [
            { columnId: "priority", op: "lte", value: "B2" },
            { columnId: "purpose", op: "not_contains", value: "archive" },
          ],
        },
      }),
    );

    expect(chips).toEqual([
      {
        kind: "condition",
        key: "condition:0",
        index: 0,
        label: "Priority ≤ B2",
      },
      {
        kind: "condition",
        key: "condition:1",
        index: 1,
        label: "Purpose ∌ archive",
      },
    ]);
  });

  it("uses the presentation label for advanced-filter date operands", () => {
    const chips = buildGridChips(
      context({
        advancedFilter: {
          join: "and",
          conditions: [{ columnId: "deadline", op: "lt", value: "2026-01-05" }],
        },
        labelOf: (id) => (id === "deadline" ? "Deadline" : id),
        operandLabelOf: (_columnId, value) =>
          value === "2026-01-05" ? "5 Jan 2026" : value,
      }),
    );

    expect(chips[0].label).toBe("Deadline < 5 Jan 2026");
  });

  it("omits the operand for an operator that has none", () => {
    const chips = buildGridChips(
      context({
        advancedFilter: {
          join: "and",
          conditions: [{ columnId: "purpose", op: "nonblank", value: "" }],
        },
      }),
    );

    expect(chips[0].label).toBe("Purpose Is not blank");
  });

  it("falls back to the raw id for a column that no longer exists", () => {
    const chips = buildGridChips(
      context({
        advancedFilter: {
          join: "and",
          conditions: [{ columnId: "retired", op: "eq", value: "x" }],
        },
      }),
    );

    expect(chips[0].label).toBe("retired = x");
  });

  it("shows the search, trimmed, and ignores whitespace-only", () => {
    expect(buildGridChips(context({ search: "  report  " }))[0]).toMatchObject({
      kind: "search",
      label: 'Search "report"',
    });
    expect(buildGridChips(context({ search: "   " }))).toEqual([]);
  });

  it("collects every source into one list", () => {
    const chips = buildGridChips(
      context({
        filters: { state: { mode: "options", ids: ["value:IP"] } },
        advancedFilter: {
          join: "and",
          conditions: [{ columnId: "priority", op: "lte", value: "B2" }],
        },
        search: "report",
      }),
    );

    expect(chips.map((chip) => chip.kind)).toEqual(["column", "condition", "search"]);
  });
});

describe("a mostly-ticked set filter", () => {
  /** Nine states, of which a view leaves seven ticked. */
  const domain = ["NS", "IP", "W", "P", "D", "SD", "PR", "C", "Cn"].map(
    (code) => `value:${code}`,
  );

  function chipFor(ids: string[], withDomain = true): string {
    return buildGridChips({
      filters: { abbrState: { mode: "options", ids } },
      advancedFilter: null,
      search: "",
      labelOf: () => "State",
      optionLabelOf: (_columnId, optionId) => optionId.replace("value:", ""),
      domainOf: withDomain ? () => domain : undefined,
    })[0].label;
  }

  it("says what it hides rather than counting what it keeps", () => {
    // "State: 7 selected" tells you a column is narrowed while withholding the one thing
    // you wanted to know. Views open in exactly this shape.
    expect(chipFor(domain.filter((id) => id !== "value:C" && id !== "value:Cn"))).toBe(
      "State: all but C, Cn",
    );
  });

  it("falls back to counting when the excluded list is the long one", () => {
    expect(chipFor(["value:NS", "value:IP", "value:W", "value:P"])).toBe(
      "State: 4 selected",
    );
  });

  it("still lists a short selection outright", () => {
    expect(chipFor(["value:NS", "value:IP"])).toBe("State: NS, IP");
  });

  it("counts when no domain is available, rather than claiming to know what is missing", () => {
    expect(
      chipFor(
        domain.filter((id) => id !== "value:C" && id !== "value:Cn"),
        false,
      ),
    ).toBe("State: 7 selected");
  });
});

describe("a filter that is not currently hiding anything", () => {
  const domain = ["value:NS", "value:IP"];

  function chips(ids: string[]) {
    return buildGridChips({
      filters: { state: { mode: "options", ids } },
      advancedFilter: null,
      search: "",
      labelOf: () => "State",
      optionLabelOf: (_c, id) => id.replace("value:", ""),
      domainOf: () => domain,
    });
  }

  it("draws no chip when every value present is ticked", () => {
    // A view opening with "all but Completed" on data that has no completed rows. The chip
    // would otherwise sit beside "Showing 22 of 22" implying rows were held back.
    expect(chips(["value:NS", "value:IP", "value:C", "value:Cn"])).toEqual([]);
  });

  it("still draws one as soon as a ticked-off value appears in the data", () => {
    expect(chips(["value:NS"])).toHaveLength(1);
  });
});
