import { describe, expect, it } from "vitest";
import type { PriorityLetter } from "@/db/schema";
import {
  assertRankedLetterPriorities,
  letterRankEngine,
  type LetterAssignment,
  type LetterRank,
} from "./letterRank";

type Item = {
  id: string;
  letter: PriorityLetter | null;
  rank: number | null;
};

/** `at("A1")` / `at("B")` — bare letter is the thin path only the outline uses. */
function at(spec: string): Item {
  const letter = spec[0] as PriorityLetter;
  const rest = spec.slice(1);
  return {
    id: spec,
    letter,
    rank: rest === "" ? null : Number(rest),
  };
}

function unranked(id: string): Item {
  return { id, letter: null, rank: null };
}

const engine = letterRankEngine<Item>((item) => ({
  letter: item.letter,
  rank: item.rank,
}));

describe("assertRankedLetterPriorities", () => {
  it("accepts blank and positively ranked priorities", () => {
    expect(() =>
      assertRankedLetterPriorities([
        { letter: null, rank: null },
        { letter: "A", rank: 1 },
        { letter: "D", rank: 9 },
      ]),
    ).not.toThrow();
  });

  it("rejects a bare letter and a non-positive or fractional rank", () => {
    const invalid: LetterRank[] = [
      { letter: "A", rank: null },
      { letter: "A", rank: 0 },
      { letter: "A", rank: 1.5 },
    ];
    for (const priority of invalid) {
      expect(() => assertRankedLetterPriorities([priority])).toThrow(
        /positive integer rank/i,
      );
    }
  });

  it("rejects a rank without a letter", () => {
    expect(() => assertRankedLetterPriorities([{ letter: null, rank: 1 }])).toThrow(
      /positive integer rank/i,
    );
  });
});

/**
 * Apply assignments and return lettered items in engine order. Asserts on resulting order
 * rather than the shape of the diff, so the minimal-write optimisation is free to change.
 */
function applied(items: Item[], assignments: LetterAssignment[]): string[] {
  const byId = new Map(items.map((item) => [item.id, { ...item }]));
  for (const a of assignments) {
    const item = byId.get(a.id);
    if (!item) continue;
    item.letter = a.letter;
    item.rank = a.rank;
  }
  return [...byId.values()]
    .filter((item) => item.letter !== null)
    .sort(engine.compare)
    .map((item) =>
      item.rank === null
        ? `${item.id}→${item.letter}`
        : `${item.id}→${item.letter}${item.rank}`,
    );
}

describe("letterRankEngine.compare", () => {
  it("orders letter, then rank, with a bare letter after that letter's ranks", () => {
    // Outline only: TC and Day always store a rank with a letter.
    const list = [at("B"), at("A2"), at("A"), at("A1"), unranked("x"), at("B1")];
    expect([...list].sort(engine.compare).map((i) => i.id)).toEqual([
      "A1",
      "A2",
      "A",
      "B1",
      "B",
      "x",
    ]);
  });

  it("ties unlettered items so the caller can break the tie", () => {
    expect(engine.compare(unranked("x"), unranked("y"))).toBe(0);
  });
});

describe("letterRankEngine.itemsInLetter", () => {
  it("returns one letter's members with bare last among ranks", () => {
    const items = [at("A"), at("B1"), at("A2"), at("A1"), unranked("x")];
    expect(engine.itemsInLetter(items, "A").map((i) => i.id)).toEqual([
      "A1",
      "A2",
      "A",
    ]);
  });

  it("can exclude the item being moved", () => {
    const items = [at("A1"), at("A2"), at("A3")];
    expect(engine.itemsInLetter(items, "A", "A2").map((i) => i.id)).toEqual([
      "A1",
      "A3",
    ]);
  });
});

