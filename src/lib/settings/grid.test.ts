import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_SETTINGS,
  hasActiveFilters,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  parseGridSettings,
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
      filters: { priority: ["only-as", "value:B1"] },
      sort: { columnId: "deadline", direction: "desc" as const },
      collapsedGroups: ["area:health"],
      view: "active-status",
      includeDeferred: false,
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
    expect(parseGridSettings({ filters: { state: [] } }).filters).toEqual({
      state: [],
    });
  });

  it("drops a filter whose value is not a list, keeping its siblings", () => {
    expect(
      parseGridSettings({ filters: { state: "done", priority: ["only-as"] } }).filters,
    ).toEqual({ priority: ["only-as"] });
  });

  it("discards a sort with no column, and defaults an unknown direction", () => {
    expect(parseGridSettings({ sort: { direction: "asc" } }).sort).toBeNull();
    expect(parseGridSettings({ sort: "deadline" }).sort).toBeNull();
    expect(
      parseGridSettings({ sort: { columnId: "deadline", direction: "sideways" } }).sort,
    ).toEqual({ columnId: "deadline", direction: "asc" });
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
    expect(hasActiveFilters({ state: [] })).toBe(false);
    expect(hasActiveFilters({ state: ["all"] })).toBe(false);
  });

  it("is true once a column selects something other than (All)", () => {
    expect(hasActiveFilters({ state: ["value:done"] })).toBe(true);
    expect(hasActiveFilters({ a: ["all"], b: ["only-as"] })).toBe(true);
  });
});
