import type {
  GoalDetails,
  NodeItem,
  NodeItemKind,
  NodeState,
  NodeType,
  PriorityLetter,
  ProjectDetails,
  ResultAreaDetails,
  TaskDetails,
} from "@/db/schema";

/**
 * One note attached to a record, for the read-only reverse surface on the node drawer.
 * Snippet is precomputed so the drawer does not re-run markdown stripping on every open.
 */
export type LinkedNoteSummary = {
  id: string;
  title: string;
  noteDate: Date | null;
  snippet: string;
  updatedAt: Date;
};

/**
 * A single record with everything its detail form needs: the core fields it shares with
 * every other type, the side table for its own type, and its repeating child lists.
 *
 * Rollups (effort, % complete, child counts) are deliberately absent — the grid already
 * holds them on the `OutlineNode` it opened the drawer from, so the form reads them from
 * there rather than recomputing the subtree for one row.
 */
export type NodeDetail = {
  id: string;
  type: NodeType;
  name: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  state: NodeState;
  deadline: Date | null;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  deferredDate: Date | null;
  focus: boolean;
  notes: string;
  resultArea: ResultAreaDetails | null;
  goal: GoalDetails | null;
  project: ProjectDetails | null;
  task: TaskDetails | null;
  items: NodeItem[];
  /** Notes from the notes table linked to this record (not `nodes.notes`). */
  linkedNotes: LinkedNoteSummary[];
  /**
   * The day this task currently sits on in the Day tab, `YYYY-MM-DD`, or null.
   *
   * Read-only here and deliberately outside `NodeDetailValues`: it lives in `daily_items`,
   * not on the node, and the field writes immediately rather than on drawer save. Planning
   * a day is a separate act from editing the task record — and it is emphatically not a
   * deadline, which is the whole reason it is not just another date column.
   */
  plannedDay: string | null;
};

/**
 * The core fields every form edits, whatever the type.
 *
 * The three scheduling dates are here rather than on the per-type halves because they live
 * on `nodes` — a project shelves and plans exactly as a task does, and the database enforces
 * the rule between the start and the deferred date, which it could not do across tables.
 */
export type CoreValues = {
  name: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  state: NodeState;
  deadline: Date | null;
  targetStartDate: Date | null;
  targetEndDate: Date | null;
  deferredDate: Date | null;
  focus: boolean;
  notes: string;
};

/**
 * A save from the drawer. The type-specific halves are partial and optional: a form only
 * sends the side table belonging to its own type, and `saveNodeDetail` ignores a half that
 * does not match the record's type rather than trusting the caller.
 */
export type NodeDetailValues = CoreValues & {
  resultArea?: Partial<Omit<ResultAreaDetails, "nodeId">>;
  goal?: Partial<Omit<GoalDetails, "nodeId">>;
  project?: Partial<Omit<ProjectDetails, "nodeId">>;
  task?: Partial<Omit<TaskDetails, "nodeId">>;
};

/**
 * The same save with every core field optional, for callers that mean "change these and
 * leave the rest" — quick capture applying its defaults, for instance.
 *
 * `saveNodeDetail` has always written only the keys it was given, so this is the shape it
 * actually accepts. The drawer keeps the stricter `NodeDetailValues`: its forms are
 * expected to send a complete record, and a missing field there is a bug worth a type
 * error rather than a silently unchanged column.
 */
export type NodeDetailPatch = Partial<CoreValues> &
  Pick<NodeDetailValues, "resultArea" | "goal" | "project" | "task">;

/** The editable columns of a repeating list row. */
export type NodeItemValues = Partial<
  Omit<
    NodeItem,
    "id" | "userId" | "nodeId" | "kind" | "sortKey" | "createdAt" | "updatedAt"
  >
>;

/** Where a new list row goes relative to the row that was selected when it was added. */
export type ItemPosition =
  | { at: "last" }
  | { at: "before"; siblingId: string }
  | { at: "after"; siblingId: string };

export type ItemsByKind = Record<NodeItemKind, NodeItem[]>;