describe("letterRankEngine.planAssign", () => {
  it("appends a bare letter to the end of that letter and densifies a rank", () => {
    // Typing "A" with no number: "somewhere in A" — the end is the honest answer, and the
    // engine always writes a rank (invariant 2).
    const items = [at("A1"), at("A2"), unranked("new")];
    const plan = engine.planAssign(items, "new", "A", null);
    expect(applied(items, plan)).toEqual(["A1→A1", "A2→A2", "new→A3"]);
  });

  it("inserts a typed rank and pushes the rest down", () => {
    const items = [at("A1"), at("A2"), at("A3"), unranked("new")];
    const plan = engine.planAssign(items, "new", "A", 2);
    expect(applied(items, plan)).toEqual(["A1→A1", "new→A2", "A2→A3", "A3→A4"]);
  });

  it("clamps a rank past the end rather than leaving a gap", () => {
    const items = [at("A1"), unranked("new")];
    const plan = engine.planAssign(items, "new", "A", 99);
    expect(applied(items, plan)).toEqual(["A1→A1", "new→A2"]);
  });

  it("compacts the source letter when moving across letters", () => {
    const items = [at("A1"), at("A2"), at("B1")];
    const plan = engine.planAssign(items, "A1", "B", 1);
    expect(applied(items, plan)).toEqual(["A2→A1", "A1→B1", "B1→B2"]);
  });

  it("unranks via null letter", () => {
    const items = [at("A1"), at("A2")];
    const plan = engine.planAssign(items, "A1", null, null);
    expect(applied(items, plan)).toEqual(["A2→A1"]);
  });
});

describe("letterRankEngine.planDrop", () => {
  it("moves a block before a target and densifies", () => {
    const items = [at("A1"), at("A2"), at("A3"), at("A4")];
    const plan = engine.planDrop(items, ["A3", "A4"], "A1", "after");
    expect(applied(items, plan)).toEqual(["A1→A1", "A3→A2", "A4→A3", "A2→A4"]);
  });

  it("places a bare letter among ranked peers by display order", () => {
    // Bare A sorts after A2. Dropping unranked onto A1 after → A1, new, A2 densified.
    const items = [at("A1"), at("A2"), unranked("new")];
    const plan = engine.planDrop(items, "new", "A1", "after");
    expect(applied(items, plan)).toEqual(["A1→A1", "new→A2", "A2→A3"]);
  });

  it("unranks when the target has no letter", () => {
    const items = [at("A1"), unranked("blank")];
    const plan = engine.planDrop(items, "A1", "blank", "before");
    expect(plan).toEqual(
      expect.arrayContaining([{ id: "A1", letter: null, rank: null }]),
    );
    expect(applied(items, plan)).toEqual([]);
  });

  it("is a no-op when the target is in the drag set", () => {
    const items = [at("A1"), at("A2")];
    expect(engine.planDrop(items, ["A1", "A2"], "A1", "before")).toEqual([]);
  });

  it("compacts the source letter when crossing letters", () => {
    const items = [at("A1"), at("A2"), at("B1"), at("B2")];
    const plan = engine.planDrop(items, "A1", "B2", "after");
    expect(applied(items, plan)).toEqual(["A2→A1", "B1→B1", "B2→B2", "A1→B3"]);
  });
});

describe("letterRankEngine.planDropOnLetter", () => {
  it("puts the dragged items at the top of that letter", () => {
    const items = [at("A1"), at("A2"), unranked("new")];
    const plan = engine.planDropOnLetter(items, "new", "A");
    expect(applied(items, plan)).toEqual(["new→A1", "A1→A2", "A2→A3"]);
  });

  it("preserves multi-drag order at the top", () => {
    const items = [at("A1"), at("B1"), at("B2")];
    const plan = engine.planDropOnLetter(items, ["B1", "B2"], "A");
    expect(applied(items, plan)).toEqual(["B1→A1", "B2→A2", "A1→A3"]);
  });
});

describe("letterRankEngine.planClear", () => {
  it("unranks and densifies the gap left behind", () => {
    const items = [at("A1"), at("A2"), at("A3")];
    const plan = engine.planClear(items, "A2");
    expect(applied(items, plan)).toEqual(["A1→A1", "A3→A2"]);
  });

  it("clears a multi-drag block from one letter once", () => {
    const items = [at("A1"), at("A2"), at("A3"), at("A4")];
    const plan = engine.planClear(items, ["A2", "A3"]);
    expect(applied(items, plan)).toEqual(["A1→A1", "A4→A2"]);
  });
});

