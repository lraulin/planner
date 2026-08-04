import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTLINE_FILTERS,
  isSettledOutlineState,
  parseOutlineFilters,
  serializeOutlineFilters,
} from "./outline";

describe("parseOutlineFilters", () => {
  it("falls back entirely for a non-object", () => {
    for (const value of [null, undefined, 42, "outline", [], true]) {
      expect(parseOutlineFilters(value)).toEqual(DEFAULT_OUTLINE_FILTERS);
    }
  });

  it("round-trips what it serializes", () => {
    const settings = { showCompleted: true, byCategory: true };
    expect(parseOutlineFilters(serializeOutlineFilters(settings))).toEqual(settings);
  });

  it("degrades a garbage value per field rather than dropping the whole blob", () => {
    const parsed = parseOutlineFilters({ showCompleted: "nope", byCategory: "on" });
    expect(parsed.showCompleted).toBe(false);
    expect(parsed.byCategory).toBe(false);
  });

  it("ignores the retired type and focus fields without failing to parse", () => {
    // A blob written before those two moved to their columns must still open the outline,
    // and must not resurrect a stored "hide every task" as something with no control left
    // to undo it.
    const parsed = parseOutlineFilters({
      types: { result_area: false, goal: false, project: false, task: false },
      focusOnly: true,
      showCompleted: true,
    });
    expect(parsed).toEqual({ showCompleted: true, byCategory: false });
  });

  it("defaults showCompleted to false when the key is absent", () => {
    // Older stored blobs predate this flag; missing means hide done items, not "show
    // everything because we cannot tell".
    expect(parseOutlineFilters({}).showCompleted).toBe(false);
  });

  it("honours an explicit showCompleted true", () => {
    expect(parseOutlineFilters({ showCompleted: true }).showCompleted).toBe(true);
  });

  it("defaults byCategory to false when the key is absent", () => {
    // Older blobs predate grouping; missing must open the plain tree, not category headers.
    expect(parseOutlineFilters({ showCompleted: false }).byCategory).toBe(false);
  });

  it("honours an explicit byCategory true", () => {
    expect(parseOutlineFilters({ byCategory: true }).byCategory).toBe(true);
  });
});

describe("isSettledOutlineState", () => {
  it("treats completed and cancelled as settled", () => {
    expect(isSettledOutlineState("completed")).toBe(true);
    expect(isSettledOutlineState("cancelled")).toBe(true);
  });

  it("leaves every open work state visible", () => {
    for (const state of [
      "not_started",
      "in_progress",
      "waiting",
      "postponed",
      "delegated",
      "should_delegate",
      "proposed",
    ] as const) {
      expect(isSettledOutlineState(state)).toBe(false);
    }
  });
});
