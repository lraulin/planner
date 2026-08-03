import { describe, expect, it } from "vitest";
import {
  planSiblingPriorityDrop,
  priorityDropFromPosition,
  type PriorityNode,
} from "./outlinePriority";

function node(
  id: string,
  parentId: string | null,
  letter: PriorityNode["priorityLetter"],
  rank: number | null,
): PriorityNode {
  return { id, parentId, priorityLetter: letter, priorityRank: rank };
}

describe("planSiblingPriorityDrop", () => {
  // Under one parent: Work A2, Financial A3, Relationships unranked — drag Relationships
  // between them. We densify the letter among siblings (same engine as Day / TC Priority),
  // so the list becomes A1 Work, A2 Relationships, A3 Financial rather than leaving a gap
  // at A1 the way raw Achieve ranks can.
  it("inserts between ranked siblings and densifies the letter", () => {
    const parent = "ra";
    const nodes = [
      node("work", parent, "A", 2),
      node("fin", parent, "A", 3),
      node("rel", parent, null, null),
      node("other", "elsewhere", "B", 1),
    ];

    const plan = planSiblingPriorityDrop(nodes, ["rel"], "fin", "before", parent);

    // Diff only — fin already A3 at the right dense slot after insert.
    expect(plan).toEqual([
      { id: "work", letter: "A", rank: 1 },
      { id: "rel", letter: "A", rank: 2 },
    ]);
    expect(plan.find((a) => a.id === "other")).toBeUndefined();
  });

  it("reorders within a letter without touching other letters", () => {
    const parent = "p";
    const nodes = [
      node("a1", parent, "A", 1),
      node("a2", parent, "A", 2),
      node("a3", parent, "A", 3),
      node("b1", parent, "B", 1),
    ];

    // Drag a3 before a2 → a1, a3, a2 densify to A1–A3; B untouched.
    const plan = planSiblingPriorityDrop(nodes, ["a3"], "a2", "before", parent);
    expect(plan).toEqual([
      { id: "a3", letter: "A", rank: 2 },
      { id: "a2", letter: "A", rank: 3 },
    ]);
    expect(plan.find((a) => a.id === "b1")).toBeUndefined();
  });

  it("takes the target letter when crossing letters", () => {
    const parent = "p";
    const nodes = [
      node("a1", parent, "A", 1),
      node("b1", parent, "B", 1),
      node("b2", parent, "B", 2),
    ];

    const plan = planSiblingPriorityDrop(nodes, ["a1"], "b2", "after", parent);
    expect(plan.find((a) => a.id === "a1")).toEqual({
      id: "a1",
      letter: "B",
      rank: 3,
    });
    // A is empty — nothing to compact in the pool besides the move.
  });

  it("unranks when dropping onto an unranked sibling", () => {
    const parent = "p";
    const nodes = [node("a1", parent, "A", 1), node("blank", parent, null, null)];

    const plan = planSiblingPriorityDrop(nodes, ["a1"], "blank", "before", parent);
    expect(plan).toEqual(
      expect.arrayContaining([{ id: "a1", letter: null, rank: null }]),
    );
  });

  it("only considers siblings of the destination parent", () => {
    const nodes = [
      node("root-a", null, "A", 1),
      node("child-a", "root-a", "A", 1),
      node("root-b", null, "A", 2),
    ];

    // Drag root-b before child-a but destination parent is root-a → pool is root-a's kids.
    const plan = planSiblingPriorityDrop(
      nodes,
      ["root-b"],
      "child-a",
      "before",
      "root-a",
    );
    expect(plan.find((a) => a.id === "root-b")).toEqual({
      id: "root-b",
      letter: "A",
      rank: 1,
    });
    expect(plan.find((a) => a.id === "child-a")).toEqual({
      id: "child-a",
      letter: "A",
      rank: 2,
    });
    // Root-level A1 is not in the pool.
    expect(plan.find((a) => a.id === "root-a")).toBeUndefined();
  });

  it("moves a multi-drag block contiguously", () => {
    const parent = "p";
    const nodes = [
      node("a1", parent, "A", 1),
      node("a2", parent, "A", 2),
      node("a3", parent, "A", 3),
      node("a4", parent, "A", 4),
    ];

    const plan = planSiblingPriorityDrop(nodes, ["a3", "a4"], "a1", "after", parent);
    expect(plan.find((a) => a.id === "a3")).toEqual({ id: "a3", letter: "A", rank: 2 });
    expect(plan.find((a) => a.id === "a4")).toEqual({ id: "a4", letter: "A", rank: 3 });
    expect(plan.find((a) => a.id === "a2")).toEqual({ id: "a2", letter: "A", rank: 4 });
  });
});

describe("priorityDropFromPosition", () => {
  it("maps before/after positions to a priority drop", () => {
    expect(priorityDropFromPosition({ at: "before", siblingId: "x" })).toEqual({
      targetId: "x",
      zone: "before",
    });
    expect(priorityDropFromPosition({ at: "after", siblingId: "y" })).toEqual({
      targetId: "y",
      zone: "after",
    });
  });

  it("ignores first/last (reparent slots)", () => {
    expect(priorityDropFromPosition({ at: "first" })).toBeNull();
    expect(priorityDropFromPosition({ at: "last" })).toBeNull();
  });
});
