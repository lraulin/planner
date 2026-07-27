import type { NodeState, NodeType, PriorityLetter } from "@/db/schema";

/** One row as loaded from the database, before derived values are computed. */
export type OutlineRow = {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  sortKey: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  state: NodeState;
  deadline: Date | null;
  focus: boolean;
  collapsed: boolean;
  notes: string;
  completedAt: Date | null;
  depth: number;
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  actualEffortMinutes: number | null;
  percentComplete: number | null;
  contexts: string[] | null;
  color: string | null;
  category: string | null;
};

/** A row plus everything derived from its position in the tree. */
export type OutlineNode = OutlineRow & {
  /**
   * Achieve's "L.A.P." column — the priority inherited from the nearest ancestor that has
   * one, starting with the node itself. Used as a sort key so children rank beneath the
   * importance of their parent.
   */
  lapLetter: PriorityLetter | null;
  lapRank: number | null;
  /** Effort summed across the subtree. A leaf reports its own; a parent reports its leaves. */
  effortRollupMinutes: number | null;
  effortLeftRollupMinutes: number | null;
  actualEffortRollupMinutes: number;
  /** Percent complete, weighted by effort across the subtree. */
  percentCompleteRollup: number;
  childCount: number;
  hasChildren: boolean;
  /** True when an ancestor is collapsed, so the row should not render. */
  hidden: boolean;
};

/** Where a node goes among its new siblings. */
export type Position =
  | { at: "first" }
  | { at: "last" }
  | { at: "before"; siblingId: string }
  | { at: "after"; siblingId: string };
