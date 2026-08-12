import { describe, expect, it } from "vitest";
import {
  asGridGroupBy,
  knownGroupBy,
  MAX_GROUP_LEVELS,
  NOTE_GROUP_BY_VALUES,
  setGroupLevel,
  TREE_GROUP_BY_VALUES,
} from "./grouping";

describe("knownGroupBy", () => {
  it("keeps only dimensions the caller knows, in order, capped at three", () => {
    expect(
      knownGroupBy(
        ["state", "bogus", "state", "priorityLetter", "category", "project"],
        TREE_GROUP_BY_VALUES,
      ),
    ).toEqual(["state", "priorityLetter", "category"]);
  });

  it("returns an empty list for empty or fully unknown input", () => {
    expect(knownGroupBy([], TREE_GROUP_BY_VALUES)).toEqual([]);
    expect(knownGroupBy(["nope", "also-nope"], NOTE_GROUP_BY_VALUES)).toEqual([]);
  });
});

describe("asGridGroupBy", () => {
  it("accepts tree and note dimensions and drops the rest", () => {
    expect(asGridGroupBy(["category", "year", "account", "not-a-dim"])).toEqual([
      "category",
      "year",
      "account",
    ]);
  });
});

describe("setGroupLevel", () => {
  it("sets, stacks, clears (truncating below), and moves a duplicate", () => {
    expect(setGroupLevel([], 0, "state")).toEqual(["state"]);
    expect(setGroupLevel(["state"], 1, "priorityLetter")).toEqual([
      "state",
      "priorityLetter",
    ]);
    expect(setGroupLevel(["state", "priorityLetter"], 0, null)).toEqual([]);
    // Picking a dimension already in use moves it rather than nesting a no-op.
    expect(setGroupLevel(["state", "priorityLetter"], 0, "priorityLetter")).toEqual([
      "priorityLetter",
    ]);
  });

  it("never exceeds MAX_GROUP_LEVELS", () => {
    const three = setGroupLevel(
      setGroupLevel(setGroupLevel([], 0, "category"), 1, "state"),
      2,
      "priorityLetter",
    );
    expect(three).toHaveLength(MAX_GROUP_LEVELS);
    expect(setGroupLevel(three, 3, "project")).toEqual(three);
  });
});
