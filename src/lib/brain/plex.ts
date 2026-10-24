import type { Neighbourhood } from "./neighbourhood";

export type PlexZone = "centre" | "parents" | "children" | "jumps" | "siblings";

export type PlexNode = {
  /** The thought id, so a thought keeps its key — and its transition — as it changes zone. */
  key: string;
  zone: PlexZone;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set on the overflow chip: how many neighbours it stands for. Its key is `more:<zone>`. */
  more?: number;
};

export type Point = { x: number; y: number };

/** The four gates of a thought, TheBrain's: top is its parents, bottom its children, the sides its jumps. */
export type GateSide = "top" | "bottom" | "left" | "right";

export type Orientation = "vertical" | "horizontal";

export type PlexEdge = {
  key: string;
  /** The stored link this draws; empty for a sibling line, which is derived. */
  linkId: string;
  kind: "parent" | "child" | "jump" | "sibling";
  /** A cubic Bézier from one thought's gate to another's. */
  from: Point;
  to: Point;
  c1: Point;
  c2: Point;
};

export function gatePoint(node: Rect, side: GateSide): Point {
  switch (side) {
    case "top":
      return { x: node.x + node.w / 2, y: node.y };
    case "bottom":
      return { x: node.x + node.w / 2, y: node.y + node.h };
    case "left":
      return { x: node.x, y: node.y + node.h / 2 };
    case "right":
      return { x: node.x + node.w, y: node.y + node.h / 2 };
  }
}

export function gateOrientation(side: GateSide): Orientation {
  return side === "top" || side === "bottom" ? "vertical" : "horizontal";
}

/**
 * Control points that leave `from` and arrive at `to` along the gate's own axis — straight
 * down out of a bottom gate, straight in from the side at a jump gate — which is what makes
 * the curve read as gate to gate. Signed, so it also works when `to` is behind `from`.
 */
export function controlPoints(
  from: Point,
  to: Point,
  orientation: Orientation,
): { c1: Point; c2: Point } {
  if (orientation === "vertical") {
    const dy = (to.y - from.y) / 2;
    return { c1: { x: from.x, y: from.y + dy }, c2: { x: to.x, y: to.y - dy } };
  }
  const dx = (to.x - from.x) / 2;
  return { c1: { x: from.x + dx, y: from.y }, c2: { x: to.x - dx, y: to.y } };
}

/** Where the curve is at its halfway point (t = 0.5), for hanging a link's label on it. */
export function curveMidpoint(e: Pick<PlexEdge, "from" | "to" | "c1" | "c2">): Point {
  return {
    x: (e.from.x + 3 * e.c1.x + 3 * e.c2.x + e.to.x) / 8,
    y: (e.from.y + 3 * e.c1.y + 3 * e.c2.y + e.to.y) / 8,
  };
}

function edge(
  key: string,
  linkId: string,
  kind: PlexEdge["kind"],
  from: Point,
  to: Point,
  orientation: Orientation,
): PlexEdge {
  return { key, linkId, kind, from, to, ...controlPoints(from, to, orientation) };
}

export type PlexLayout = { nodes: PlexNode[]; edges: PlexEdge[] };

export type PlexOptions = {
  width: number;
  height: number;
  chipWidth?: number;
  chipHeight?: number;
  gap?: number;
  margin?: number;
};

type Rect = { x: number; y: number; w: number; h: number };

/** Share of the height given to each of the parents and children bands. */
const BAND = 0.3;

/** Clear space between the centre label and the jump and sibling zones beside it. */
const SIDE_GUTTER = 72;

/**
 * Positions for the active thought and its neighbours. The container is cut into disjoint
 * rectangles — parents on top, children below, jumps left and siblings right of the centre
 * chip — so zones cannot overlap whatever the counts. A zone that outgrows its rectangle
 * keeps what fits and ends in a "+N more" chip.
 */
