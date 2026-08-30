import type { NodeState } from "@/db/schema";

/**
 * Which priority fields drop out of the ranking when a node is completed or cancelled.
 *
 * Outline Pri is where the item sits among siblings in the project. A one-shot finish or
 * a cancel takes it out of that ranking. A recurring task that cycles still lives in the
 * outline, so it keeps outline Pri.
 *
 * TC Pri is what you decided to do today. Tomorrow's to-do list is a new ranking, so TC
 * is always cleared on complete/cancel — including a recurring cycle.
 *
 * The only place this table lives. Mutations ask it; they do not restate it. Cannot key
 * off resulting state alone: a cycling recurring task never lands on `completed`.
 */
export type PriorityFieldsToClear = {
  outline: boolean;
  tc: boolean;
};

export function priorityFieldsToClearOnSettle({
  requested,
  cycles,
}: {
  requested: NodeState;
  cycles: boolean;
}): PriorityFieldsToClear {
  if (requested === "cancelled") {
    return { outline: true, tc: true };
  }
  if (requested === "completed") {
    return { outline: !cycles, tc: true };
  }
  return { outline: false, tc: false };
}
