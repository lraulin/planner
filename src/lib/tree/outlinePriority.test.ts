import { describe, expect, it } from "vitest";
import {
  planOutlinePriorityMove,
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

describe("dropping at a letter boundary", () => {
  // Between the last A and the first B there are two slots, not one, and they mean different
  // things. Achieve offers both and so must we, or the only way to become the last A would be
  // to become a B first and drag back.
  const parent = "ra";
  const rows = () => [
    node("a1", parent, "A", 1),
    node("a2", parent, "A", 2),
    node("b1", parent, "B", 1),
    node("b2", parent, "B", 2),
    node("mover", parent, null, null),
  ];

  it("after the last A appends to A, leaving the Bs alone", () => {
    expect(planSiblingPriorityDrop(rows(), ["mover"], "a2", "after", parent)).toEqual([
      { id: "mover", letter: "A", rank: 3 },
    ]);
  });

  it("before the first B joins B at rank 1 and pushes the Bs down", () => {
    expect(planSiblingPriorityDrop(rows(), ["mover"], "b1", "before", parent)).toEqual([
      { id: "mover", letter: "B", rank: 1 },
      { id: "b1", letter: "B", rank: 2 },
      { id: "b2", letter: "B", rank: 3 },
    ]);
  });

  it("moves a row across the boundary, closing the letter it left", () => {
    // a1 becomes the last B; A closes up behind it so no rank is skipped.
    expect(planSiblingPriorityDrop(rows(), ["a1"], "b2", "after", parent)).toEqual([
      { id: "a1", letter: "B", rank: 3 },
      { id: "a2", letter: "A", rank: 1 },
    ]);
  });
});

describe("planOutlinePriorityMove", () => {
  const OLD = "old";
  const NEW = "new";

  /** Three A's under `old`, two under `new`. `b2` is the node that moves. */
  function groups() {
    return {
      source: [
        node("a1", OLD, "A", 1),
        node("b2", OLD, "A", 2),
        node("c3", OLD, "A", 3),
      ],
      destination: [node("x1", NEW, "A", 1), node("x2", NEW, "A", 2)],
    };
  }

  it("carries the letter to the end of it under the new parent, and closes the old gap", () => {
    const { source, destination } = groups();

    const plan = planOutlinePriorityMove({
      source,
      destination,
      nodeId: "b2",
      destinationParentId: NEW,
    });

    // A2 vacated under `old`, so c3 slides up; b2 lands after the destination's existing As.
    expect(plan).toEqual([
      { id: "c3", letter: "A", rank: 2 },
      { id: "b2", letter: "A", rank: 3 },
    ]);
  });

  it("leaves an unprioritized node alone — a structural move is not a priority claim", () => {
    const source = [node("a1", OLD, "A", 1), node("plain", OLD, null, null)];

    expect(
      planOutlinePriorityMove({
        source,
        destination: [node("x1", NEW, "A", 1)],
        nodeId: "plain",
        destinationParentId: NEW,
      }),
    ).toEqual([]);
  });

  it("does nothing when the parent has not changed and no placement was given", () => {
    // Outline order and priority are independent: sliding a row up the outline says nothing
    // about its rank, so Move Up must not silently reprioritize.
    const { source } = groups();

    expect(
      planOutlinePriorityMove({
        source,
        destination: source,
        nodeId: "b2",
        destinationParentId: OLD,
      }),
    ).toEqual([]);
  });

  it("takes the slot a drag names, within one parent", () => {
    const { source } = groups();

    expect(
      planOutlinePriorityMove({
        source,
        destination: source,
        nodeId: "c3",
        destinationParentId: OLD,
        placement: { targetId: "a1", zone: "before" },
      }),
    ).toEqual([
      { id: "c3", letter: "A", rank: 1 },
      { id: "a1", letter: "A", rank: 2 },
      { id: "b2", letter: "A", rank: 3 },
    ]);
  });

  it("closes the old gap as well when a drag crosses parents", () => {
    const { source, destination } = groups();

    const plan = planOutlinePriorityMove({
      source,
      destination,
      nodeId: "b2",
      destinationParentId: NEW,
      placement: { targetId: "x1", zone: "before" },
    });

    // Landing first under `new` pushes x1/x2 down; `old` closes the hole b2 left at A2.
    expect(plan).toEqual([
      { id: "b2", letter: "A", rank: 1 },
      { id: "x1", letter: "A", rank: 2 },
      { id: "x2", letter: "A", rank: 3 },
      { id: "c3", letter: "A", rank: 2 },
    ]);
  });

  it("unprioritizes a node dropped beside an unprioritized row", () => {
    const { source } = groups();
    const destination = [node("loose", NEW, null, null)];

    const plan = planOutlinePriorityMove({
      source,
      destination,
      nodeId: "b2",
      destinationParentId: NEW,
      placement: { targetId: "loose", zone: "after" },
    });

    expect(plan).toContainEqual({ id: "b2", letter: null, rank: null });
    // And the letter it left still closes up.
    expect(plan).toContainEqual({ id: "c3", letter: "A", rank: 2 });
  });
});
