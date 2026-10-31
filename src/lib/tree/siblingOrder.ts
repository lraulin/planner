import { between } from "./sortKey";
import type { Position } from "./types";

/** One row of a level, as the ordering needs it. Callers pass a level in sort-key order. */
export type SiblingKey = { id: string; sortKey: string };

/**
 * The sort key that puts a row at `position` among `siblings`. `excludeId` is the row being
 * moved, so moving it within its own level does not treat it as its own neighbour.
 *
 * Shared by every ordered tree — outline nodes and notes — because where "after X" lands is
 * a property of the ordering, not of what the rows hold.
 */
export function keyAtPosition(
  siblings: readonly SiblingKey[],
  position: Position,
  excludeId?: string,
): string {
  const level = siblings.filter((s) => s.id !== excludeId);
  switch (position.at) {
    case "first":
      return between(null, level[0]?.sortKey ?? null);
    case "last":
      return between(level[level.length - 1]?.sortKey ?? null, null);
    case "before": {
      const index = level.findIndex((s) => s.id === position.siblingId);
      if (index === -1) throw new Error(`Sibling not found: ${position.siblingId}`);
      return between(level[index - 1]?.sortKey ?? null, level[index].sortKey);
    }
    case "after": {
      const index = level.findIndex((s) => s.id === position.siblingId);
      if (index === -1) throw new Error(`Sibling not found: ${position.siblingId}`);
      return between(level[index].sortKey, level[index + 1]?.sortKey ?? null);
    }
  }
}

/**
 * Indent: the row becomes the last child of the sibling above it. Throws for the first row
 * of a level, which has nothing above it to go under; `noun` names the row in that message.
 */
export function indentParentId(
  siblings: readonly SiblingKey[],
  id: string,
  noun: string,
): string {
  const index = siblings.findIndex((s) => s.id === id);
  const above = siblings[index - 1];
  if (index <= 0 || !above) {
    throw new Error(
      `Nothing to indent under — this is the first ${noun} at its level.`,
    );
  }
  return above.id;
}

/**
 * Move up or down: the position that swaps the row with its neighbour, or null when it is
 * already at that end of its level — a no-op rather than an error.
 */
export function verticalPosition(
  siblings: readonly SiblingKey[],
  id: string,
  direction: "up" | "down",
): Position | null {
  const index = siblings.findIndex((s) => s.id === id);
  const neighbour = siblings[direction === "up" ? index - 1 : index + 1];
  if (!neighbour) return null;
  return { at: direction === "up" ? "before" : "after", siblingId: neighbour.id };
}
