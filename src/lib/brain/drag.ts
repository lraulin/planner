import type { LinkRelation } from "./links";
import {
  controlPoints,
  gateOrientation,
  type GateSide,
  type Orientation,
  type Point,
} from "./plex";

/** A press that moves less than this is a click on the gate, not the start of a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** What dragging out of a gate means: the gate names the relation of the *other* thought. */
export function relationForGate(side: GateSide): LinkRelation {
  switch (side) {
    case "top":
      return "parent";
    case "bottom":
      return "child";
    case "left":
    case "right":
      return "jump";
  }
}

export type DropResult =
  | { kind: "link"; thoughtId: string; relation: LinkRelation; otherId: string }
  | { kind: "create"; thoughtId: string; relation: LinkRelation }
  | { kind: "none" };

/**
 * What releasing a gate drag does. `targetKey` is the plex node under the pointer — a thought
 * id, a `more:<zone>` chip, or null for empty canvas. Dropping on the thought it started from,
 * or on an overflow chip (which stands for several thoughts, so for none in particular), does
 * nothing; so does a release that never really left the gate.
 */
export function dropResult(
  sourceId: string,
  side: GateSide,
  targetKey: string | null,
  moved: boolean,
): DropResult {
  if (!moved) return { kind: "none" };
  const relation = relationForGate(side);
  if (targetKey === null) return { kind: "create", thoughtId: sourceId, relation };
  if (targetKey === sourceId || targetKey.startsWith("more:")) return { kind: "none" };
  return { kind: "link", thoughtId: sourceId, relation, otherId: targetKey };
}

export function moveExceedsThreshold(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD_PX;
}

/** SVG path data for a gate-to-gate curve; the plex's edges and the rubber band share it. */
export function bezierPath(from: Point, to: Point, orientation: Orientation): string {
  const { c1, c2 } = controlPoints(from, to, orientation);
  return `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`;
}

/** The rubber band from a gate to the pointer, leaving along the gate's own axis. */
export function rubberBandPath(from: Point, side: GateSide, pointer: Point): string {
  return bezierPath(from, pointer, gateOrientation(side));
}
