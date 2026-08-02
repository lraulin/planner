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
    const settings = {
      types: {
        result_area: true,
        goal: true,
        project: false,
        task: true,
      },
      focusOnly: true,
      showCompleted: true,
    };
    expect(parseOutlineFilters(serializeOutlineFilters(settings))).toEqual(settings);
  });

  it("keeps unknown type keys from poisoning the defaults", () => {
    const parsed = parseOutlineFilters({
      types: { goal: false, fantasy: true },
      focusOnly: "yes",
      showCompleted: "nope",
    });
    expect(parsed.types.goal).toBe(false);
    expect(parsed.types.task).toBe(true);
    expect(parsed.focusOnly).toBe(false);
    expect(parsed.showCompleted).toBe(false);
    expect("fantasy" in parsed.types).toBe(false);
  });

  it("honours an explicit false for every type", () => {
    // "Show me nothing" is legal. Replacing it with the default would make the type
    // checkboxes lie about what is on screen.
    const parsed = parseOutlineFilters({
      types: {
        result_area: false,
        goal: false,
        project: false,
        task: false,
      },
    });
    expect(parsed.types).toEqual({
      result_area: false,
      goal: false,
      project: false,
      task: false,
    });
  });

  it("defaults showCompleted to false when the key is absent", () => {
    // Older stored blobs predate this flag; missing means hide done items, not "show
    // everything because we cannot tell".
    const parsed = parseOutlineFilters({
      types: { task: true },
      focusOnly: false,
    });
    expect(parsed.showCompleted).toBe(false);
  });

  it("honours an explicit showCompleted true", () => {
    expect(parseOutlineFilters({ showCompleted: true }).showCompleted).toBe(true);
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
