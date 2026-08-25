import { describe, expect, it } from "vitest";
import {
  applySelect,
  moveSelection,
  neighborAfterRemoval,
  pruneSelection,
  rangeIds,
  selectAll,
  selectAllHeaderState,
  selectOnly,
  selectionMoveRoots,
  toggleSelectAll,
} from "./selection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("rangeIds", () => {
  it("returns an inclusive range in display order either direction", () => {
    expect(rangeIds(ORDER, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(ORDER, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("returns a single id when the ends match", () => {
    expect(rangeIds(ORDER, "c", "c")).toEqual(["c"]);
  });
});

describe("applySelect", () => {
  it("replaces the selection on a plain click", () => {
    const result = applySelect(new Set(["a", "b"]), "a", "b", "d", ORDER, {});
    expect([...result.selectedIds]).toEqual(["d"]);
    expect(result.focusId).toBe("d");
    expect(result.anchorId).toBe("d");
  });

  it("extends a range from the anchor with Shift", () => {
    const result = applySelect(new Set(["b"]), "b", "b", "d", ORDER, {
      extend: true,
    });
    expect([...result.selectedIds].sort()).toEqual(["b", "c", "d"]);
    expect(result.anchorId).toBe("b");
    expect(result.focusId).toBe("d");
  });

  it("toggles membership with ⌘/Ctrl without clearing the rest", () => {
    const result = applySelect(new Set(["a", "c"]), "a", "c", "e", ORDER, {
      toggle: true,
    });
    expect([...result.selectedIds].sort()).toEqual(["a", "c", "e"]);
    expect(result.focusId).toBe("e");
  });

  it("refuses to leave the selection empty on a toggle-off", () => {
    const result = applySelect(new Set(["c"]), "c", "c", "c", ORDER, {
      toggle: true,
    });
    expect([...result.selectedIds]).toEqual(["c"]);
  });

  it("clears the last row when empty is allowed", () => {
    const result = applySelect(
      new Set(["c"]),
      "c",
      "c",
      "c",
      ORDER,
      {
        toggle: true,
      },
      { allowEmpty: true },
    );
    expect([...result.selectedIds]).toEqual([]);
    expect(result.focusId).toBeNull();
  });
});

describe("moveSelection", () => {
  it("moves focus and replaces selection without Shift", () => {
    const result = moveSelection(ORDER, "b", "b", new Set(["b"]), 1, false);
    expect([...result.selectedIds]).toEqual(["c"]);
    expect(result.focusId).toBe("c");
  });

  it("grows the range with Shift", () => {
    const result = moveSelection(ORDER, "b", "b", new Set(["b"]), 2, true);
    expect([...result.selectedIds].sort()).toEqual(["b", "c", "d"]);
    expect(result.anchorId).toBe("b");
    expect(result.focusId).toBe("d");
  });
});

describe("neighborAfterRemoval", () => {
  it("prefers the still-visible neighbour above the vanished row", () => {
    expect(neighborAfterRemoval(ORDER, ["a", "b", "d", "e"], "c")).toBe("b");
  });

  it("takes the neighbour below when nothing above survived", () => {
    expect(neighborAfterRemoval(ORDER, ["b", "c", "d", "e"], "a")).toBe("b");
  });

  it("skips a hole of vanished rows to the last still-visible above it", () => {
    expect(neighborAfterRemoval(ORDER, ["a", "e"], "d")).toBe("a");
  });

  it("returns null when the vanished id was never on the previous list", () => {
    expect(neighborAfterRemoval(ORDER, ORDER, "gone")).toBeNull();
  });
});

describe("pruneSelection", () => {
  it("drops ids that left the ordered list and keeps a sensible focus", () => {
    const result = pruneSelection(["a", "c", "e"], new Set(["b", "c", "d"]), "b", "b");
    expect([...result.selectedIds].sort()).toEqual(["c"]);
    expect(result.focusId).toBe("c");
  });

  it("falls back to the first visible row when the vanished id was never listed", () => {
    const result = pruneSelection(ORDER, new Set(["gone"]), "gone", "gone");
    expect([...result.selectedIds]).toEqual(["a"]);
  });

  it("moves focus to the row above a completed or filtered-out item", () => {
    // The plausible mistake: looking up the vanished id in the *new* list, missing
    // it, and selecting the first row — which then scrollIntoView-jumps to the top.
    const result = pruneSelection(
      ["a", "b", "d", "e"],
      new Set(["c"]),
      "c",
      "c",
      ORDER,
    );
    expect(result.focusId).toBe("b");
    expect([...result.selectedIds]).toEqual(["b"]);
  });

  it("moves focus to the next row when the first item disappears", () => {
    const result = pruneSelection(
      ["b", "c", "d", "e"],
      new Set(["a"]),
      "a",
      "a",
      ORDER,
    );
    expect(result.focusId).toBe("b");
  });

  it("moves focus to the row above when the last item disappears", () => {
    const result = pruneSelection(
      ["a", "b", "c", "d"],
      new Set(["e"]),
      "e",
      "e",
      ORDER,
    );
    expect(result.focusId).toBe("d");
  });

  it("clears the selection when the last visible row disappears", () => {
    const result = pruneSelection([], new Set(["a"]), "a", "a", ["a"]);
    expect([...result.selectedIds]).toEqual([]);
    expect(result.focusId).toBeNull();
  });
});

describe("selectOnly", () => {
  it("clears when given null", () => {
    expect([...selectOnly(null).selectedIds]).toEqual([]);
    expect(selectOnly(null).focusId).toBeNull();
  });
});

describe("selectAll", () => {
  it("selects every navigable id and keeps a still-visible focus", () => {
    const result = selectAll(ORDER, "c");
    expect([...result.selectedIds]).toEqual(ORDER);
    expect(result.focusId).toBe("c");
    expect(result.anchorId).toBe("c");
  });

  it("lands on the first row when focus is not on screen", () => {
    const result = selectAll(ORDER, "gone");
    expect(result.focusId).toBe("a");
    expect(result.selectedIds.size).toBe(5);
  });

  it("handles an empty list", () => {
    const result = selectAll([], "a");
    expect([...result.selectedIds]).toEqual([]);
    expect(result.focusId).toBeNull();
  });

  it("selects a long list the way a virtualized register would pass it", () => {
    const many = Array.from({ length: 200 }, (_, i) => String(i));
    const result = selectAll(many, "3");
    expect(result.selectedIds.size).toBe(200);
    expect(result.selectedIds.has("199")).toBe(true);
    expect(result.focusId).toBe("3");
  });
});

describe("selectAllHeaderState", () => {
  it("is all when every navigable id is selected", () => {
    expect(selectAllHeaderState(ORDER, new Set(ORDER))).toBe("all");
  });

  it("is none on a never-empty grid when only the focus is selected", () => {
    expect(selectAllHeaderState(ORDER, new Set(["c"]))).toBe("none");
  });

  it("is some when more than the focus is selected but not all", () => {
    expect(selectAllHeaderState(ORDER, new Set(["a", "b", "c"]))).toBe("some");
  });

  it("treats a real empty set as none when empty is allowed", () => {
    expect(selectAllHeaderState(ORDER, new Set(), { allowEmpty: true })).toBe("none");
  });

  it("treats a single selected row as some when empty is allowed", () => {
    expect(selectAllHeaderState(ORDER, new Set(["c"]), { allowEmpty: true })).toBe(
      "some",
    );
  });

  it("is none on an empty list", () => {
    expect(selectAllHeaderState([], new Set())).toBe("none");
  });
});

describe("toggleSelectAll", () => {
  it("selects all from a lone focus on a never-empty grid", () => {
    const result = toggleSelectAll(ORDER, new Set(["b"]), "b");
    expect([...result.selectedIds]).toEqual(ORDER);
    expect(result.focusId).toBe("b");
  });

  it("collapses to the focus row when everything is already selected", () => {
    const result = toggleSelectAll(ORDER, new Set(ORDER), "d");
    expect([...result.selectedIds]).toEqual(["d"]);
    expect(result.focusId).toBe("d");
  });

  it("clears entirely on an allowEmpty grid that is fully selected", () => {
    const result = toggleSelectAll(ORDER, new Set(ORDER), "a", {
      allowEmpty: true,
    });
    expect([...result.selectedIds]).toEqual([]);
    expect(result.focusId).toBeNull();
  });

  it("selects all from empty when empty is allowed", () => {
    const result = toggleSelectAll(ORDER, new Set(), null, { allowEmpty: true });
    expect(result.selectedIds.size).toBe(5);
    expect(result.focusId).toBe("a");
  });

  it("selects all from a partial (some) selection", () => {
    const result = toggleSelectAll(ORDER, new Set(["a", "b"]), "b");
    expect(result.selectedIds.size).toBe(5);
  });
});

describe("selectionMoveRoots", () => {
  // a
  //   b
  //     c
  //   d
  // e
  const parentOf: Record<string, string | null> = {
    a: null,
    b: "a",
    c: "b",
    d: "a",
    e: null,
  };
  const order = ["a", "b", "c", "d", "e"];
  const parentIdOf = (id: string) => parentOf[id] ?? null;

  it("keeps every selected id when none is an ancestor of another", () => {
    expect(selectionMoveRoots(new Set(["b", "e"]), order, parentIdOf)).toEqual([
      "b",
      "e",
    ]);
  });

  it("drops a child when its ancestor is also selected", () => {
    expect(
      selectionMoveRoots(new Set(["a", "b", "c", "d"]), order, parentIdOf),
    ).toEqual(["a"]);
  });

  it("preserves display order among roots", () => {
    expect(selectionMoveRoots(new Set(["e", "d", "b"]), order, parentIdOf)).toEqual([
      "b",
      "d",
      "e",
    ]);
  });
});
