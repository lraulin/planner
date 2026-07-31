import type { NodeState } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
import type { ChooserWeights } from "./score";

/** The five views this slice ships. See `shape.md` for the three that were dropped. */
export type ChooserViewId =
  "best-overall" | "next-action" | "todo-list" | "urgent" | "deadlines";

/** Achieve's Date dropdown (manual §8.1.3). Display only — never touches the score. */
export type ChooserDateFilter =
  | "none"
  | "current"
  | "overdue"
  | "behind"
  | "due-soon"
  | "next-7"
  | "next-14"
  | "next-30"
  | "group-by-deadline";

/**
 * Everything the Settings dialog owns, per view. Persisted to `localStorage`; see
 * `src/components/chooser/useChooserSettings.ts`.
 */
export type ChooserSettings = {
  weights: ChooserWeights;
  /** Manual §8.3 — collapse the list to one item per project. */
  onlyNextAction: boolean;
  /**
   * Manual §8.3 — which item that is: the project's topmost task in priority order
   * (checked) or its highest-scoring one (unchecked).
   */
  useTaskPriorityOrder: boolean;
  /**
   * Which work states appear, per view.
   *
   * Replaces what began as a single `includeDeferred` flag. Two overlapping mechanisms —
   * a hard-coded "never show completed or cancelled" plus one toggle for postponed —
   * meant the answer to "why is this row missing?" lived in two places and only one of
   * them was adjustable. One list settles it: what is ticked is what you see.
   *
   * `completed` and `cancelled` are off by default in every view. They are still *offered*
   * rather than forbidden, because a hidden rule you cannot inspect is worse than a
   * checkbox you will not tick.
   */
  states: NodeState[];
};

/** One scored candidate, with the ancestor facts gathered on the way. */
export type ChooserItem = {
  node: OutlineNode;
  score: number;
  /** Earliest deadline on the item or any ancestor. */
  effectiveDeadline: Date | null;
  /** Nearest project ancestor, or the item itself when it is a task-less project. */
  projectId: string | null;
  /** Ancestor names, root first, excluding the item. Backs the `Project:` breadcrumb. */
  breadcrumb: string[];
  /**
   * Position in the source outline, which arrives in depth-first sort-key order. This is
   * what "topmost task in the project's task list" means for the next-action rule.
   */
  order: number;
};
