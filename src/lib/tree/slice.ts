import { shiftDateKey, toDateKey } from "@/lib/schedule/geometry";
import { STATE_LABELS } from "./hierarchy";
import { ownEffectiveState, shelfHolds } from "./shelving";
import type { OutlineNode } from "./types";

/**
 * Context a grid row inherits from its ancestors — the nearest result area (and that
 * area's category) and the nearest goal. Used for grouping headers and the Tasks tab's
 * purpose panel, without the grid having to walk the tree itself.
 */
export type RowContext = {
  resultAreaId: string | null;
  resultAreaName: string | null;
  resultAreaColor: string | null;
  category: string | null;
  goalId: string | null;
  goalName: string | null;
  /**
   * Nearest project at or above the row — the row itself when it *is* a project, so
   * grouping tasks by project puts a sub-project's tasks under that sub-project rather than
   * under its parent.
   */
  projectId: string | null;
  projectName: string | null;
};

/**
 * A row the grid renders. The payload is a type parameter so tabs whose rows are not
 * `OutlineNode`s — the Notes tab — can reuse `DataGrid` rather than hand-rolling a second
 * grid the way Wish List had to. It defaults to `OutlineNode`, so the tree tabs write
 * `GridRow` exactly as before.
 */
export type GridRow<T = OutlineNode> =
  | {
      kind: "group";
      id: string;
      label: string;
      count: number;
      depth: number;
      collapsed: boolean;
    }
  | {
      kind: "node";
      id: string;
      node: T;
      depth: number;
      /** Ancestor context, for grouping. Only tree rows carry it. */
      context?: RowContext;
      /**
       * Children **within this row set**, which is not the same as the node's children in
       * the tree: on Projects a project whose only children are tasks is a leaf, because
       * tasks are not rows here. The expander reads this, so a row only offers to collapse
       * something the grid can actually hide.
       *
       * Absent on row sets that *are* the tree (the Outline), where the node's own
       * `hasChildren` / `childCount` are already the answer.
       */
      branch?: { hasChildren: boolean; childCount: number };
    };

/**
 * A dimension rows can be grouped under. The first three come from a row's **ancestry** and
 * were the original fixed set; the rest come from the row's **own fields**, and exist so
 * grouping is a control the user drives rather than a per-tab arrangement baked into each
 * grid's `sliceTree` call.
 */
export type GroupBy =
  | "category"
  | "resultArea"
  | "goal"
  | "project"
  | "state"
  | "priorityLetter"
  | "deadlineBand";

export const GROUP_BY_VALUES: readonly GroupBy[] = [
  "category",
  "resultArea",
  "goal",
  "project",
  "state",
  "priorityLetter",
  "deadlineBand",
];

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  category: "Category",
  resultArea: "Result Area",
  goal: "Goal",
  project: "Project",
  state: "State",
  priorityLetter: "Priority",
  deadlineBand: "Deadline",
};

/** Narrow stored strings to legal dimensions, dropping any retired in a later build. */
export function asGroupBy(values: readonly string[]): GroupBy[] {
  return values.filter((value): value is GroupBy =>
    (GROUP_BY_VALUES as readonly string[]).includes(value),
  );
}

/**
 * How many dimensions may be stacked. Three already nests headers three deep before the
 * first row; a fourth is a tree with no leaves left to read.
 */
export const MAX_GROUP_LEVELS = 3;

/**
 * Set one level of a grouping, returning the new list.
 *
 * The rules that make the picker behave the way people expect:
 *
 * - **Clearing a level truncates the ones below it.** "Group by Result Area, then State"
 *   with Result Area cleared cannot mean "group by State at level two" — there is no level
 *   one left for it to sit under.
 * - **A dimension may appear once.** Choosing one that is already used elsewhere *moves*
 *   it rather than duplicating it, because grouping by State inside State is a no-op that
 *   looks like a broken control.
 * - **Setting a level past the end appends**, so the "then by…" select the UI shows at the
 *   end does not need to know its own index.
 */
