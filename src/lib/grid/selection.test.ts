import { describe, expect, it } from "vitest";
import {
  applySelect,
  moveSelection,
  neighborAfterRemoval,
  pruneSelection,
  rangeIds,
  selectOnly,
  selectionMoveRoots,
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
