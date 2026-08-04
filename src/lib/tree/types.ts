import type {
  NodeState,
  NodeType,
  PriorityLetter,
  RecurrenceFrequency,
} from "@/db/schema";
import type { Shelf } from "./shelving";

/** One row as loaded from the database, before derived values are computed. */
export type OutlineRow = {
  id: string;
  parentId: string | null;
  type: NodeType;
  name: string;
  sortKey: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  /**
   * Task Chooser priority — the flat cross-project ranking, independent of the
   * sibling-relative `priorityLetter`. See `nodes.tcPriorityLetter` in the schema.
   */
  tcPriorityLetter: PriorityLetter | null;
  tcPriorityRank: number | null;
  state: NodeState;
  deadline: Date | null;
  focus: boolean;
  collapsed: boolean;
  notes: string;
  /** True for the one project quick capture drops into. See `src/lib/capture/`. */
  isInbox: boolean;
  completedAt: Date | null;
  /** Calendar completion date for tasks; falls back to the completion instant for other rows. */
  dateCompleted: Date | null;
  /** True instants, unlike the calendar-day fields above and below. */
  createdAt: Date;
  updatedAt: Date;
  depth: number;
  effortMinutes: number | null;
  effortLeftMinutes: number | null;
  actualEffortMinutes: number | null;
  percentComplete: number | null;
  contexts: string[] | null;
  /** Type-specific grid fields, kept here because the whole-outline read feeds every grid. */
  actualStartDate: Date | null;
  description: string;
  effortDriven: boolean | null;
  leadTimeMinutes: number | null;
  deadlineLeadTimeMinutes: number | null;
  place: string;
  expectedCost: number | null;
  costLow: number | null;
  costHigh: number | null;
  costToDate: number | null;
  color: string | null;
  category: string | null;
  /**
   * Result-area only: Achieve's 0–100 weighting of this area against the others. Read by
   * the Task Chooser score, which inherits it from the nearest result-area ancestor.
   */
  importance: number | null;
  /** Scheduling dates. On `nodes`, so any type can carry them. */
  targetStart: Date | null;
  targetEnd: Date | null;
  /**
   * When a `postponed` node comes back on its own — the expiry of the shelf, not a second
   * hiding mechanism. Null on a node that is not shelved, and on one shelved indefinitely.
   *
   * Read `effectivePostponedUntil` on the derived node rather than this: shelving is
   * inherited, so a row with no date of its own may still be shelved by an ancestor.
   */
  deferredDate: Date | null;
  /**
   * Task only: how often the task repeats. `none` — the default and the value every
   * non-task row reports — means it does not.
   *
   * Carried on the outline row only so a repeating row can be marked as one; the rule
   * itself lives on the detail record. The rest of the recurrence columns are deliberately
   * *not* here — the outline loads every row on every render, and nothing on it reads them.
   */
  recurrenceFrequency: RecurrenceFrequency;
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
  /** Nearest Result Area's name, for project rows and cross-tree inspection. */
  resultAreaName: string | null;
  /** Raw priority of the nearest Project (not the node's L.A.P.). */
  projectPriorityLetter: PriorityLetter | null;
  projectPriorityRank: number | null;
  /**
   * Category inherited from the nearest ancestor that carries one, starting with the node
   * itself — the same walk as L.A.P., and for the same reason.
   *
   * In practice only Result Areas are given a category, but the field is on every row and
   * the rule does not care which type set it. Treating category as an ordinary inherited
   * property is what lets it be a column you can show, sort, filter and search like any
   * other, rather than a grouping dimension with no visible value behind it.
   *
   * Trimmed, so `"Personal "` and `"Personal"` are one category. Null when nothing above
   * the row has one.
   */
  effectiveCategory: string | null;
  /** Effort summed across the subtree. A leaf reports its own; a parent reports its leaves. */
  effortRollupMinutes: number | null;
  effortLeftRollupMinutes: number | null;
  actualEffortRollupMinutes: number;
  /** Percent complete, weighted by effort across the subtree. */
  percentCompleteRollup: number;
  childCount: number;
  /**
   * Structural: any child rows exist. Drives expand/collapse chrome and effort rollup
   * display — completed children still count.
   */
  hasChildren: boolean;
  /**
   * At least one child is still open (not completed or cancelled). The Task Chooser treats
   * a node with only finished children as a leaf (Achieve: "no children or only completed
   * children").
   */
  hasActiveChildren: boolean;
  /** True when an ancestor is collapsed, so the row should not render. */
  hidden: boolean;
  /**
   * The shelf holding this row, its own or inherited from an ancestor — see
   * `src/lib/tree/shelving.ts`. Null when nothing shelves it.
   *
   * Not yet expired: whether the shelf still holds is a question about *today*, which the
   * reader supplies. Use `shelfHolds` / `effectiveState` rather than reading it raw.
   */
  shelf: Shelf | null;
};

/** Where a node goes among its new siblings. */
export type Position =
  | { at: "first" }
  | { at: "last" }
  | { at: "before"; siblingId: string }
  | { at: "after"; siblingId: string };
