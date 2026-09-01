import { describe, expect, it } from "vitest";
import {
  addMember,
  joinWithNext,
  joinWithPrevious,
  patchGroup,
  pruneGroups,
  removeGroup,
  moveItem,
  removeMember,
  ungroup,
  withMembers,
  type Grouping,
} from "./groupEdit";
import { emptyDraftBlock, type DraftExercise } from "./sessionDraft";
import { groupSessionItems } from "./sessionGroups";

function block(name: string, groupId: string | null = null): DraftExercise {
  return { ...emptyDraftBlock(), key: name, exerciseName: name, groupId };
}

function draft(
  exercises: DraftExercise[],
  groupIds: string[] = [
    ...new Set(exercises.map((e) => e.groupId).filter(Boolean)),
  ].map((id) => id as string),
): Grouping {
  return {
    groups: groupIds.map((id) => ({ id, label: id, rest: "" })),
    exercises,
  };
}

/** "Squat | g1:Press g1:Row | Curl" — membership and order in one readable string. */
function shape(d: Grouping): string {
  return d.exercises
    .map((e) => (e.groupId ? `${e.groupId}:${e.exerciseName}` : e.exerciseName))
    .join(" ");
}

/** Contiguity is the invariant every operation must preserve. */
function contiguous(d: Grouping): boolean {
  const seen = new Set<string>();
  let previous: string | null = null;
  for (const e of d.exercises) {
    if (e.groupId !== previous && e.groupId) {
      if (seen.has(e.groupId)) return false;
      seen.add(e.groupId);
    }
    previous = e.groupId;
  }
  return true;
}

describe("joinWithNext", () => {
  it("makes a new group from two loose exercises", () => {
    const next = joinWithNext(draft([block("Press"), block("Row")]), 0);
    expect(next.groups).toHaveLength(1);
    const id = next.groups[0].id;
    expect(next.exercises.map((e) => e.groupId)).toEqual([id, id]);
    expect(contiguous(next)).toBe(true);
  });

  it("starts a group with no label — the label is chrome, not a decision", () => {
    const next = joinWithNext(draft([block("Press"), block("Row")]), 0);
    expect(next.groups[0]).toMatchObject({ label: "", rest: "" });
  });

  it("extends an existing group with the loose exercise after it", () => {
    const next = joinWithNext(
      draft([block("Press", "g1"), block("Row", "g1"), block("Fly")]),
      1,
    );
    expect(shape(next)).toBe("g1:Press g1:Row g1:Fly");
    expect(contiguous(next)).toBe(true);
  });

  it("pulls a loose exercise into the group that follows it", () => {
    const next = joinWithNext(
      draft([block("Fly"), block("Press", "g1"), block("Row", "g1")]),
      0,
    );
    expect(shape(next)).toBe("g1:Fly g1:Press g1:Row");
    expect(contiguous(next)).toBe(true);
  });

  it("merges two adjacent groups into the first, dropping the second's row", () => {
    const next = joinWithNext(
      draft([block("Press", "g1"), block("Row", "g1"), block("Curl", "g2")]),
      1,
    );
    expect(shape(next)).toBe("g1:Press g1:Row g1:Curl");
    expect(next.groups.map((g) => g.id)).toEqual(["g1"]);
    expect(contiguous(next)).toBe(true);
  });

  it("does nothing at the end of the list", () => {
    const before = draft([block("Press")]);
    expect(joinWithNext(before, 0)).toBe(before);
  });

  it("does nothing when both are already the same group", () => {
    const before = draft([block("Press", "g1"), block("Row", "g1")]);
    expect(joinWithNext(before, 0)).toBe(before);
  });
});

describe("joinWithPrevious", () => {
  it("is joinWithNext one step back", () => {
    const next = joinWithPrevious(draft([block("Press"), block("Row")]), 1);
    expect(new Set(next.exercises.map((e) => e.groupId)).size).toBe(1);
  });

  it("does nothing on the first exercise", () => {
    const before = draft([block("Press"), block("Row")]);
    expect(joinWithPrevious(before, 0)).toBe(before);
  });
});

describe("ungroup", () => {
  it("keeps every member and its position, and drops the group row", () => {
    const next = ungroup(
      draft([block("Press", "g1"), block("Row", "g1"), block("Curl")]),
      "g1",
    );
    expect(shape(next)).toBe("Press Row Curl");
    expect(next.groups).toEqual([]);
  });

  it("leaves another group alone", () => {
    const next = ungroup(
      draft([block("Press", "g1"), block("Curl", "g2"), block("Pushdown", "g2")]),
      "g1",
    );
    expect(shape(next)).toBe("Press g2:Curl g2:Pushdown");
  });
});

describe("removeGroup", () => {
  it("takes the exercises with it", () => {
    const next = removeGroup(
      draft([block("Squat"), block("Press", "g1"), block("Row", "g1")]),
      "g1",
    );
    expect(shape(next)).toBe("Squat");
    expect(next.groups).toEqual([]);
  });
});

