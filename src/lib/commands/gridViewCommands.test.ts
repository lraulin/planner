import { describe, expect, it, vi } from "vitest";
import {
  clearFiltersRefusal,
  dualGridViewCommands,
  gridViewLayoutCommands,
} from "./gridViewCommands";

const BILLS = { id: "bills", label: "Subscriptions & bills" } as const;
const SPEND = { id: "spend", label: "Recurring spend" } as const;

function actions(active = true) {
  return {
    openFilter: vi.fn(),
    clearFilters: vi.fn(),
    openFields: vi.fn(),
    reset: vi.fn(),
    filtersActive: active,
    resetTitle: "Clear filters, sort, column layout, grouping and density",
  };
}

describe("clearFiltersRefusal", () => {
  it("is silent when something is filtered", () => {
    expect(clearFiltersRefusal(true)).toBeNull();
  });

  it("names the grid when it can", () => {
    expect(clearFiltersRefusal(false, "Subscriptions & bills")).toBe(
      "No filters on Subscriptions & bills",
    );
    expect(clearFiltersRefusal(false)).toBe("No filters on this grid");
  });
});

describe("gridViewLayoutCommands", () => {
  it("keeps unscoped ids on a lone grid", () => {
    const list = gridViewLayoutCommands(actions());
    expect(list.map((command) => command.id)).toEqual([
      "view.filter",
      "view.clear-filters",
      "view.fields",
      "view.reset",
    ]);
    expect(list[0]?.label).toBe("Filter…");
  });

  it("stamps the grid into the id and the label when scoped", () => {
    const list = gridViewLayoutCommands(actions(), BILLS);
    expect(list.map((command) => command.id)).toEqual([
      "view.filter.bills",
      "view.clear-filters.bills",
      "view.fields.bills",
      "view.reset.bills",
    ]);
    expect(list[0]?.label).toBe("Filter for Subscriptions & bills…");
    expect(list[1]?.label).toBe("Clear filters for Subscriptions & bills");
  });

  it("disables Clear filters with the specific reason", () => {
    const idle = gridViewLayoutCommands(actions(false));
    expect(idle[1]).toMatchObject({
      id: "view.clear-filters",
      disabled: true,
      title: "No filters on this grid",
    });
    const scoped = gridViewLayoutCommands(actions(false), BILLS);
    expect(scoped[1]).toMatchObject({
      disabled: true,
      title: "No filters on Subscriptions & bills",
    });
  });
});

describe("dualGridViewCommands", () => {
  it("puts the focused shortcut first, then each grid's named rows", () => {
    const bills = { ...actions(true), scope: BILLS };
    const spend = { ...actions(false), scope: SPEND };
    const list = dualGridViewCommands({ ...actions(true), label: BILLS.label }, [
      bills,
      spend,
    ]);
    expect(list.map((command) => command.id)).toEqual([
      "view.filter",
      "view.clear-filters",
      "view.fields",
      "view.reset",
      "view.filter.bills",
      "view.clear-filters.bills",
      "view.fields.bills",
      "view.reset.bills",
      "view.filter.spend",
      "view.clear-filters.spend",
      "view.fields.spend",
      "view.reset.spend",
    ]);
    expect(list[0]?.title).toBe("Filter the Subscriptions & bills grid");
    expect(
      list.find((command) => command.id === "view.clear-filters.spend"),
    ).toMatchObject({
      disabled: true,
      title: "No filters on Recurring spend",
    });
  });
});
