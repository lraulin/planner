import type { NodeState, NodeType } from "@/db/schema";
import { effectiveState, type Shelf } from "@/lib/tree/shelving";

export type OrganizerQueueNode = {
  id: string;
  parentId: string | null;
  type: NodeType;
  sortKey: string;
  state: NodeState | null;
  isInbox: boolean;
  shelf: Shelf | null;
};

/** Direct Inbox children are processing units; descendants travel with their root branch. */
export function organizerQueue<T extends OrganizerQueueNode>(
  nodes: readonly T[],
  today: string | null,
): T[] {
  const inbox = nodes.find((node) => node.isInbox);
  if (!inbox) return [];

  return nodes
    .filter(
      (node) =>
        node.parentId === inbox.id &&
        node.type === "task" &&
        effectiveState(node.state, node.shelf, today) !== "postponed" &&
        node.state !== "completed" &&
        node.state !== "cancelled",
    )
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}
