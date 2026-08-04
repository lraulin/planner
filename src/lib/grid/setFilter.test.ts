import { describe, expect, it } from "vitest";
import type { ColumnValues } from "./distinct";
import {
  buildSetFilterEntries,
  onlySelection,
  selectAllState,
  toggleSetEntry,
  type SetFilterEntry,
} from "./setFilter";

/**
 * The set filter decides what a user can see and how they say so. The mistakes it can make
 * all look like data problems rather than UI ones: a tick that filters the wrong way, a
 * value that vanishes from the list, or a selection that quietly excludes rows added later.
 */

function values(counts: Record<string, number>, blanks = 0): ColumnValues {
  return { counts: new Map(Object.entries(counts)), blanks };
}

const STATES = values({ NS: 12, IP: 4, C: 7 }, 2);

const LABELS: Record<string, string> = {
  NS: "Not started",
  IP: "In progress",
  C: "Completed",
};
const labelOf = (value: string) => LABELS[value] ?? value;

function build(selectedIds: string[] = [], search = "") {
  return buildSetFilterEntries({ values: STATES, selectedIds, labelOf, search });
}

describe("buildSetFilterEntries", () => {
  it("returns nothing for a column with no values collected", () => {
    expect(buildSetFilterEntries({ values: undefined, selectedIds: [] })).toEqual([]);
  });

  it("labels each value and carries its count", () => {
    expect(build().map((e) => [e.label, e.count])).toEqual([
      ["Completed", 7],
      ["In progress", 4],
      ["Not started", 12],
      ["(Blanks)", 2],
    ]);
  });

  /**
   * The State column filters on Achieve's codes because that is what the cell shows, but a
   * checklist of `NS / IP / C` is not something anyone picks from.
   */
  it("keeps the stored value in the option id while showing the label", () => {
    const started = build().find((e) => e.label === "In progress");
    expect(started?.optionId).toBe("value:IP");
  });

  it("sorts by label and puts (Blanks) last", () => {
    const labels = build().map((e) => e.label);
    expect(labels[labels.length - 1]).toBe("(Blanks)");
    expect(labels.slice(0, -1)).toEqual(["Completed", "In progress", "Not started"]);
  });

  it("omits (Blanks) when no row is blank", () => {
    const entries = buildSetFilterEntries({
      values: values({ NS: 1 }),
      selectedIds: [],
    });
    expect(entries.map((e) => e.label)).toEqual(["NS"]);
  });

  /**
   * Nothing selected means nothing is filtered out, so every value is on screen. Drawing
   * them unticked would say the opposite of what the grid is doing.
   */
  it("shows every entry ticked when the selection is empty", () => {
    expect(build().every((e) => e.selected)).toBe(true);
    expect(build(["all"]).every((e) => e.selected)).toBe(true);
  });

  it("ticks exactly the selected entries once something is chosen", () => {
    const entries = build(["value:IP"]);
    expect(entries.filter((e) => e.selected).map((e) => e.label)).toEqual([
      "In progress",
    ]);
  });

  it("searches the label, not the stored value", () => {
    expect(build([], "progress").map((e) => e.label)).toEqual(["In progress"]);
    // "IP" is the stored value; searching it should not be how you find the row.
    expect(build([], "IP").map((e) => e.label)).toEqual([]);
  });

  it("searches case-insensitively and ignores surrounding space", () => {
    expect(build([], "  COMPLETED ").map((e) => e.label)).toEqual(["Completed"]);
  });

  it("returns everything for a blank query", () => {
    expect(build([], "   ")).toHaveLength(4);
  });
});

describe("selectAllState", () => {
  it("is all only when nothing is filtered out", () => {
    expect(selectAllState(build())).toBe("all");
    expect(selectAllState(build(["value:IP"]))).toBe("some");
  });
});

describe("toggleSetEntry", () => {
  const all = build();

  /**
   * The first untick has to name every *other* value, because the stored model lists what
   * to keep. Without this, unticking one state from "everything showing" would select only
   * that state — the exact opposite of the click.
   */
  it("unticking from everything-showing keeps the rest", () => {
    expect(toggleSetEntry(all, [], "value:IP").sort()).toEqual(
      ["blanks", "value:C", "value:NS"].sort(),
    );
  });

  it("unticks a second entry from a partial selection", () => {
    const after = toggleSetEntry(all, ["value:NS", "value:C"], "value:C");
    expect(after).toEqual(["value:NS"]);
  });

  it("ticks an entry back on", () => {
    expect(toggleSetEntry(all, ["value:NS"], "value:C").sort()).toEqual(
      ["value:C", "value:NS"].sort(),
    );
  });

  /**
   * Collapsing a full selection back to "unfiltered" is not tidiness: a stored list naming
   * every value that existed at the time would silently exclude any value added later.
   */
  it("collapses to unfiltered once every entry is ticked", () => {
    const nearlyAll = ["value:NS", "value:IP", "value:C"];
    expect(toggleSetEntry(all, nearlyAll, "blanks")).toEqual([]);
  });

  /**
   * Unticking the last remaining entry would leave an empty list, which the model reads as
   * "show everything" — again the opposite of the click. Keep it selected instead.
   */
  it("refuses to leave nothing selected", () => {
    expect(toggleSetEntry(all, ["value:IP"], "value:IP")).toEqual(["value:IP"]);
  });

  it("ignores a stale (All) marker in the stored ids", () => {
    expect(toggleSetEntry(all, ["all"], "value:IP").sort()).toEqual(
      ["blanks", "value:C", "value:NS"].sort(),
    );
  });

  /**
   * Search hides rows from the list but must not drop them from the selection — the
   * candidate set is every entry, not the filtered view.
   */
  it("is computed against every entry, not the searched subset", () => {
    const visible: SetFilterEntry[] = build([], "progress");
    expect(visible).toHaveLength(1);
    expect(toggleSetEntry(all, [], "value:IP")).toHaveLength(3);
  });
});

describe("onlySelection", () => {
  it("reduces the selection to one value", () => {
    expect(onlySelection("value:IP")).toEqual(["value:IP"]);
  });
});