describe("letterRankEngine renumber writes", () => {
  it("emits only rows whose rank actually moves", () => {
    // Drop A3 before A2 → A1 stays A1 and must not appear in the plan.
    const items = [at("A1"), at("A2"), at("A3")];
    const plan = engine.planDrop(items, "A3", "A2", "before");
    expect(plan.find((a) => a.id === "A1")).toBeUndefined();
    expect(plan).toEqual([
      { id: "A3", letter: "A", rank: 2 },
      { id: "A2", letter: "A", rank: 3 },
    ]);
  });
});

describe("planAssign over a block", () => {
  /** Every ranked row afterwards as `id@LetterRank`, in letter then rank order. */
  function afterAssign(
    items: Item[],
    ids: string[],
    letter: PriorityLetter | null,
    rank: number | null,
  ): string[] {
    const byId = new Map(
      engine.planAssign(items, ids, letter, rank).map((a) => [a.id, a]),
    );
    return items
      .map((item) => ({ ...item, ...(byId.get(item.id) ?? {}) }))
      .filter((item) => item.letter !== null)
      .sort(
        (a, b) =>
          (a.letter ?? "").localeCompare(b.letter ?? "") ||
          (a.rank ?? 0) - (b.rank ?? 0),
      )
      .map((item) => `${item.id}@${item.letter}${item.rank}`);
  }

  // Selecting a run of rows and giving them one priority is how a long list gets ranked at
  // all — thirty videos should not need thirty keystrokes. The block lands contiguously and
  // in the order given, which for a grid selection is the order they read on screen.
  it("lands a block contiguously from the requested rank, pushing the rest down", () => {
    const items = [at("A1"), at("A2"), at("A3"), unranked("x"), unranked("y")];

    expect(afterAssign(items, ["x", "y"], "A", 1)).toEqual([
      "x@A1",
      "y@A2",
      "A1@A3",
      "A2@A4",
      "A3@A5",
    ]);
  });

  it("clamps a rank past the end instead of leaving a gap", () => {
    // Asking for A10 of a five-long list means "after the ones that exist", not "leave four
    // empty slots" — the whole point of the model is that a rank is never absent.
    const items = [at("A1"), at("A2"), unranked("x"), unranked("y")];

    expect(afterAssign(items, ["x", "y"], "A", 10)).toEqual([
      "A1@A1",
      "A2@A2",
      "x@A3",
      "y@A4",
    ]);
  });

  it("appends the block when the letter carries no rank", () => {
    const items = [at("A1"), unranked("x"), unranked("y")];

    expect(afterAssign(items, ["x", "y"], "A", null)).toEqual([
      "A1@A1",
      "x@A2",
      "y@A3",
    ]);
  });

  it("inserts mid-list at exactly the rank asked for", () => {
    const items = [at("A1"), at("A2"), at("A3"), unranked("x")];

    expect(afterAssign(items, ["x"], "A", 2)).toEqual([
      "A1@A1",
      "x@A2",
      "A2@A3",
      "A3@A4",
    ]);
  });

  it("vacates the old slots when the block is already in that letter", () => {
    // Re-ranking A2 and A3 to the top must not count them twice: they leave their old
    // positions rather than colliding with the rows that shift up behind them.
    const items = [at("A1"), at("A2"), at("A3"), at("A4")];

    expect(afterAssign(items, ["A3", "A4"], "A", 1)).toEqual([
      "A3@A1",
      "A4@A2",
      "A1@A3",
      "A2@A4",
    ]);
  });

  it("closes the gap in every letter the block came from", () => {
    const items = [at("A1"), at("A2"), at("A3"), at("B1"), at("B2")];

    // Moving A1 and B1 into C empties a slot in each of A and B.
    expect(afterAssign(items, ["A1", "B1"], "C", null)).toEqual([
      "A2@A1",
      "A3@A2",
      "B2@B1",
      "A1@C1",
      "B1@C2",
    ]);
  });

  it("unranks a whole block and closes what it leaves", () => {
    const items = [at("A1"), at("A2"), at("A3")];

    expect(afterAssign(items, ["A1", "A2"], null, null)).toEqual(["A3@A1"]);
  });

  it("plans nothing for an empty selection or an id that is not there", () => {
    const items = [at("A1"), at("A2")];

    expect(engine.planAssign(items, [], "A", 1)).toEqual([]);
    expect(engine.planAssign(items, ["ghost"], "A", 1)).toEqual([]);
  });
});
