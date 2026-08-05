import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_SETTINGS,
  hasActiveFilters,
  hasAnyNarrowing,
  MAX_COLUMN_WIDTH,
  MAX_SORT_KEYS,
  MIN_COLUMN_WIDTH,
  parseGridSettings,
  resolveSwitches,
  serializeGridSettings,
} from "./grid";

/**
 * The stored blob is user-editable in devtools, may have been written by an older build,
 * and is read on every page load. These pin the fallbacks, because a wrong answer here
 * looks plausible — a dropped filter or a pinned column layout is easy to blame on the UI.
 */

describe("parseGridSettings", () => {
  it("falls back entirely for a non-object", () => {
    for (const value of [null, undefined, 42, "grid", [], true]) {
      expect(parseGridSettings(value)).toEqual(DEFAULT_GRID_SETTINGS);
    }
  });

  it("round-trips what it serializes", () => {
    const settings = {
      order: ["name", "priority"],
      widths: { name: 320 },
      filters: {
        priority: { mode: "options" as const, ids: ["only-as", "value:B1"] },
        state: {
          mode: "custom" as const,
          join: "and" as const,
          conditions: [
            { op: "neq" as const, value: "C" },
            { op: "neq" as const, value: "Cn" },
          ],
        },
      },
      advancedFilter: {
        join: "and" as const,
        conditions: [
          { columnId: "purpose", op: "not_contains" as const, value: "archive" },
          { columnId: "assignedTo", op: "nonblank" as const, value: "" },
        ],
      },
      search: "report",
      sorts: [
        { columnId: "deadline", direction: "desc" as const },
        { columnId: "priority", direction: "asc" as const },
      ],
      groupBy: ["resultArea", "state"] as string[] | null,
      collapsedGroups: ["area:health"],
      density: "compact" as const,
      view: "active-status",
      includeDeferred: false,
      switches: { groups: true, includeGoals: false },
    };

    expect(parseGridSettings(serializeGridSettings(settings))).toEqual(settings);
  });

  it("defaults includeDeferred to showing when absent", () => {
    // Old blobs, and any tab that never toggled it, must show postponed rows. Defaulting
    // to hidden would make every routine vanish from Tasks the moment it was ticked.
    expect(parseGridSettings({}).includeDeferred).toBe(true);
    expect(parseGridSettings({ includeDeferred: "nope" }).includeDeferred).toBe(true);
    expect(parseGridSettings({ includeDeferred: false }).includeDeferred).toBe(false);
  });

  it("distinguishes an absent column order from an empty one", () => {
    // null means "use the view's preset"; [] means "the user hid everything". A stored []
    // must not be rewritten to the preset, or Show Fields would silently undo itself.
    expect(parseGridSettings({ order: [] }).order).toEqual([]);
    expect(parseGridSettings({}).order).toBeNull();
    expect(parseGridSettings({ order: "name" }).order).toBeNull();
  });

  it("de-duplicates the column order", () => {
    expect(parseGridSettings({ order: ["name", "name", "priority"] }).order).toEqual([
      "name",
      "priority",
    ]);
  });

  it("drops non-string entries from the order rather than the whole layout", () => {
    expect(parseGridSettings({ order: ["name", 7, null, "priority"] }).order).toEqual([
      "name",
      "priority",
    ]);
  });

  it("clamps column widths and drops non-numeric ones", () => {
    const widths = parseGridSettings({
      widths: {
        tiny: 1,
        huge: 99_999,
        ok: 240,
        text: "12rem",
        nan: Number.NaN,
        infinite: Number.POSITIVE_INFINITY,
      },
    }).widths;

    expect(widths).toEqual({
      tiny: MIN_COLUMN_WIDTH,
      huge: MAX_COLUMN_WIDTH,
      ok: 240,
    });
  });

  it("keeps an empty filter selection rather than inventing one", () => {
    // Parsing does not editorialise: an empty list stays empty. Whether that *means*
    // anything is `hasActiveFilters`' call, and it reads empty as unfiltered.
    // Legacy bare arrays are wrapped as options mode.
    expect(parseGridSettings({ filters: { state: [] } }).filters).toEqual({
      state: { mode: "options", ids: [] },
    });
  });

  it("drops a filter whose value is garbage, keeping its siblings", () => {
    expect(
      parseGridSettings({ filters: { state: "done", priority: ["only-as"] } }).filters,
    ).toEqual({ priority: { mode: "options", ids: ["only-as"] } });
  });

  it("accepts legacy string[] filters as options mode", () => {
    expect(
      parseGridSettings({ filters: { priority: ["only-as", "value:B1"] } }).filters,
    ).toEqual({
      priority: { mode: "options", ids: ["only-as", "value:B1"] },
    });
  });

  it("discards a sort with no column, and defaults an unknown direction", () => {
    expect(parseGridSettings({ sorts: [{ direction: "asc" }] }).sorts).toEqual([]);
    expect(parseGridSettings({ sorts: ["deadline"] }).sorts).toEqual([]);
    expect(
      parseGridSettings({ sorts: [{ columnId: "deadline", direction: "sideways" }] })
        .sorts,
    ).toEqual([{ columnId: "deadline", direction: "asc" }]);
  });

  it("reads a pre-multi-sort blob's single `sort` key", () => {
    // The upgrade must not silently throw away an ordering the user chose. A legacy blob
    // has `sort`, never `sorts`.
    expect(
      parseGridSettings({ sort: { columnId: "deadline", direction: "desc" } }).sorts,
    ).toEqual([{ columnId: "deadline", direction: "desc" }]);

    expect(parseGridSettings({ sort: null }).sorts).toEqual([]);
    expect(parseGridSettings({ sort: "deadline" }).sorts).toEqual([]);
  });

  it("honours an explicitly empty sorts array over a stale legacy key", () => {
    // "I turned sorting off" must survive, even next to a `sort` left behind by an older
    // build that wrote both.
    expect(
      parseGridSettings({ sorts: [], sort: { columnId: "priority", direction: "asc" } })
        .sorts,
    ).toEqual([]);
  });

  it("keeps one sort key per column and caps the total", () => {
    expect(
      parseGridSettings({
        sorts: [
          { columnId: "priority", direction: "asc" },
          { columnId: "priority", direction: "desc" },
          { columnId: "deadline", direction: "desc" },
        ],
      }).sorts,
    ).toEqual([
      { columnId: "priority", direction: "asc" },
      { columnId: "deadline", direction: "desc" },
    ]);

    expect(
      parseGridSettings({
        sorts: ["a", "b", "c", "d", "e"].map((columnId) => ({
          columnId,
          direction: "asc",
        })),
      }).sorts,
    ).toHaveLength(MAX_SORT_KEYS);
  });

  it("drops a malformed advanced-filter condition but keeps its siblings", () => {
    expect(
      parseGridSettings({
        advancedFilter: {
          join: "or",
          conditions: [
            { columnId: "purpose", op: "contains", value: "health" },
            { columnId: "purpose", op: "sideways", value: "x" },
            { op: "eq", value: "no column" },
            { columnId: "", op: "eq", value: "blank column" },
          ],
        },
      }).advancedFilter,
    ).toEqual({
      join: "or",
      conditions: [{ columnId: "purpose", op: "contains", value: "health" }],
    });
  });

  it("degrades a garbage advanced filter to none rather than a broken expression", () => {
    for (const value of [null, "and", 7, [], { join: "and" }]) {
      expect(parseGridSettings({ advancedFilter: value }).advancedFilter).toBeNull();
    }
  });

  it("defaults density and rejects an unknown one", () => {
    expect(parseGridSettings({}).density).toBe("comfortable");
    expect(parseGridSettings({ density: "compact" }).density).toBe("compact");
    expect(parseGridSettings({ density: "tiny" }).density).toBe("comfortable");
  });

  it("keeps only boolean switches", () => {
    expect(
      parseGridSettings({ switches: { groups: true, goals: "yes", area: false } })
        .switches,
    ).toEqual({ groups: true, area: false });
    expect(parseGridSettings({ switches: "on" }).switches).toEqual({});
  });

  it("reads search as text", () => {
    expect(parseGridSettings({ search: "report" }).search).toBe("report");
    expect(parseGridSettings({ search: 7 }).search).toBe("");
  });

  it("reads groupBy as an ordered list", () => {
    expect(parseGridSettings({ groupBy: ["resultArea", "state"] }).groupBy).toEqual([
      "resultArea",
      "state",
    ]);
  });

  /**
   * Same distinction as `order`, and it matters more here: Projects groups by
   * Category → Result Area out of the box, so if "the user turned grouping off" parsed the
   * same as "never chose", picking Group by → (None) there would appear to do nothing.
   */
  it("distinguishes an absent grouping from an explicitly empty one", () => {
    expect(parseGridSettings({}).groupBy).toBeNull();
    expect(parseGridSettings({ groupBy: "resultArea" }).groupBy).toBeNull();
    expect(parseGridSettings({ groupBy: [] }).groupBy).toEqual([]);
  });

  it("ignores keys it has never heard of", () => {
    // A field removed in a later refactor must not break the rest of the blob.
    expect(parseGridSettings({ retired: true, view: "completed" }).view).toBe(
      "completed",
    );
  });
});