export function setGroupLevel(
  levels: readonly GroupBy[],
  index: number,
  value: GroupBy | null,
): GroupBy[] {
  if (index < 0 || index >= MAX_GROUP_LEVELS) return [...levels];

  if (value === null) return levels.slice(0, index);

  const next = levels.slice(0, Math.min(index, levels.length));
  next[index] = value;

  // Drop any later duplicate of the dimension just chosen, and any hole a sparse write
  // could have left.
  const seen = new Set<GroupBy>();
  const out: GroupBy[] = [];
  for (const level of [...next, ...levels.slice(index + 1)]) {
    if (level === undefined || seen.has(level)) continue;
    seen.add(level);
    out.push(level);
  }
  return out.slice(0, MAX_GROUP_LEVELS);
}

export type SliceOpts = {
  /** Which nodes survive into the row set. Type filters live here. */
  keep: (node: OutlineNode) => boolean;
  /**
   * Nested group headers, outer first. Projects uses `["category", "resultArea"]` when
   * Groups is on; Goals uses `["resultArea"]`.
   */
  groupBy?: GroupBy[];
  /**
   * Subtree root from a scope picker. `null` / omitted means the whole tree. The root
   * itself is included when it passes `keep`.
   */
  scopeId?: string | null;
  /**
   * When false, shelved nodes are dropped — Achieve's Deferred toggle off.
   *
   * Shelved by the one rule in `src/lib/tree/shelving.ts`, so this now also drops a node
   * waiting on a deferred date and a node under a deferred ancestor, neither of which the
   * old `state === "postponed"` test could see.
   */
  includeDeferred: boolean;
  /** For deciding whether a dated shelf has expired. Null treats none as expired. */
  today: string | null;
};

type Prepared = {
  node: OutlineNode;
  depth: number;
  /** Nearest ancestor that also survived `keep`, or null once re-based to the top. */
  parentId: string | null;
  context: RowContext;
  /** Direct children among the kept rows. Filled once the whole kept set is known. */
  childCount: number;
};

/**
 * Turn a derived outline into the flat row list a grid tab renders: keep a type/scope
 * slice, re-base indentation onto kept ancestors, attach inherited context, and optionally
 * insert group headers.
 *
 * Pure and free of I/O so the Projects / Tasks / Goals keep-filters and group toggles can
 * be unit-tested without mounting a grid.
 */
export function sliceTree(nodes: OutlineNode[], opts: SliceOpts): GridRow[] {
  const byId = new Map<string, OutlineNode>();
  for (const node of nodes) byId.set(node.id, node);

  const kept: Prepared[] = [];

  for (const node of nodes) {
    if (!opts.includeDeferred && shelfHolds(node.shelf, opts.today)) continue;
    if (!inScope(node, opts.scopeId, byId)) continue;
    if (!opts.keep(node)) continue;
    kept.push({
      node,
      depth: 0, // filled after we know the full kept set
      parentId: null,
      context: contextFor(node, byId),
      childCount: 0,
    });
  }

  const keptIds = new Set(kept.map((k) => k.node.id));
  const byKeptId = new Map(kept.map((entry) => [entry.node.id, entry]));
  for (const entry of kept) {
    const rebased = rebase(entry.node, keptIds, byId);
    entry.depth = rebased.depth;
    entry.parentId = rebased.parentId;
    if (rebased.parentId) {
      const parent = byKeptId.get(rebased.parentId);
      if (parent) parent.childCount += 1;
    }
  }

  const shown = expanded(kept, byKeptId);

  const groupBy = opts.groupBy ?? [];
  if (groupBy.length === 0) {
    return shown.map(toNodeRow);
  }

  return emitGrouped(shown, groupBy, opts.today);
}

/**
 * Drop the rows sitting under a collapsed row.
 *
 * `collapsed` is a field on the record, not a per-tab toggle — Achieve calls it "Expanded"
 * and it means the same thing wherever the row appears. So collapsing a project on the
 * Projects tab hides its sub-projects there and its tasks on the Outline; one row, one
 * disclosure state.
 *
 * Relies on parents preceding children in `kept`, which holds because the derived outline
 * is in DFS order and `keep` only removes rows. One forward pass therefore sees every
 * ancestor's verdict before it needs it.
 */
