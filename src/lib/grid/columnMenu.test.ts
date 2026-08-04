import { describe, expect, it } from "vitest";
import { columnMenuState, reorderByHeaderDrag } from "./columnMenu";

const ORDER = ["name", "priority", "deadline"];

function stateFor(
  columnId: string,
  overrides: Partial<Parameters<typeof columnMenuState>[0]> = {},
) {
  return columnMenuState({
    columnId,
    order: ORDER,
    sortable: true,
    sorts: [],
    widths: {},
    ...overrides,
  });
}

describe("columnMenuState", () => {
  it("offers each sort direction only when the column does not already have it", () => {
    const unsorted = stateFor("priority");
    expect(unsorted.sortDirection).toBeNull();
    expect(unsorted.canSortAscending).toBe(true);
    expect(unsorted.canSortDescending).toBe(true);
    expect(unsorted.canClearSort).toBe(false);

    const ascending = stateFor("priority", {
      sorts: [{ columnId: "priority", direction: "asc" }],
    });
    expect(ascending.sortDirection).toBe("asc");
    expect(ascending.canSortAscending).toBe(false);
    expect(ascending.canSortDescending).toBe(true);
    expect(ascending.canClearSort).toBe(true);
  });

  it("reads this column's key out of a multi-key sort, not just the primary", () => {
    const state = stateFor("deadline", {
      sorts: [
        { columnId: "priority", direction: "asc" },
        { columnId: "deadline", direction: "desc" },
      ],
    });
    expect(state.sortDirection).toBe("desc");
    expect(state.canClearSort).toBe(true);
  });

  it("never offers sorting a column that cannot sort", () => {
    const state = stateFor("name", { sortable: false });
    expect(state.canSortAscending).toBe(false);
    expect(state.canSortDescending).toBe(false);
  });

  it("stops moving at the ends of the visible order", () => {
    expect(stateFor("name").canMoveLeft).toBe(false);
    expect(stateFor("name").canMoveRight).toBe(true);
    expect(stateFor("deadline").canMoveLeft).toBe(true);
    expect(stateFor("deadline").canMoveRight).toBe(false);
    expect(stateFor("priority").canMoveLeft).toBe(true);
    expect(stateFor("priority").canMoveRight).toBe(true);
  });

  it("refuses to hide a locked column or the only one left", () => {
    expect(stateFor("priority").canHide).toBe(true);
    expect(stateFor("name", { hideable: false }).canHide).toBe(false);
    expect(stateFor("name", { order: ["name"] }).canHide).toBe(false);
  });

  it("offers Reset width only where a width override exists", () => {
    expect(stateFor("priority").canResetWidth).toBe(false);
    expect(stateFor("priority", { widths: { priority: 120 } }).canResetWidth).toBe(
      true,
    );
    expect(stateFor("priority", { widths: { deadline: 120 } }).canResetWidth).toBe(
      false,
    );
  });

  it("treats a column missing from the visible order as immovable", () => {
    const state = stateFor("effort");
    expect(state.canMoveLeft).toBe(false);
    expect(state.canMoveRight).toBe(false);
    expect(state.canHide).toBe(false);
  });
});

describe("reorderByHeaderDrag", () => {
  it("drops before the hovered column from its left half and after from its right", () => {
    expect(reorderByHeaderDrag(ORDER, "deadline", 0, false)).toEqual([
      "deadline",
      "name",
      "priority",
    ]);
    expect(reorderByHeaderDrag(ORDER, "deadline", 0, true)).toEqual([
      "name",
      "deadline",
      "priority",
    ]);
  });

  it("moves a column rightward without overshooting by one", () => {
    // Drag `name` past `priority`: it should land between priority and deadline, not after
    // deadline. This is the off-by-one that list-including drop slots exist to prevent.
    expect(reorderByHeaderDrag(ORDER, "name", 1, true)).toEqual([
      "priority",
      "name",
      "deadline",
    ]);
    expect(reorderByHeaderDrag(ORDER, "name", 2, true)).toEqual([
      "priority",
      "deadline",
      "name",
    ]);
  });

  it("is a no-op when a column is dropped on either half of its own header", () => {
    expect(reorderByHeaderDrag(ORDER, "priority", 1, false)).toEqual(ORDER);
    expect(reorderByHeaderDrag(ORDER, "priority", 1, true)).toEqual(ORDER);
  });
});
