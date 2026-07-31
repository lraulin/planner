import { describe, expect, it } from "vitest";
import {
  compareTcPriority,
  itemsInLetter,
  planTcAssign,
  planTcClear,
  planTcDrop,
  planTcDropOnLetter,
  type TcAssignment,
} from "./tcPriority";
import type { PriorityLetter } from "@/db/schema";

type Ranked = {
  id: string;
  tcPriorityLetter: PriorityLetter | null;
  tcPriorityRank: number | null;
};

/** `at("A1")` → an item ranked A1, named for its rank so assertions read plainly. */
function at(spec: string): Ranked {
  const letter = spec[0] as PriorityLetter;
  return { id: spec, tcPriorityLetter: letter, tcPriorityRank: Number(spec.slice(1)) };
}

function unranked(id: string): Ranked {
  return { id, tcPriorityLetter: null, tcPriorityRank: null };
}

/**
 * Apply assignments to a node list, so tests assert on the resulting **order** rather than
 * on the shape of the diff. That keeps them honest about behaviour instead of pinning the
 * minimal-write optimisation.
 */
function applied(nodes: Ranked[], assignments: TcAssignment[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, { ...node }]));
  for (const a of assignments) {
    const node = byId.get(a.nodeId)!;
    node.tcPriorityLetter = a.letter;
    node.tcPriorityRank = a.rank;
  }
  return [...byId.values()]
    .filter((node) => node.tcPriorityLetter !== null)
    .sort(compareTcPriority)
    .map((node) => `${node.id}→${node.tcPriorityLetter}${node.tcPriorityRank}`);
}

describe("compareTcPriority", () => {
  it("orders by letter, then rank", () => {
    const list = [at("B1"), at("A2"), at("A1"), at("D1"), at("C1")];
    expect([...list].sort(compareTcPriority).map((n) => n.id)).toEqual([
      "A1",
      "A2",
      "B1",
      "C1",
      "D1",
    ]);
  });

  it("sinks unranked items below every ranked one", () => {
    const list = [unranked("x"), at("D9"), unranked("y"), at("A1")];
    expect([...list].sort(compareTcPriority).map((n) => n.id)).toEqual([
      "A1",
      "D9",
      "x",
      "y",
    ]);
  });

  it("ties unranked items with each other, leaving the caller to break it", () => {
    expect(compareTcPriority(unranked("x"), unranked("y"))).toBe(0);
  });
});

describe("itemsInLetter", () => {
  it("returns one letter's members in rank order, gaps and all", () => {
    const nodes = [at("A3"), at("B1"), at("A1"), unranked("x")];
    expect(itemsInLetter(nodes, "A").map((n) => n.id)).toEqual(["A1", "A3"]);
  });

  it("can exclude the item being moved", () => {
    const nodes = [at("A1"), at("A2"), at("A3")];
    expect(itemsInLetter(nodes, "A", "A2").map((n) => n.id)).toEqual(["A1", "A3"]);
  });
});

describe("planTcDrop — reordering inside a letter", () => {
  const nodes = [at("A1"), at("A2"), at("A3"), at("A4")];

  it("moves an item up and pushes the rest down", () => {
    // Drop A3 above A1 → A3 becomes A1, and everything it passed shifts.
    expect(applied(nodes, planTcDrop(nodes, "A3", "A1", "before"))).toEqual([
      "A3→A1",
      "A1→A2",
      "A2→A3",
      "A4→A4",
    ]);
  });

  it("moves an item down", () => {
    expect(applied(nodes, planTcDrop(nodes, "A1", "A3", "after"))).toEqual([
      "A2→A1",
      "A3→A2",
      "A1→A3",
      "A4→A4",
    ]);
  });

  it("leaves rows outside the moved span alone", () => {
    // Only the rows between the source and destination should be rewritten.
    const written = planTcDrop(nodes, "A2", "A1", "before").map((a) => a.nodeId);
    expect(written.sort()).toEqual(["A1", "A2"]);
  });

  it("treats a drop onto itself as a no-op", () => {
    expect(planTcDrop(nodes, "A2", "A2", "before")).toEqual([]);
  });
});

describe("planTcDrop — moving between letters", () => {
  const nodes = [at("A1"), at("A2"), at("A3"), at("B1"), at("B2")];

  it("changes the letter and renumbers both sides", () => {
    // A2 → between B1 and B2. A closes its gap; B opens one.
    expect(applied(nodes, planTcDrop(nodes, "A2", "B1", "after"))).toEqual([
      "A1→A1",
      "A3→A2",
      "B1→B1",
      "A2→B2",
      "B2→B3",
    ]);
  });

  it("closes the gap in the letter it left", () => {
    const result = applied(nodes, planTcDrop(nodes, "A1", "B2", "after"));
    // A2 and A3 slide up to fill A1's place — no gap left behind.
    expect(result).toContain("A2→A1");
    expect(result).toContain("A3→A2");
  });

  it("unranks an item dropped among the unranked", () => {
    const withLoose = [...nodes, unranked("loose")];
    const result = planTcDrop(withLoose, "A2", "loose", "before");
    expect(result).toContainEqual({ nodeId: "A2", letter: null, rank: null });
    // …and A still closes up behind it.
    expect(applied(withLoose, result)).toEqual(["A1→A1", "A3→A2", "B1→B1", "B2→B2"]);
  });
});

