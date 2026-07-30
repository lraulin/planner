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
  /** True for the one project quick capture drops into. See `src/lib/capture/`. */
  isInbox: boolean;
  completedAt: Date | null;
  depth: number;
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  actualEffortMinutes: number | null;
  percentComplete: number | null;
  contexts: string[] | null;
  color: string | null;
  category: string | null;
  /**
   * Result-area only: Achieve's 0–100 weighting of this area against the others. Read by
   * the Task Chooser score, which inherits it from the nearest result-area ancestor.
   */
  importance: number | null;
  /**
   * Scheduling dates, merged across the type-specific tables so the grid has one source
   * per column: a project's come from `project_details`, a task's from `task_details`,
   * and every other type has none.
   */
  targetStart: Date | null;
  targetEnd: Date | null;
  /** Project fields, for the Tasks tab's purpose panel and the Delegation view. */
  purpose: string;
  assignedTo: string;
  /** Goal fields, for the Goals tab's own columns. */
  definition: string;
  range: string;
  isDream: boolean;
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
