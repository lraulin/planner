import { describe, expect, it } from "vitest";
import { layoutPlex, type PlexNode } from "./plex";
import type { Neighbourhood } from "./neighbourhood";

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const hood = (p: number, c: number, j: number, s: number): Neighbourhood => ({
  parents: ids("p", p).map((thoughtId) => ({ thoughtId, linkId: `l-${thoughtId}` })),
  children: ids("c", c).map((thoughtId) => ({ thoughtId, linkId: `l-${thoughtId}` })),
  jumps: ids("j", j).map((thoughtId) => ({ thoughtId, linkId: `l-${thoughtId}` })),
  siblings: ids("s", s),
});

const SIZE = { width: 1000, height: 600 };

const overlaps = (a: PlexNode, b: PlexNode) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("layoutPlex", () => {
  it("keeps the active thought fixed at the centre whatever its neighbours", () => {
    const empty = layoutPlex("X", hood(0, 0, 0, 0), SIZE).nodes[0];
    const busy = layoutPlex("X", hood(5, 30, 8, 12), SIZE).nodes[0];
    expect(busy).toEqual(empty);
    expect(busy.x + busy.w / 2).toBe(500);
    expect(busy.y + busy.h / 2).toBe(300);
  });

  it("puts parents above, children below, jumps left and siblings right", () => {
    const { nodes } = layoutPlex("X", hood(2, 2, 2, 2), SIZE);
    const centre = nodes[0];
    for (const n of nodes.filter((n) => n.zone === "parents"))
      expect(n.y + n.h).toBeLessThan(centre.y);
    for (const n of nodes.filter((n) => n.zone === "children"))
      expect(n.y).toBeGreaterThan(centre.y + centre.h);
    for (const n of nodes.filter((n) => n.zone === "jumps"))
      expect(n.x + n.w).toBeLessThan(centre.x);
    for (const n of nodes.filter((n) => n.zone === "siblings"))
      expect(n.x).toBeGreaterThan(centre.x + centre.w);
  });

  it.each([
    ["sparse", hood(1, 1, 1, 1)],
    ["crowded", hood(12, 40, 15, 25)],
    ["overflowing", hood(200, 200, 200, 200)],
  ])("never overlaps two chips (%s)", (_name, h) => {
    const { nodes } = layoutPlex("X", h, SIZE);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(overlaps(nodes[i], nodes[j])).toBe(false);
      }
    }
  });

  it("keeps every chip inside the container", () => {
    const { nodes } = layoutPlex("X", hood(200, 200, 200, 200), SIZE);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x + n.w).toBeLessThanOrEqual(SIZE.width);
      expect(n.y + n.h).toBeLessThanOrEqual(SIZE.height);
    }
  });

  it("replaces the overflow with a +N more chip that accounts for every neighbour", () => {
    const { nodes } = layoutPlex("X", hood(0, 200, 0, 0), SIZE);
    const children = nodes.filter((n) => n.zone === "children");
    const more = children.filter((n) => n.more !== undefined);
    expect(more).toHaveLength(1);
    expect(more[0].key).toBe("more:children");
    expect(children.length - 1 + (more[0].more ?? 0)).toBe(200);
  });

  it("does not add a more chip when everything fits", () => {
    const { nodes } = layoutPlex("X", hood(3, 3, 3, 3), SIZE);
    expect(nodes.some((n) => n.more !== undefined)).toBe(false);
  });

  it("is stable: the same neighbours give the same positions", () => {
    expect(layoutPlex("X", hood(3, 5, 2, 4), SIZE)).toEqual(
      layoutPlex("X", hood(3, 5, 2, 4), SIZE),
    );
  });

  it("draws an edge to each parent, child and jump, but not siblings", () => {
    const { edges } = layoutPlex("X", hood(2, 3, 1, 4), SIZE);
    expect(edges).toHaveLength(6);
    expect(edges.every((e) => e.x1 === 500 && e.y1 === 300)).toBe(true);
  });

  it("still places at least one chip per zone in a tiny container", () => {
    const { nodes } = layoutPlex("X", hood(3, 3, 3, 3), { width: 200, height: 120 });
    for (const zone of ["parents", "children", "jumps", "siblings"] as const) {
      expect(nodes.some((n) => n.zone === zone)).toBe(true);
    }
  });
});
