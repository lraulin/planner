import { describe, expect, it } from "vitest";
import { groupRounds, groupSessionItems, itemLetter } from "./sessionGroups";

type M = { name: string; groupId: string | null; sets: number[] };
type G = { id: string; label: string };

const g1: G = { id: "g1", label: "Superset" };
const g2: G = { id: "g2", label: "Circuit" };

function member(name: string, groupId: string | null, setCount: number): M {
  return { name, groupId, sets: Array.from({ length: setCount }, (_, i) => i) };
}

function shape(items: ReturnType<typeof groupSessionItems<M, G>>): string[] {
  return items.map((item) =>
    item.kind === "exercise"
      ? `${item.letter} ${item.member.name}`
      : `${item.letter} [${item.members.map((m) => `${m.label} ${m.member.name}`).join(", ")}] ×${item.rounds}`,
  );
}

describe("itemLetter", () => {
  it("counts A, B, C", () => {
    expect([0, 1, 25].map(itemLetter)).toEqual(["A", "B", "Z"]);
  });

  it("keeps going past Z rather than repeating", () => {
    expect([26, 27, 51, 52].map(itemLetter)).toEqual(["AA", "AB", "AZ", "BA"]);
  });
});

describe("groupRounds", () => {
  it("is the longest member, not the shortest or the sum", () => {
    expect(groupRounds([member("a", "g1", 3), member("b", "g1", 2)])).toBe(3);
  });

  it("is zero for no members", () => {
    expect(groupRounds([])).toBe(0);
  });
});

describe("groupSessionItems", () => {
  it("leaves an ungrouped session as one item per exercise", () => {
    const items = groupSessionItems(
      [member("Squat", null, 3), member("Bench", null, 3)],
      [],
    );
    expect(shape(items)).toEqual(["A Squat", "B Bench"]);
  });

  it("folds a contiguous run into one group and letters its members", () => {
    const items = groupSessionItems(
      [member("Press", "g1", 3), member("Row", "g1", 3)],
      [g1],
    );
    expect(shape(items)).toEqual(["A [A1 Press, A2 Row] ×3"]);
  });

  it("letters every top-level item, so a lone lift between groups still reads in order", () => {
    const items = groupSessionItems(
      [
        member("Press", "g1", 3),
        member("Row", "g1", 3),
        member("Leg Press", null, 4),
        member("Curl", "g2", 2),
        member("Pushdown", "g2", 2),
      ],
      [g1, g2],
    );
    expect(shape(items)).toEqual([
      "A [A1 Press, A2 Row] ×3",
      "B Leg Press",
      "C [C1 Curl, C2 Pushdown] ×2",
    ]);
  });

  it("derives rounds from the longest member when one stopped early", () => {
    const items = groupSessionItems(
      [member("Press", "g1", 3), member("Row", "g1", 2)],
      [g1],
    );
    expect(items[0].kind === "group" && items[0].rounds).toBe(3);
  });

  it("treats a member pointing at a missing group as a straight exercise", () => {
    const items = groupSessionItems([member("Press", "ghost", 3)], [g1]);
    expect(shape(items)).toEqual(["A Press"]);
  });

  it("drops a group that has no members left", () => {
    const items = groupSessionItems([member("Squat", null, 3)], [g1]);
    expect(shape(items)).toEqual(["A Squat"]);
  });

  it("splits a non-contiguous group rather than reordering the workout", () => {
    // Unreachable through the app; reachable by hand in SQL. Order is what must survive.
    const items = groupSessionItems(
      [member("Press", "g1", 3), member("Leg Press", null, 3), member("Row", "g1", 3)],
      [g1],
    );
    expect(shape(items)).toEqual(["A [A1 Press] ×3", "B Leg Press", "C [C1 Row] ×3"]);
  });

  it("reports each member's index in the flat list so the editor can address it", () => {
    const items = groupSessionItems(
      [member("Squat", null, 3), member("Press", "g1", 3), member("Row", "g1", 3)],
      [g1],
    );
    const group = items[1];
    expect(group.kind === "group" && group.members.map((m) => m.index)).toEqual([1, 2]);
  });
});
