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
  /**
   * Hide tasks already sitting on an open day in the Day tab.
   *
   * Franklin Covey's master list works this way: once you decide *when* you are doing
   * something, it leaves the list of things still to be decided about. On by default for
   * the To-do List, which is the master list, and off everywhere else — Best Overall is
   * asking "what is the best use of my time right now", and the answer may well be the
   * thing you already planned for today.
   *
   * Purely a display filter. It changes nothing about the task and never touches the score.
   */
  hidePlanned: boolean;
  /**
   * Achieve's Date Filter dropdown (manual §8) — Current, Overdue, Behind Schedule, Due
   * Soon, the next-N-days bands, and Group By Deadline.
   *
   * Per view like everything else here, because the views ask different questions: Urgent
   * narrowed to Overdue and Best Overall showing everything is a coherent pair, and one
   * shared value would make picking a view silently re-narrow the list. Defaults to `none`
   * everywhere — a view's own `keep` and weights already say what it is about, and a
   * default that hides work would be a filter nobody chose.
   */
  dateFilter: ChooserDateFilter;
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