describe("hasActiveFilters", () => {
  it("is false when nothing narrows the rows", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ state: { mode: "options", ids: [] } })).toBe(false);
    expect(hasActiveFilters({ state: { mode: "options", ids: ["all"] } })).toBe(false);
    expect(
      hasActiveFilters({ state: { mode: "custom", join: "and", conditions: [] } }),
    ).toBe(false);
  });

  it("is true once a column selects something other than (All)", () => {
    expect(hasActiveFilters({ state: { mode: "options", ids: ["value:done"] } })).toBe(
      true,
    );
    expect(
      hasActiveFilters({
        a: { mode: "options", ids: ["all"] },
        b: { mode: "options", ids: ["only-as"] },
      }),
    ).toBe(true);
    expect(
      hasActiveFilters({
        state: {
          mode: "custom",
          join: "and",
          conditions: [{ op: "neq", value: "Cn" }],
        },
      }),
    ).toBe(true);
  });
});

describe("hasAnyNarrowing", () => {
  const NONE = {};

  it("is false when the grid is showing everything", () => {
    expect(hasAnyNarrowing(NONE, null, "")).toBe(false);
    expect(hasAnyNarrowing(NONE, null, "   ")).toBe(false);
    expect(hasAnyNarrowing(NONE, { join: "and", conditions: [] }, "")).toBe(false);
  });

  /**
   * The reason this exists rather than reusing `hasActiveFilters`: a grid narrowed only by
   * the search box or the advanced builder would otherwise show a disabled Clear button
   * next to rows the user cannot account for.
   */
  it("catches narrowing that is not a column filter", () => {
    expect(hasAnyNarrowing(NONE, null, "report")).toBe(true);
    expect(
      hasAnyNarrowing(
        NONE,
        {
          join: "and",
          conditions: [{ columnId: "purpose", op: "contains", value: "health" }],
        },
        "",
      ),
    ).toBe(true);
    expect(
      hasAnyNarrowing({ state: { mode: "options", ids: ["value:done"] } }, null, ""),
    ).toBe(true);
  });

  /**
   * A view's default filter is narrowing like any other. It has to read as active or the
   * chip bar would not draw it and `Clear all` would sit disabled beside rows the user
   * cannot account for — which is the failure this whole mechanism exists to prevent.
   */
  it("counts a view's default filters, because the user cannot tell them apart", () => {
    expect(
      hasAnyNarrowing({ abbrState: { mode: "options", ids: ["value:NS"] } }, null, ""),
    ).toBe(true);
  });
});

