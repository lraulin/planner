import { describe, expect, it } from "vitest";
import type { ColumnMeta } from "@/components/grid/columns";
import { totalsLayout } from "./groupTotals";

function columns(...ids: string[]): ColumnMeta[] {
  return ids.map((id) => ({ id, label: id, width: "6rem" }));
}

/** Name, then the three money columns Budget totals. */
const budget = columns("name", "assigned", "activity", "balance");

describe("totalsLayout", () => {
  it("spans the whole track when there are no totals", () => {
    expect(totalsLayout(budget, null)).toEqual({ labelSpan: 5, cells: [] });
  });

  it("spans the whole track for an empty totals record", () => {
    // A grid that computes its totals lazily can hand back `{}` before the data lands;
    // collapsing the label to nothing would blank the group name on the way past.
    expect(totalsLayout(budget, {})).toEqual({ labelSpan: 5, cells: [] });
  });

  it("covers every track exactly once, gutter included", () => {
    const layout = totalsLayout(budget, { assigned: 1, activity: 2, balance: 3 });
    expect(layout.labelSpan + layout.cells.length).toBe(budget.length + 1);
  });

  it("gives the label the gutter and every column before the first total", () => {
    // Gutter + name = 2. An off-by-one here parks the first total under the name.
    const layout = totalsLayout(budget, { assigned: 1, activity: 2, balance: 3 });
    expect(layout.labelSpan).toBe(2);
    expect(layout.cells).toEqual(["assigned", "activity", "balance"]);
  });

  it("aligns cells one-to-one with the columns after the label", () => {
    const layout = totalsLayout(budget, { balance: 3 });
    expect(layout.labelSpan).toBe(4);
    expect(budget.slice(layout.labelSpan - 1).map((column) => column.id)).toEqual([
      "balance",
    ]);
    expect(layout.cells).toEqual(["balance"]);
  });

  it("leaves a gap for a column between two totalled ones", () => {
    // The gap must be a null cell, not a missing one, or `yearly` slides left into
    // `monthly`'s column and reads as the wrong period.
    const supplies = columns("name", "biweekly", "note", "yearly");
    const layout = totalsLayout(supplies, { biweekly: 1, yearly: 3 });
    expect(layout.cells).toEqual(["biweekly", null, "yearly"]);
  });

  it("drops a total whose column is hidden rather than shifting the rest left", () => {
    // `activity` hidden from Show Fields: `balance` must stay under Available.
    const shown = columns("name", "assigned", "balance");
    const layout = totalsLayout(shown, { assigned: 1, activity: 2, balance: 3 });
    expect(layout.cells).toEqual(["assigned", "balance"]);
  });

  it("drops a total keyed to a column that does not exist", () => {
    const layout = totalsLayout(budget, { nonesuch: 1 });
    expect(totalsLayout(budget, { nonesuch: 1, balance: 3 }).cells).toEqual([
      "balance",
    ]);
    expect(layout).toEqual({ labelSpan: 5, cells: [] });
  });

  it("keeps the first column for the label even when a total is keyed to it", () => {
    const layout = totalsLayout(budget, { name: "x", balance: 3 });
    expect(layout.labelSpan).toBe(4);
    expect(layout.cells).toEqual(["balance"]);
  });

  it("handles a grid with a single column", () => {
    expect(totalsLayout(columns("name"), { name: 1 })).toEqual({
      labelSpan: 2,
      cells: [],
    });
  });
});
