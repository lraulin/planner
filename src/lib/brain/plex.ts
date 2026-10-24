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

export type PlexEdge = {
  key: string;
  linkId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

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
  const sideW = Math.max(0, (width - w) / 2 - gap - margin);
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
  const centre = { x: cx, y: cy };

  const place = (
    zone: Exclude<PlexZone, "centre">,
    items: { id: string; linkId?: string }[],
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
    const slots: { key: string; id?: string; linkId?: string; more?: number }[] =
      shown.map((i) => ({
        key: i.id,
        id: i.id,
        linkId: i.linkId,
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
      if (slot.linkId) {
        edges.push({
          key: slot.linkId,
          linkId: slot.linkId,
          x1: centre.x,
          y1: centre.y,
          x2: x + w / 2,
          y2: y + h / 2,
        });
      }
    });
  };

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
    hood.siblings.map((id) => ({ id })),
    right,
    "right",
  );

  return { nodes, edges };
}