describe("parseGridSettings — filters, and the v1 migration", () => {
  it("follows the view's defaults when filters were never written", () => {
    expect(parseGridSettings({ v: 2 }).filters).toBeNull();
  });

  it("honours an explicitly cleared map from v2 on", () => {
    // "Show me everything" is a choice, and it has to survive a reload — otherwise a view
    // could only have defaults you were unable to turn off.
    expect(parseGridSettings({ v: 2, filters: {} }).filters).toEqual({});
  });

  it("reads an empty v1 map as never-set, because v1 could not say 'cleared'", () => {
    // Every v1 grid serialized `filters: {}` whether or not a funnel had been opened, so an
    // empty map from v1 is not evidence of a decision.
    expect(parseGridSettings({ v: 1, filters: {} }).filters).toBeNull();
    expect(parseGridSettings({ filters: {} }).filters).toBeNull();
  });

  it("keeps real filters from a v1 blob untouched", () => {
    const stored = { state: { mode: "options", ids: ["value:NS"] } };
    expect(parseGridSettings({ v: 1, filters: stored }).filters).toEqual(stored);
  });

  it("degrades garbage to the defaults rather than to an empty map", () => {
    // An empty map would mean "the user cleared everything", which is a claim a corrupt
    // blob has not earned.
    expect(parseGridSettings({ v: 2, filters: "nope" }).filters).toBeNull();
    expect(parseGridSettings({ v: 2, filters: [] }).filters).toBeNull();
  });
});

describe("resolveSwitches", () => {
  it("lets the user's own position beat the view's", () => {
    // The mistake this exists to catch: spread the other way and turning a switch off on a view
    // that has it on does nothing, which reads as a broken toggle rather than a precedence bug.
    expect(resolveSwitches({ nextActions: true }, { nextActions: false })).toEqual({
      nextActions: false,
    });
  });

  it("supplies the view's position for a switch the user has not touched", () => {
    expect(resolveSwitches({ nextActions: true }, {})).toEqual({ nextActions: true });
  });

  it("leaves an untouched switch absent, so the tab's declared default still applies", () => {
    // Absent is the third state, and it has to survive: `switchValue` reads `defaultOn` only
    // when the id is missing from this map. Filling it in with `false` would silently override
    // every switch a tab declares as on by default.
    expect(resolveSwitches({}, {})).not.toHaveProperty("levelAreas");
    expect(resolveSwitches(undefined, {})).toEqual({});
  });

  it("keeps switches from both sides", () => {
    expect(resolveSwitches({ a: true }, { b: true })).toEqual({ a: true, b: true });
  });
});