export function layoutPlex(
  activeId: string,
  hood: Neighbourhood,
  opts: PlexOptions,
): PlexLayout {
  const { width, height } = opts;
  const w = opts.chipWidth ?? 132;
  const h = opts.chipHeight ?? 36;
  const gap = opts.gap ?? 12;
  const margin = opts.margin ?? 12;

  const cx = width / 2;
  const cy = height / 2;
  const bandH = height * BAND;
  // Jumps and siblings keep a gutter from the centre so the curve between gates has room to
  // be seen, but never at the cost of a zone narrower than one label.
  const room = Math.max(0, (width - w) / 2 - gap - margin);
  const sideW = room - Math.min(SIDE_GUTTER, Math.max(0, room - w));
  const midTop = bandH;
  const midH = height - 2 * bandH;

  const top: Rect = {
    x: margin,
    y: margin,
    w: width - 2 * margin,
    h: bandH - margin - gap,
  };
  const bottom: Rect = { x: margin, y: height - bandH + gap, w: top.w, h: top.h };
  const left: Rect = { x: margin, y: midTop, w: sideW, h: midH };
  const right: Rect = { x: width - margin - sideW, y: midTop, w: sideW, h: midH };

  const nodes: PlexNode[] = [
    { key: activeId, zone: "centre", x: cx - w / 2, y: cy - h / 2, w, h },
  ];
  const edges: PlexEdge[] = [];
  const centreNode = nodes[0];

  const place = (
    zone: Exclude<PlexZone, "centre">,
    items: { id: string; linkId?: string; viaParentId?: string }[],
    rect: Rect,
    flow: "up" | "down" | "left" | "right",
  ) => {
    const horizontal = flow === "up" || flow === "down";
    // `across` chips fit along a layer; layers stack outward from the centre.
    const across = Math.max(
      1,
      Math.floor(((horizontal ? rect.w : rect.h) + gap) / ((horizontal ? w : h) + gap)),
    );
    const layers = Math.max(
      1,
      Math.floor(((horizontal ? rect.h : rect.w) + gap) / ((horizontal ? h : w) + gap)),
    );
    const cap = across * layers;
    const shown = items.length > cap ? items.slice(0, cap - 1) : items;
    const slots: {
      key: string;
      linkId?: string;
      viaParentId?: string;
      more?: number;
    }[] = shown.map((i) => ({
      key: i.id,
      linkId: i.linkId,
      viaParentId: i.viaParentId,
    }));
    if (shown.length < items.length) {
      slots.push({ key: `more:${zone}`, more: items.length - shown.length });
    }

    slots.forEach((slot, n) => {
      const layer = Math.floor(n / across);
      const inLayer = Math.min(across, slots.length - layer * across);
      const idx = n % across;
      const span = (horizontal ? w : h) * inLayer + gap * (inLayer - 1);
      const start = (horizontal ? rect.x + rect.w / 2 : rect.y + rect.h / 2) - span / 2;
      const along = start + idx * ((horizontal ? w : h) + gap);
      const step = layer * ((horizontal ? h : w) + gap);

      let x: number;
      let y: number;
      if (flow === "up") {
        x = along;
        y = rect.y + rect.h - h - step;
      } else if (flow === "down") {
        x = along;
        y = rect.y + step;
      } else if (flow === "left") {
        x = rect.x + rect.w - w - step;
        y = along;
      } else {
        x = rect.x + step;
        y = along;
      }
      nodes.push({ key: slot.key, zone, x, y, w, h, more: slot.more });
      const node = nodes[nodes.length - 1];
      if (slot.linkId) {
        const key = slot.linkId;
        if (zone === "parents") {
          edges.push(
            edge(
              key,
              key,
              "parent",
              gatePoint(node, "bottom"),
              gatePoint(centreNode, "top"),
              "vertical",
            ),
          );
        } else if (zone === "children") {
          edges.push(
            edge(
              key,
              key,
              "child",
              gatePoint(centreNode, "bottom"),
              gatePoint(node, "top"),
              "vertical",
            ),
          );
        } else {
          edges.push(
            edge(
              key,
              key,
              "jump",
              gatePoint(centreNode, "left"),
              gatePoint(node, "right"),
              "horizontal",
            ),
          );
        }
      } else if (slot.viaParentId) {
        siblingNodes.push({ node, viaParentId: slot.viaParentId });
      }
    });
  };
  const siblingNodes: { node: PlexNode; viaParentId: string }[] = [];

  place(
    "parents",
    hood.parents.map((n) => ({ id: n.thoughtId, linkId: n.linkId })),
    top,
    "up",
  );
  place(
    "children",
    hood.children.map((n) => ({ id: n.thoughtId, linkId: n.linkId })),
    bottom,
    "down",
  );
  place(
    "jumps",
    hood.jumps.map((n) => ({ id: n.thoughtId, linkId: n.linkId })),
    left,
    "left",
  );
  place(
    "siblings",
    hood.siblings.map((s) => ({ id: s.thoughtId, viaParentId: s.viaParentId })),
    right,
    "right",
  );

  // A sibling hangs off its own parent's child gate. A parent folded into "+N more" has no
  // gate to draw from, so its siblings go without a line rather than with a wrong one.
  for (const { node, viaParentId } of siblingNodes) {
    const parent = nodes.find((n) => n.zone === "parents" && n.key === viaParentId);
    if (!parent) continue;
    edges.push(
      edge(
        `sibling:${node.key}`,
        "",
        "sibling",
        gatePoint(parent, "bottom"),
        gatePoint(node, "top"),
        "vertical",
      ),
    );
  }

  return { nodes, edges };
}
