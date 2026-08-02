import { describe, expect, it } from "vitest";
import {
  applySelect,
  moveSelection,
  pruneSelection,
  rangeIds,
  selectOnly,
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

describe("pruneSelection", () => {
  it("drops ids that left the ordered list and keeps a sensible focus", () => {
    const result = pruneSelection(["a", "c", "e"], new Set(["b", "c", "d"]), "b", "b");
    expect([...result.selectedIds].sort()).toEqual(["c"]);
    expect(result.focusId).toBe("c");
  });

  it("falls back to the first visible row when everything is gone", () => {
    const result = pruneSelection(ORDER, new Set(["gone"]), "gone", "gone");
    expect([...result.selectedIds]).toEqual(["a"]);
  });
});

describe("selectOnly", () => {
  it("clears when given null", () => {
    expect([...selectOnly(null).selectedIds]).toEqual([]);
    expect(selectOnly(null).focusId).toBeNull();
  });
});