describe("planTcDropOnLetter", () => {
  it("makes an item rank 1 of an empty letter", () => {
    const nodes = [at("A1"), unranked("x")];
    expect(applied(nodes, planTcDropOnLetter(nodes, "x", "C"))).toEqual([
      "A1→A1",
      "x→C1",
    ]);
  });

  it("inserts at the top of a letter that already has members", () => {
    const nodes = [at("A1"), at("A2"), unranked("x")];
    expect(applied(nodes, planTcDropOnLetter(nodes, "x", "A"))).toEqual([
      "x→A1",
      "A1→A2",
      "A2→A3",
    ]);
  });

  it("promotes across letters and compacts the source", () => {
    const nodes = [at("A1"), at("B1"), at("B2"), at("B3")];
    expect(applied(nodes, planTcDropOnLetter(nodes, "B2", "A"))).toEqual([
      "B2→A1",
      "A1→A2",
      "B1→B1",
      "B3→B2",
    ]);
  });
});

describe("planTcAssign — typing the value", () => {
  const nodes = [at("A1"), at("A2"), at("A3")];

  it("appends when only a letter is given", () => {
    // "It's an A" — you know the letter, not yet the position.
    const nodes2 = [...nodes, unranked("x")];
    expect(applied(nodes2, planTcAssign(nodes2, "x", "A", null))).toEqual([
      "A1→A1",
      "A2→A2",
      "A3→A3",
      "x→A4",
    ]);
  });

  it("inserts at the typed rank and pushes the rest down", () => {
    const nodes2 = [...nodes, unranked("x")];
    expect(applied(nodes2, planTcAssign(nodes2, "x", "A", 2))).toEqual([
      "A1→A1",
      "x→A2",
      "A2→A3",
      "A3→A4",
    ]);
  });

  it("clamps a rank past the end instead of leaving a gap", () => {
    const nodes2 = [...nodes, unranked("x")];
    expect(applied(nodes2, planTcAssign(nodes2, "x", "A", 99))).toEqual([
      "A1→A1",
      "A2→A2",
      "A3→A3",
      "x→A4",
    ]);
  });

  it("clamps a zero or negative rank to the top", () => {
    const nodes2 = [...nodes, unranked("x")];
    expect(applied(nodes2, planTcAssign(nodes2, "x", "A", 0))[0]).toBe("x→A1");
  });

  it("re-ranks an item already in the letter without duplicating it", () => {
    const result = applied(nodes, planTcAssign(nodes, "A3", "A", 1));
    expect(result).toEqual(["A3→A1", "A1→A2", "A2→A3"]);
    expect(result).toHaveLength(3);
  });

  it("unranks on a null letter", () => {
    expect(planTcAssign(nodes, "A2", null, null)).toContainEqual({
      nodeId: "A2",
      letter: null,
      rank: null,
    });
  });
});

describe("planTcClear", () => {
  it("removes the item and closes the gap", () => {
    const nodes = [at("A1"), at("A2"), at("A3")];
    expect(applied(nodes, planTcClear(nodes, "A1"))).toEqual(["A2→A1", "A3→A2"]);
  });

  it("is a no-op on an already-unranked item", () => {
    expect(planTcClear([unranked("x")], "x")).toEqual([]);
  });
});

describe("gaps left by completed tasks", () => {
  // Nothing renumbers while you work, so ranks go sparse. The next drop cleans up —
  // this is the "compact on next drag" decision, made observable.
  const sparse = [at("A1"), at("A4"), at("A9")];

  it("tolerates sparse ranks when ordering", () => {
    expect([...sparse].sort(compareTcPriority).map((n) => n.id)).toEqual([
      "A1",
      "A4",
      "A9",
    ]);
  });

  it("makes the letter dense again on the next drop", () => {
    expect(applied(sparse, planTcDrop(sparse, "A9", "A1", "before"))).toEqual([
      "A9→A1",
      "A1→A2",
      "A4→A3",
    ]);
  });

  it("makes the letter dense on a typed assignment too", () => {
    const withNew = [...sparse, unranked("x")];
    expect(applied(withNew, planTcAssign(withNew, "x", "A", null))).toEqual([
      "A1→A1",
      "A4→A2",
      "A9→A3",
      "x→A4",
    ]);
  });
});

describe("every letter behaves the same", () => {
  // C and D are ranked exactly like A and B — one rule, no special cases.
  it.each(["A", "B", "C", "D"] as PriorityLetter[])("%s ranks densely", (letter) => {
    const nodes = [unranked("x"), unranked("y")];
    const first = planTcDropOnLetter(nodes, "x", letter);
    expect(first).toContainEqual({ nodeId: "x", letter, rank: 1 });

    const afterFirst: Ranked[] = [
      { id: "x", tcPriorityLetter: letter, tcPriorityRank: 1 },
      unranked("y"),
    ];
    expect(applied(afterFirst, planTcAssign(afterFirst, "y", letter, null))).toEqual([
      `x→${letter}1`,
      `y→${letter}2`,
    ]);
  });
});
