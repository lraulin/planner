import type { PriorityLetter } from "@/db/schema";

export type PriorityMaintenanceItem = {
  id: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
};

export type PriorityMaintenanceAssignment = {
  id: string;
  letter: PriorityLetter | null;
  rank: number | null;
};

function rankedInLetter(
  items: readonly PriorityMaintenanceItem[],
  letter: PriorityLetter,
  excludeId?: string,
): PriorityMaintenanceItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        item.id !== excludeId &&
        item.priorityLetter === letter &&
        item.priorityRank !== null,
    )
    .sort(
      (a, b) =>
        (a.item.priorityRank ?? 0) - (b.item.priorityRank ?? 0) || a.index - b.index,
    )
    .map(({ item }) => item);
}

function assignmentFor(
  item: PriorityMaintenanceItem,
  letter: PriorityLetter,
  rank: number | null,
): PriorityMaintenanceAssignment | null {
  if (item.priorityLetter === letter && item.priorityRank === rank) return null;
  return { id: item.id, letter, rank };
}

/**
 * Densify every ranked sibling group without converting bare priorities into ranked ones.
 * Input order is the stable tie-breaker, which preserves the user's visible order when old
 * data contains duplicate ranks. Call this with the complete persisted sibling set.
 */
export function removePriorityGaps(
  items: readonly PriorityMaintenanceItem[],
): PriorityMaintenanceAssignment[] {
  const assignments: PriorityMaintenanceAssignment[] = [];
  for (const letter of ["A", "B", "C", "D"] as PriorityLetter[]) {
    rankedInLetter(items, letter).forEach((item, index) => {
      const assignment = assignmentFor(item, letter, index + 1);
      if (assignment) assignments.push(assignment);
    });
  }
  return assignments;
}

/**
 * Put the selected item at the front of its current letter and shift ranked siblings down.
 * Bare letter siblings stay bare; they are a separate, intentional Achieve state and should
 * not be silently turned into numbered priorities by a repair command.
 */
export function reprioritizeUnique(
  items: readonly PriorityMaintenanceItem[],
  selectedId: string,
): PriorityMaintenanceAssignment[] {
  const selected = items.find((item) => item.id === selectedId);
  if (!selected || selected.priorityLetter === null) return [];

  const letter = selected.priorityLetter;
  const assignments: PriorityMaintenanceAssignment[] = [];
  const selectedAssignment = assignmentFor(selected, letter, 1);
  if (selectedAssignment) assignments.push(selectedAssignment);

  rankedInLetter(items, letter, selectedId).forEach((item, index) => {
    const assignment = assignmentFor(item, letter, index + 2);
    if (assignment) assignments.push(assignment);
  });

  return assignments;
}
