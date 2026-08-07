import { describe, expect, it } from "vitest";
import { matchesFilter } from "./filters";
import { STATE_CODES, STATE_LABELS } from "@/lib/tree/hierarchy";
import {
  OPEN_STATES,
  SETTLED_STATES,
  openStateFilters,
  settledStateFilters,
  stateFilter,
} from "./stateFilters";

describe("OPEN_STATES / SETTLED_STATES", () => {
  it("partition every state exactly once", () => {
    const all = Object.keys(STATE_LABELS).sort();
    expect([...OPEN_STATES, ...SETTLED_STATES].sort()).toEqual(all);
  });

  it("settle exactly completed and cancelled", () => {
    expect([...SETTLED_STATES].sort()).toEqual(["cancelled", "completed"]);
  });
});

describe("stateFilter", () => {
  it("ticks the codes the narrow State column stores", () => {
    const filter = stateFilter(["not_started", "completed"], "code");
    expect(filter).toEqual({ mode: "options", ids: ["value:NS", "value:C"] });
  });

  it("ticks the labels the wide State column stores", () => {
    const filter = stateFilter(["not_started"], "label");
    expect(filter).toEqual({ mode: "options", ids: ["value:Not started"] });
  });
});

describe("matching against the real filter engine", () => {
  const open = openStateFilters("abbrState", "code").abbrState;
  const settled = settledStateFilters("abbrState", "code").abbrState;

  function passes(filter: typeof open, state: keyof typeof STATE_CODES): boolean {
    return matchesFilter(STATE_CODES[state], filter, "enum", null);
  }

  it("keeps open work and drops finished work", () => {
    expect(passes(open, "not_started")).toBe(true);
    expect(passes(open, "in_progress")).toBe(true);
    expect(passes(open, "waiting")).toBe(true);
    expect(passes(open, "postponed")).toBe(true);
    expect(passes(open, "delegated")).toBe(true);
    expect(passes(open, "should_delegate")).toBe(true);
    expect(passes(open, "proposed")).toBe(true);
    expect(passes(open, "completed")).toBe(false);
    expect(passes(open, "cancelled")).toBe(false);
  });

  it("is exactly inverted by the settled filter", () => {
    for (const state of Object.keys(STATE_CODES) as (keyof typeof STATE_CODES)[]) {
      expect(passes(settled, state)).toBe(!passes(open, state));
    }
  });

  it("is an *active* filter, so it shows as a chip and can be cleared", () => {
    // A default the user cannot see is the thing this whole mechanism exists to avoid.
    expect(matchesFilter("C", open, "enum", null)).toBe(false);
  });

  it("uses the encoding the column stores, not the one that reads best", () => {
    // The wide column filters on labels; feeding it codes would match nothing and empty
    // the grid with a chip on screen insisting it was only hiding two states.
    const byLabel = openStateFilters("state", "label").state;
    expect(matchesFilter(STATE_LABELS.not_started, byLabel, "enum", null)).toBe(true);
    expect(matchesFilter(STATE_CODES.not_started, byLabel, "enum", null)).toBe(false);
  });
});
