import type { NodeState, NodeType } from "@/db/schema";

/**
 * How deep each type sits in the hierarchy. Lower is broader.
 *
 * Result Area → Goal → Project → Task is the shape the app is *for*, but it is a planning
 * aid, not a filing requirement. There is only one rule: **you cannot go backwards.** A
 * child may be the same rank as its parent or deeper, never shallower — a Project never
 * contains a Goal. Each level may nest inside itself without limit, which is how Achieve
 * puts it: "use as many levels as you need."
 */
const RANK: Record<NodeType, number> = {
  result_area: 0,
  goal: 1,
  project: 2,
  task: 3,
};

/** Display names, used in the UI and in error messages. */
export const TYPE_LABELS: Record<NodeType, string> = {
  result_area: "Result Area",
  goal: "Goal",
  project: "Project",
  task: "Task",
};

/**
 * What the UI calls a row, which is one more thing than the database stores: a **Dream is a
 * Goal with `isDream` set** (see `schema.ts`), sharing the Goal form, the Goals tab and the
 * Goal rank in the hierarchy. It differs only in what it means — a goal you want but have
 * not committed to a date for — and Achieve still lists it beside Goal when you create an
 * item, because that is the moment the distinction is worth making.
 *
 * So the picker, the icon and the labels speak in kinds; everything below this line —
 * `canNest`, the tree mutations, the schema — stays in the four types.
 */
export type NodeKind = NodeType | "dream";

/** Every kind, broadest first, which is also the order the new-child picker lists them. */
export const NODE_KINDS: NodeKind[] = [
  "result_area",
  "goal",
  "dream",
  "project",
  "task",
];

export const KIND_LABELS: Record<NodeKind, string> = { ...TYPE_LABELS, dream: "Dream" };

/**
 * What a row filed *under* another row of the same kind is called.
 *
 * Achieve has words for the two that matter — Subproject and Subtask — and none for the rest,
 * so the broader kinds take the hyphenated form rather than inventing "Subresult area".
 */
export const SUB_KIND_LABELS: Record<NodeKind, string> = {
  result_area: "Sub-area",
  goal: "Sub-goal",
  dream: "Sub-dream",
  project: "Subproject",
  task: "Subtask",
};

/** One line each, for the picker — what you would be choosing, not what it is called. */
export const KIND_HINTS: Record<NodeKind, string> = {
  result_area: "A major dimension of your life; the roles everything else hangs from.",
  goal: "An outcome you are committed to, with a horizon and a deadline.",
  dream: "A goal you want but have not committed to a date for.",
  project: "Work with a schedule, broken into tasks.",
  task: "One thing you do and check off.",
};

/** The row a kind creates. Dream is the only kind that is not its own type. */
export function nodeFromKind(kind: NodeKind): { type: NodeType; isDream: boolean } {
  return kind === "dream"
    ? { type: "goal", isDream: true }
    : { type: kind, isDream: false };
}

/** The kind an existing row reads as. Only a goal can be a dream. */
export function kindOfNode(node: { type: NodeType; isDream?: boolean }): NodeKind {
  return node.type === "goal" && node.isDream ? "dream" : node.type;
}

/**
 * Display names for the work states, in the order Achieve lists them.
 *
 * One definition rather than one per surface: the outline column, its row editor, and the
 * detail forms all read from here, so widening the enum cannot leave a dropdown behind.
 *
 * Key order is load-bearing: column sort and group-by-State use it as the workflow rank
 * rather than sorting the labels alphabetically (Cancelled before Completed before …).
 */
export const STATE_LABELS: Record<NodeState, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
  postponed: "Postponed",
  delegated: "Delegated",
  should_delegate: "Should delegate",
  cancelled: "Cancelled",
  proposed: "Proposed",
};

/** Achieve's workflow order — same sequence as {@link STATE_LABELS}' key order. */
export const STATE_ORDER = Object.keys(STATE_LABELS) as NodeState[];

/**
 * Rank for sorting / grouping by State. Unknown values sort last so a future enum member
 * does not land at the top of a sorted column before its label exists.
 */
export function stateRank(state: string): number {
  const index = (STATE_ORDER as readonly string[]).indexOf(state);
  return index === -1 ? STATE_ORDER.length : index;
}

/**
 * The two-letter codes Achieve prints in the State column of its Projects and Tasks grids,
 * where a full label would cost more width than the column has.
 *
 * Distinct from the derived scheduling Status beside it — see `status.ts`.
 */
export const STATE_CODES: Record<NodeState, string> = {
  not_started: "NS",
  in_progress: "IP",
  waiting: "W",
  completed: "C",
  postponed: "P",
  delegated: "D",
  should_delegate: "SD",
  cancelled: "Cn",
  proposed: "PR",
};

/** The same list as `{ value, label }` pairs, for `<select>` and the form fields. */
export const STATE_OPTIONS: { value: NodeState; label: string }[] = (
  Object.keys(STATE_LABELS) as NodeState[]
).map((value) => ({ value, label: STATE_LABELS[value] }));

/**
 * The top level hosts anything.
 *
 * Requiring a home for every row is the busywork this app exists to avoid: the hierarchy
 * earns its keep when you plan top-down, but when you already know the specific thing you
 * need to do, working out where it belongs can cost more than doing it. Achieve agrees —
 * its project picker offers `<No Project>`, and its outline puts tasks straight under a
 * Result Area.
 *
 * These rules live here rather than in database CHECK constraints so they can be unit
 * tested, and so loosening the hierarchy does not require a migration.
 */
export function canNest(child: NodeType, parent: NodeType | null): boolean {
  return parent === null || RANK[child] >= RANK[parent];
}

/**
 * Throws a message naming both types, so the failure reads clearly whether it surfaces in
 * a test, a server action, or the UI.
 */
export function assertCanNest(child: NodeType, parent: NodeType | null): void {
  if (!canNest(child, parent)) {
    const parentLabel = parent === null ? "the top level" : `a ${TYPE_LABELS[parent]}`;
    throw new Error(`A ${TYPE_LABELS[child]} cannot go under ${parentLabel}.`);
  }
}

/** The type created by default when adding a child to `parent`. */
export function defaultChildType(parent: NodeType | null): NodeType {
  switch (parent) {
    case null:
      return "result_area";
    case "result_area":
    case "goal":
      return "project";
    case "project":
    case "task":
      return "task";
  }
}

/**
 * The kinds you may create under `parent`, broadest first — everything `canNest` allows,
 * with Dream sitting beside Goal.
 *
 * Derived from `canNest` rather than listed per parent, so loosening the nesting rule
 * widens the picker in the same edit.
 */
export function allowedChildKinds(parent: NodeType | null): NodeKind[] {
  return NODE_KINDS.filter((kind) => canNest(nodeFromKind(kind).type, parent));
}