function expanded(kept: Prepared[], byKeptId: Map<string, Prepared>): Prepared[] {
  const hidden = new Set<string>();

  return kept.filter((entry) => {
    const parent = entry.parentId ? byKeptId.get(entry.parentId) : undefined;
    if (!parent) return true;
    if (hidden.has(parent.node.id) || parent.node.collapsed) {
      hidden.add(entry.node.id);
      return false;
    }
    return true;
  });
}

/** The label a blank or missing category groups under, in both grouping paths. */
export const NO_CATEGORY = "(No Category)";

/** Prefix for outline category group row ids (`category:Work`, `category:(No Category)`). */
export const CATEGORY_GROUP_PREFIX = "category:";

/**
 * Category headers over the outline, which needs a different treatment from the list tabs:
 * there, grouping *is* the arrangement, so `sliceTree` can emit a header wherever the key
 * changes. Here the tree is the arrangement and grouping is laid over it, so subtrees have
 * to be gathered under one header each rather than fragmented wherever tree order happens
 * to alternate.
 *
 * So each top-level subtree is moved whole, ordered by category (named ones first,
 * alphabetically; uncategorised last) and otherwise keeping tree order. A subtree takes the
 * category of the nearest result area at or above its root — categories live on result
 * areas — and a nested result area of another category does *not* split the block it sits
 * in, because a row is easier to find under the area it belongs to than under a header its
 * parent has moved away from.
 *
 * `visible` is the rows the outline is already showing, in tree order; `byId` covers the
 * whole tree, so an ancestor hidden by a filter still supplies its category.
 */
export function groupByCategory(
  visible: OutlineNode[],
  byId: Map<string, OutlineNode>,
): GridRow[] {
  const shown = new Set(visible.map((node) => node.id));

  type Block = { label: string; nodes: OutlineNode[] };
  const blocks: Block[] = [];

  for (const node of visible) {
    const isRoot = node.parentId === null || !shown.has(node.parentId);
    if (isRoot || blocks.length === 0) {
      blocks.push({ label: categoryOf(node, byId), nodes: [] });
    }
    blocks[blocks.length - 1].nodes.push(node);
  }

  const order = [...new Set(blocks.map((block) => block.label))].sort(
    compareCategories,
  );

  const out: GridRow[] = [];
  for (const label of order) {
    const inGroup = blocks.filter((block) => block.label === label);
    out.push({
      kind: "group",
      id: `category:${label}`,
      label,
      count: inGroup.reduce((total, block) => total + block.nodes.length, 0),
      depth: 0,
      collapsed: false,
    });
    for (const block of inGroup) {
      for (const node of block.nodes) {
        out.push({ kind: "node", id: node.id, node, depth: node.depth });
      }
    }
  }

  return out;
}

