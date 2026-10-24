export type NeighbourLink = {
  id: string;
  fromId: string;
  toId: string;
  kind: "child" | "jump";
};

export type Neighbour = { thoughtId: string; linkId: string };

export type Sibling = { thoughtId: string; viaParentId: string };

export type Neighbourhood = {
  parents: Neighbour[];
  children: Neighbour[];
  jumps: Neighbour[];
  /**
   * Other children of any parent, each with the parent it came through (the first, when
   * several apply). Derived, never stored, so they carry no link of their own.
   */
  siblings: Sibling[];
};

/**
 * Split the links around `activeId` into the plex's four zones. `links` must include every
 * link touching the active thought and the child links of each of its parents (that is
 * where siblings come from); anything else in it is ignored. Input order is kept, so an
 * unchanged neighbour set lays out the same way every time.
 *
 * A thought appears in at most one zone, nearest first: parent, child, jump, sibling. The
 * network allows loops, so the same thought can be reachable more than one way.
 */
export function neighbourhood(activeId: string, links: NeighbourLink[]): Neighbourhood {
  const seen = new Set<string>([activeId]);
  const take = (thoughtId: string) => {
    if (seen.has(thoughtId)) return false;
    seen.add(thoughtId);
    return true;
  };

  const parents: Neighbour[] = [];
  const children: Neighbour[] = [];
  const jumps: Neighbour[] = [];

  for (const l of links) {
    if (l.kind === "child" && l.toId === activeId && take(l.fromId)) {
      parents.push({ thoughtId: l.fromId, linkId: l.id });
    }
  }
  for (const l of links) {
    if (l.kind === "child" && l.fromId === activeId && take(l.toId)) {
      children.push({ thoughtId: l.toId, linkId: l.id });
    }
  }
  for (const l of links) {
    if (l.kind !== "jump") continue;
    const other =
      l.fromId === activeId ? l.toId : l.toId === activeId ? l.fromId : null;
    if (other && take(other)) jumps.push({ thoughtId: other, linkId: l.id });
  }

  const parentIds = new Set(parents.map((p) => p.thoughtId));
  const siblings: Sibling[] = [];
  for (const l of links) {
    if (l.kind === "child" && parentIds.has(l.fromId) && take(l.toId)) {
      siblings.push({ thoughtId: l.toId, viaParentId: l.fromId });
    }
  }

  return { parents, children, jumps, siblings };
}
