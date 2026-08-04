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
