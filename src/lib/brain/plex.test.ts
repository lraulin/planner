import { describe, expect, it } from "vitest";
import { controlPoints, curveMidpoint, layoutPlex, type PlexNode } from "./plex";
import type { Neighbourhood } from "./neighbourhood";

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const hood = (p: number, c: number, j: number, s: number): Neighbourhood => ({
  parents: ids("p", p).map((thoughtId) => ({ thoughtId, linkId: `l-${thoughtId}` })),
  children: ids("c", c).map((thoughtId) => ({ thoughtId, linkId: `l-${thoughtId}` })),
  jumps: ids("j", j).map((thoughtId) => ({ thoughtId, linkId: `l-${thoughtId}` })),
  siblings: ids("s", s).map((thoughtId) => ({ thoughtId, viaParentId: "p0" })),
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

  it("joins each link's gates: parent bottom to centre top, centre bottom to child top, centre left to jump right", () => {
    const { nodes, edges } = layoutPlex("X", hood(2, 3, 1, 0), SIZE);
    expect(edges).toHaveLength(6);
    const centre = nodes[0];
    const node = (key: string) => nodes.find((n) => n.key === key)!;
    const byKind = (kind: string) => edges.filter((e) => e.kind === kind);

    for (const e of byKind("parent")) {
      const p = node(e.key.replace("l-", ""));
      expect(e.from).toEqual({ x: p.x + p.w / 2, y: p.y + p.h });
      expect(e.to).toEqual({ x: centre.x + centre.w / 2, y: centre.y });
    }
    for (const e of byKind("child")) {
      const c = node(e.key.replace("l-", ""));
      expect(e.from).toEqual({ x: centre.x + centre.w / 2, y: centre.y + centre.h });
      expect(e.to).toEqual({ x: c.x + c.w / 2, y: c.y });
    }
    const jump = byKind("jump")[0];
    const j = node("j0");
    expect(jump.from).toEqual({ x: centre.x, y: centre.y + centre.h / 2 });
    expect(jump.to).toEqual({ x: j.x + j.w, y: j.y + j.h / 2 });
  });

  it("leaves room for a visible curve between the centre and a jump", () => {
    const { edges } = layoutPlex("X", hood(0, 0, 1, 0), SIZE);
    const jump = edges.find((e) => e.kind === "jump")!;
    expect(jump.from.x - jump.to.x).toBeGreaterThan(40);
  });

  it("leaves vertical gates vertically and jump gates horizontally", () => {
    const { edges } = layoutPlex("X", hood(1, 1, 1, 0), SIZE);
    for (const e of edges) {
      if (e.kind === "jump") {
        expect(e.c1.y).toBe(e.from.y);
        expect(e.c2.y).toBe(e.to.y);
      } else {
        expect(e.c1.x).toBe(e.from.x);
        expect(e.c2.x).toBe(e.to.x);
      }
    }
  });

  it("puts a curve's midpoint halfway between its gates when the curve is symmetric", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 0, y: 100 };
    expect(curveMidpoint({ from, to, ...controlPoints(from, to, "vertical") })).toEqual(
      {
        x: 0,
        y: 50,
      },
    );
  });

  it("draws a sibling's line from its own parent's child gate", () => {
    const h = hood(2, 0, 0, 0);
    h.siblings = [{ thoughtId: "s-via-p1", viaParentId: "p1" }];
    const { nodes, edges } = layoutPlex("X", h, SIZE);
    const sib = edges.filter((e) => e.kind === "sibling");
    expect(sib).toHaveLength(1);
    const p1 = nodes.find((n) => n.key === "p1")!;
    const s = nodes.find((n) => n.key === "s-via-p1")!;
    expect(sib[0].linkId).toBe("");
    expect(sib[0].from).toEqual({ x: p1.x + p1.w / 2, y: p1.y + p1.h });
    expect(sib[0].to).toEqual({ x: s.x + s.w / 2, y: s.y });
  });

  it("draws no line for a sibling whose parent is folded into +N more", () => {
    const h = hood(200, 0, 0, 0);
    h.siblings = [{ thoughtId: "S", viaParentId: "p199" }];
    const { nodes, edges } = layoutPlex("X", h, SIZE);
    expect(nodes.some((n) => n.key === "p199")).toBe(false);
    expect(edges.some((e) => e.kind === "sibling")).toBe(false);
  });

  it("still places at least one chip per zone in a tiny container", () => {
    const { nodes } = layoutPlex("X", hood(3, 3, 3, 3), { width: 200, height: 120 });
    for (const zone of ["parents", "children", "jumps", "siblings"] as const) {
      expect(nodes.some((n) => n.zone === zone)).toBe(true);
    }
  });
});
