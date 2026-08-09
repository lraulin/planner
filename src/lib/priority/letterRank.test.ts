import { describe, expect, it } from "vitest";
import type { PriorityLetter } from "@/db/schema";
import { letterRankEngine, type LetterAssignment } from "./letterRank";

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
