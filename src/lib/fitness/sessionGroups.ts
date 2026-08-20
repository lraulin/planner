/**
 * Folding a session's flat exercise list into supersets, circuits and mechanical drop
 * sets — all one structure, differing only in how many members and how many rounds.
 *
 * Members of a group are **contiguous** in the flat list: a session is rebuilt from one
 * ordered array on every save, so a group needs no sort key of its own. This folds runs of
 * consecutive members, which means a non-contiguous group (unreachable through the app, but
 * reachable by hand in SQL) degrades into two groups rather than reordering the workout.
 *
 * Generic over the member and group shapes so the session detail read model and the editor
 * draft fold through the same tested code.
 */

export type GroupableMember = {
  groupId: string | null;
  sets: readonly unknown[];
};

export type GroupableGroup = { id: string };

export type SessionItemMember<M> = {
  member: M;
  /** Position in the flat list — the editor addresses blocks by it. */
  index: number;
  /** "A1", "A2" … */
  label: string;
};

export type SessionItem<M, G> =
  | { kind: "exercise"; letter: string; member: M; index: number }
  | {
      kind: "group";
      letter: string;
      group: G;
      members: SessionItemMember<M>[];
      /** Derived: the longest member. Never stored — see the spec. */
      rounds: number;
    };

/** A, B, … Z, AA, AB — so a pathological session still labels rather than repeats. */
export function itemLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Rounds a group has: the longest member's set count. */
export function groupRounds(members: readonly GroupableMember[]): number {
  return members.reduce((max, m) => Math.max(max, m.sets.length), 0);
}

export function groupSessionItems<M extends GroupableMember, G extends GroupableGroup>(
  members: readonly M[],
  groups: readonly G[],
): SessionItem<M, G>[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const items: SessionItem<M, G>[] = [];

  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    const group = member.groupId ? byId.get(member.groupId) : undefined;

    // A member pointing at a group that is not here is a straight exercise, not an error.
    if (!group) {
      items.push({ kind: "exercise", letter: "", member, index: i });
      continue;
    }

    const run: SessionItemMember<M>[] = [];
    while (i < members.length && members[i].groupId === member.groupId) {
      run.push({ member: members[i], index: i, label: "" });
      i += 1;
    }
    i -= 1;

    items.push({
      kind: "group",
      letter: "",
      group,
      members: run,
      rounds: groupRounds(run.map((r) => r.member)),
    });
  }

  // Letter every top-level item, grouped or not, so the reading order stays legible when a
  // lone exercise sits between two circuits.
  return items.map((item, index) => {
    const letter = itemLetter(index);
    if (item.kind === "exercise") return { ...item, letter };
    return {
      ...item,
      letter,
      members: item.members.map((m, j) => ({ ...m, label: `${letter}${j + 1}` })),
    };
  });
}