describe("removeMember", () => {
  it("leaves the group standing while a member remains", () => {
    const next = removeMember(draft([block("Press", "g1"), block("Row", "g1")]), 0);
    expect(shape(next)).toBe("g1:Row");
    expect(next.groups).toHaveLength(1);
  });

  it("takes the empty group with the last member, rather than leaving a ghost", () => {
    const next = removeMember(draft([block("Press", "g1")]), 0);
    expect(next.groups).toEqual([]);
  });
});

describe("addMember", () => {
  it("lands at the end of the group's span, not the end of the session", () => {
    const next = addMember(
      draft([block("Press", "g1"), block("Row", "g1"), block("Squat")]),
      "g1",
    );
    expect(next.exercises.map((e) => e.groupId)).toEqual(["g1", "g1", "g1", null]);
    expect(contiguous(next)).toBe(true);
  });

  it("ignores a group with no members", () => {
    const before = draft([block("Squat")], ["g1"]);
    expect(addMember(before, "g1")).toBe(before);
  });
});

describe("pruneGroups", () => {
  it("drops a group nothing points at", () => {
    expect(pruneGroups(draft([block("Squat")], ["g1"])).groups).toEqual([]);
  });
});

describe("patchGroup", () => {
  it("edits only the named group", () => {
    const next = patchGroup(draft([block("Press", "g1"), block("Curl", "g2")]), "g1", {
      label: "Superset",
      rest: "90",
    });
    expect(next.groups).toEqual([
      { id: "g1", label: "Superset", rest: "90" },
      { id: "g2", label: "g2", rest: "" },
    ]);
  });
});

describe("withMembers", () => {
  it("splices the members back into their own positions", () => {
    const next = withMembers(
      draft([block("Squat"), block("Press", "g1"), block("Row", "g1")]),
      "g1",
      (members) => members.map((m) => ({ ...m, notes: "touched" })),
    );
    expect(next.exercises.map((e) => e.notes)).toEqual(["", "touched", "touched"]);
    expect(shape(next)).toBe("Squat g1:Press g1:Row");
  });

  it("hands the update only that group's members, in order", () => {
    let seen: string[] = [];
    withMembers(
      draft([block("Press", "g1"), block("Curl", "g2"), block("Row", "g1")]),
      "g1",
      (members) => {
        seen = members.map((m) => m.exerciseName);
        return members;
      },
    );
    expect(seen).toEqual(["Press", "Row"]);
  });

  it("does nothing for a group with no members", () => {
    const before = draft([block("Squat")], ["g1"]);
    expect(withMembers(before, "g1", (m) => m)).toBe(before);
  });
});

describe("moveItem", () => {
  /** "Squat | g1:Press g1:Row | Curl" — a group between two lone lifts. */
  function session(): Grouping {
    return draft([
      block("Squat"),
      block("Press", "g1"),
      block("Row", "g1"),
      block("Curl"),
    ]);
  }

  it("moves a straight exercise down past the item after it", () => {
    // Squat is item 0; the group is item 1.
    expect(shape(moveItem(session(), 0, 1))).toBe("g1:Press g1:Row Squat Curl");
  });

  it("moves a straight exercise up past the item before it", () => {
    // Curl is item 2, the group item 1.
    expect(shape(moveItem(session(), 2, -1))).toBe("Squat Curl g1:Press g1:Row");
  });

  it("carries every member of a group and leaves it contiguous", () => {
    const up = moveItem(session(), 1, -1);
    expect(shape(up)).toBe("g1:Press g1:Row Squat Curl");
    expect(contiguous(up)).toBe(true);

    const down = moveItem(session(), 1, 1);
    expect(shape(down)).toBe("Squat Curl g1:Press g1:Row");
    expect(contiguous(down)).toBe(true);
  });

  it("swaps two groups without interleaving their members", () => {
    const two = draft([
      block("Press", "g1"),
      block("Row", "g1"),
      block("Dip", "g2"),
      block("Curl", "g2"),
    ]);
    const moved = moveItem(two, 0, 1);
    expect(shape(moved)).toBe("g2:Dip g2:Curl g1:Press g1:Row");
    expect(contiguous(moved)).toBe(true);
  });

  it("is a no-op at both ends and off the end of the item list", () => {
    const d = session();
    expect(moveItem(d, 0, -1)).toBe(d);
    expect(moveItem(d, 2, 1)).toBe(d);
    expect(moveItem(d, 5, -1)).toBe(d);
    expect(moveItem(d, -1, 1)).toBe(d);
  });

  it("re-letters: the moved item takes the letter of the place it landed in", () => {
    const letters = (d: Grouping) =>
      groupSessionItems(d.exercises, d.groups).map((i) => i.letter);
    expect(letters(session())).toEqual(["A", "B", "C"]);
    // Curl was C; after moving up it is B and the group is C.
    const moved = moveItem(session(), 2, -1);
    const items = groupSessionItems(moved.exercises, moved.groups);
    expect(items.map((i) => i.letter)).toEqual(["A", "B", "C"]);
    expect(items[1]).toMatchObject({ kind: "exercise", letter: "B" });
    expect(items[2]).toMatchObject({ kind: "group", letter: "C" });
  });
});
