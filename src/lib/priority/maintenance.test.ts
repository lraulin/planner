import { describe, expect, it } from "vitest";
import { removePriorityGaps, reprioritizeUnique } from "./maintenance";

describe("outline priority maintenance", () => {
  it("removes gaps without changing letters, bare priorities, or relative order", () => {
    const result = removePriorityGaps([
      { id: "a3", priorityLetter: "A", priorityRank: 3 },
      { id: "bare", priorityLetter: "A", priorityRank: null },
      { id: "a1", priorityLetter: "A", priorityRank: 1 },
      { id: "b4", priorityLetter: "B", priorityRank: 4 },
      { id: "b2", priorityLetter: "B", priorityRank: 2 },
    ]);

    expect(result).toEqual([
      { id: "a3", letter: "A", rank: 2 },
      { id: "b2", letter: "B", rank: 1 },
      { id: "b4", letter: "B", rank: 2 },
    ]);
  });

  it("makes one ranked priority unique and shifts only its letter group", () => {
    expect(
      reprioritizeUnique(
        [
          { id: "a2", priorityLetter: "A", priorityRank: 2 },
          { id: "a1", priorityLetter: "A", priorityRank: 1 },
          { id: "bare", priorityLetter: "A", priorityRank: null },
          { id: "b1", priorityLetter: "B", priorityRank: 1 },
        ],
        "a2",
      ),
    ).toEqual([
      { id: "a2", letter: "A", rank: 1 },
      { id: "a1", letter: "A", rank: 2 },
    ]);
  });

  it("does nothing for an unprioritized selection", () => {
    expect(
      reprioritizeUnique([{ id: "x", priorityLetter: null, priorityRank: null }], "x"),
    ).toEqual([]);
  });
});