/** Uncategorised sits last; everything else is alphabetical. */
function compareCategories(a: string, b: string): number {
  if (a === b) return 0;
  if (a === NO_CATEGORY) return 1;
  if (b === NO_CATEGORY) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Effective category label for outline grouping: nearest result area at or above `node`
 * that has a non-blank category, else {@link NO_CATEGORY}. Categories are stored only on
 * result areas; other types inherit for display via this walk.
 *
 * The label is always trimmed so `"Personal "` and `"Personal"` group together.
 */
export function categoryOf(node: OutlineNode, byId: Map<string, OutlineNode>): string {
  // `effectiveCategory` is computed once in `derive` by the same walk as L.A.P. Reading it
  // here rather than re-walking keeps one rule: whatever the Category column shows is what
  // grouping groups by, and neither can drift from the other.
  //
  // `byId` is no longer needed but stays in the signature — every caller has it, and the
  // parameter is what makes it obvious this is an ancestry-derived value rather than a
  // field on the row.
  void byId;
  return node.effectiveCategory ?? NO_CATEGORY;
}

/** Default result-area categories offered in the form combobox. */
export const DEFAULT_CATEGORIES = ["Personal", "Work"] as const;

/**
 * Distinct category names for the Result Area form combobox: defaults plus every non-blank
 * category already used on a result area, sorted alphabetically.
 */
export function categoryOptions(nodes: readonly OutlineNode[]): string[] {
  const seen = new Set<string>(DEFAULT_CATEGORIES);
  for (const node of nodes) {
    if (node.type !== "result_area") continue;
    const trimmed = node.category?.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

/** Group row id for a category label, matching {@link groupByCategory}. */
export function categoryGroupId(label: string): string {
  return `${CATEGORY_GROUP_PREFIX}${label}`;
}

/** Label from a category group id, or null when the id is not a category group. */
export function categoryLabelFromGroupId(groupId: string): string | null {
  if (!groupId.startsWith(CATEGORY_GROUP_PREFIX)) return null;
  return groupId.slice(CATEGORY_GROUP_PREFIX.length);
}

/**
 * Stored category value for a group label: blank/`(No Category)` becomes `null` so the
 * detail form and DB match "uncategorised".
 */
export function categoryValueFromLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed || trimmed === NO_CATEGORY) return null;
  return trimmed;
}

function toNodeRow(entry: Prepared): GridRow {
  return {
    kind: "node",
    id: entry.node.id,
    node: entry.node,
    depth: entry.depth,
    context: entry.context,
    branch: { hasChildren: entry.childCount > 0, childCount: entry.childCount },
  };
}

function inScope(
  node: OutlineNode,
  scopeId: string | null | undefined,
  byId: Map<string, OutlineNode>,
): boolean {
  if (!scopeId) return true;
  let cur: OutlineNode | undefined = node;
  while (cur) {
    if (cur.id === scopeId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/**
 * Position among kept rows only: how deep to indent, and which kept row is the parent.
 *
 * A project under a filtered-out goal sits at depth 0 with no parent; a sub-project under a
 * kept project sits at depth 1 under it. Both answers come from the same walk, because they
 * are the same question — the nearest kept ancestors.
 */
function rebase(
  node: OutlineNode,
  keptIds: Set<string>,
  byId: Map<string, OutlineNode>,
): { depth: number; parentId: string | null } {
  let depth = 0;
  let parentId: string | null = null;
  let ancestorId = node.parentId;
  while (ancestorId) {
    if (keptIds.has(ancestorId)) {
      depth += 1;
      if (parentId === null) parentId = ancestorId;
    }
    ancestorId = byId.get(ancestorId)?.parentId ?? null;
  }
  return { depth, parentId };
}

/**
 * Walk from the node up (nearest first) so a project nested under a goal under a result
 * area picks up both, and a result area's own `category` is available for grouping even
 * when the area itself is not kept.
 */
function contextFor(node: OutlineNode, byId: Map<string, OutlineNode>): RowContext {
  let resultAreaId: string | null = null;
  let resultAreaName: string | null = null;
  let resultAreaColor: string | null = null;
  let goalId: string | null = null;
  let goalName: string | null = null;
  let projectId: string | null = null;
  let projectName: string | null = null;

  let cur: OutlineNode | undefined = node;
  while (cur) {
    if (cur.type === "project" && projectId === null) {
      projectId = cur.id;
      projectName = cur.name;
    }
    if (cur.type === "result_area" && resultAreaId === null) {
      resultAreaId = cur.id;
      resultAreaName = cur.name;
      resultAreaColor = cur.color;
    }
    if (cur.type === "goal" && goalId === null) {
      goalId = cur.id;
      goalName = cur.name;
    }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  return {
    resultAreaId,
    resultAreaName,
    resultAreaColor,
    // One rule, computed in `derive`: nearest self-or-ancestor carrying a category. Not
    // re-derived from the result area here, or the header and the column could disagree.
    category: node.effectiveCategory,
    goalId,
    goalName,
    projectId,
    projectName,
  };
}

/**
 * Which group a row falls into on one dimension.
 *
 * Takes the whole prepared entry rather than only its `RowContext`: ancestry answers
 * category / result area / goal / project, but state, priority and deadline are fields on
 * the row itself. `today` is threaded through for the deadline bands, which are relative by
 * definition — and is nullable, because before hydration the client does not know what day
 * it is and must not disagree with the server about which rows are overdue.
 */
function groupKey(
  dim: GroupBy,
  entry: Prepared,
  today: string | null,
): { key: string; label: string } {
  const { context, node } = entry;

  switch (dim) {
    case "category": {
      // Key and label both use the trimmed value so accidental trailing spaces cannot
      // open a second "Personal" header that looks identical.
      const trimmed = context.category?.trim() ?? "";
      return {
        key: trimmed,
        label: trimmed || NO_CATEGORY,
      };
    }
    case "resultArea":
      return {
        key: context.resultAreaId ?? "",
        label: context.resultAreaName ?? "(No Result Area)",
      };
    case "goal":
      return {
        key: context.goalId ?? "",
        label: context.goalName ?? "(No Goal)",
      };
    case "project":
      return {
        key: context.projectId ?? "",
        label: context.projectName ?? "(No Project)",
      };
    case "state": {
      // The row's own effective state, matching what the State column shows and filters
      // on — a header saying "Postponed" over a routine whose shelf ran out yesterday
      // would be the same stale reading in a second place.
      const state = ownEffectiveState(node, today);
      return { key: state, label: STATE_LABELS[state] };
    }
    case "priorityLetter":
      return {
        key: node.priorityLetter ?? "",
        // Rank is deliberately ignored: grouping by A1, A2, A3 … is one header per row.
        label: node.priorityLetter ?? "(Unprioritized)",
      };
    case "deadlineBand": {
      const band = deadlineBandOf(node.deadline, today);
      return { key: band, label: DEADLINE_BAND_LABELS[band] };
    }
  }
}

/**
 * Coarse deadline buckets for grouping.
 *
 * Deliberately **not** the derived schedule status from `status.ts`, which folds in state,
 * target dates and priority — grouping by that would put a completed item due yesterday
 * under "Completed" while the user was asking to see what is overdue. These read the
 * deadline and nothing else, and reuse the same day boundaries as the deadline filter
 * presets in `components/grid/filters.ts` so the two controls agree.
 */
export type DeadlineBand =
  "overdue" | "today" | "tomorrow" | "next7" | "next30" | "later" | "none";

const DEADLINE_BAND_LABELS: Record<DeadlineBand, string> = {
  overdue: "Overdue",
  today: "Due Today",
  tomorrow: "Due Tomorrow",
  next7: "Next 7 Days",
  next30: "Next 30 Days",
  later: "Later",
  none: "(No Deadline)",
};

/** Band order for headers: soonest first, undated last — the order you triage in. */
const DEADLINE_BAND_ORDER: DeadlineBand[] = [
  "overdue",
  "today",
  "tomorrow",
  "next7",
  "next30",
  "later",
  "none",
];

export function deadlineBandOf(
  deadline: Date | null,
  today: string | null,
): DeadlineBand {
  if (!deadline) return "none";
  // Before hydration every dated row lands in one neutral bucket rather than being sorted
  // into bands the server would draw differently.
  if (!today) return "later";

  const key = toDateKey(deadline);
  if (key < today) return "overdue";
  if (key === today) return "today";
  if (key === shiftDateKey(today, 1)) return "tomorrow";
  if (key <= shiftDateKey(today, 7)) return "next7";
  if (key <= shiftDateKey(today, 30)) return "next30";
  return "later";
}

/**
 * Gather items under each group key so a category that appears twice in tree order
 * (Personal → Work → Personal) still produces a single Personal header.
 *
 * Category groups sort alphabetically with uncategorised last — same rule as
 * {@link groupByCategory}. Other dimensions keep first-seen order so result areas stay
 * in outline order under their category. Within a leaf group, DFS order is preserved.
 */
function gatherByGroupKeys(
  kept: Prepared[],
  groupBy: GroupBy[],
  today: string | null,
): Prepared[] {
  if (groupBy.length === 0 || kept.length === 0) return kept;

  function partition(items: Prepared[], level: number): Prepared[] {
    if (level >= groupBy.length || items.length <= 1) return items;

    const dim = groupBy[level];
    const buckets = new Map<string, Prepared[]>();
    const order: string[] = [];

    for (const item of items) {
      const { key } = groupKey(dim, item, today);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        buckets.set(key, [item]);
        order.push(key);
      }
    }

    sortGroupKeys(dim, order, buckets, today);

    const out: Prepared[] = [];
    for (const key of order) {
      out.push(...partition(buckets.get(key)!, level + 1));
    }
    return out;
  }

  return partition(kept, 0);
}

/**
 * Header order within one level, in place.
 *
 * Most dimensions keep **first-seen** order, which is outline order — a result area stays
 * where the user put it. Three have an order that is meaningful rather than incidental, and
 * leaving those to tree order would produce headers in an arbitrary sequence the user
 * cannot predict:
 *
 * - **Category** — alphabetical, uncategorised last (matches `groupByCategory`).
 * - **Priority** — A, B, C, D, then unprioritized. Not alphabetical by accident: the empty
 *   letter has to sort last, and "" sorts first.
 * - **Deadline band** — soonest first, undated last: the order you triage in.
 */
function sortGroupKeys(
  dim: GroupBy,
  order: string[],
  buckets: Map<string, Prepared[]>,
  today: string | null,
): void {
  if (dim === "category") {
    order.sort((a, b) => {
      const labelA = groupKey(dim, buckets.get(a)![0], today).label;
      const labelB = groupKey(dim, buckets.get(b)![0], today).label;
      return compareCategories(labelA, labelB);
    });
    return;
  }

  if (dim === "priorityLetter") {
    order.sort(
      (a, b) => rankOf(a, PRIORITY_LETTER_ORDER) - rankOf(b, PRIORITY_LETTER_ORDER),
    );
    return;
  }

  if (dim === "deadlineBand") {
    order.sort(
      (a, b) => rankOf(a, DEADLINE_BAND_ORDER) - rankOf(b, DEADLINE_BAND_ORDER),
    );
  }
}

/** Position in a fixed order; anything unrecognised sorts last rather than first. */
function rankOf(key: string, order: readonly string[]): number {
  const index = order.indexOf(key);
  return index === -1 ? order.length : index;
}

/** Letters first in rank order, then the blank (unprioritized) key. */
const PRIORITY_LETTER_ORDER: readonly string[] = ["A", "B", "C", "D", ""];

/**
 * Nested group headers around the kept nodes. Items are gathered under each group key
 * first (see {@link gatherByGroupKeys}), then headers are emitted as the key path changes.
 * Counts are the number of node rows under a header, including those nested under deeper
 * group levels.
 */
function emitGrouped(
  kept: Prepared[],
  groupBy: GroupBy[],
  today: string | null,
): GridRow[] {
  const ordered = gatherByGroupKeys(kept, groupBy, today);
  const out: GridRow[] = [];

  type Frame = {
    dim: GroupBy;
    key: string;
    label: string;
    /** Index of the group row we already pushed, so we can back-fill `count`. */
    rowIndex: number;
    count: number;
  };

  const stack: Frame[] = [];

  function closeTo(depth: number) {
    while (stack.length > depth) {
      const frame = stack.pop()!;
      const row = out[frame.rowIndex];
      if (row.kind === "group") row.count = frame.count;
    }
  }

  function bumpCounts() {
    for (const frame of stack) frame.count += 1;
  }

  for (const entry of ordered) {
    for (let level = 0; level < groupBy.length; level++) {
      const dim = groupBy[level];
      const { key, label } = groupKey(dim, entry, today);
      const frame = stack[level];

      if (frame && frame.key === key && frame.dim === dim) {
        // Same group at this level — leave the frame open.
        continue;
      }

      // Different key (or first time at this level): close this level and everything
      // deeper, then open a new header.
      closeTo(level);

      const rowIndex = out.length;
      const idParts = [...stack.map((f) => `${f.dim}:${f.key}`), `${dim}:${key}`];
      out.push({
        kind: "group",
        id: `group:${idParts.join("|")}`,
        label,
        count: 0,
        depth: level,
        collapsed: false,
      });
      stack.push({ dim, key, label, rowIndex, count: 0 });
    }

    out.push(toNodeRow(entry));
    bumpCounts();
  }

  closeTo(0);
  return out;
}
