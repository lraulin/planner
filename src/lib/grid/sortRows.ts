import type { GridRow } from "@/lib/tree/slice";

/**
 * Sorting a prepared `GridRow[]` without destroying its group structure or its outline
 * hierarchy.
 *
 * Two constraints:
 *
 * 1. **Group headers stay put.** A header ends the run it precedes; each maximal run of
 *    consecutive node rows is sorted on its own (nested groups fall out for free).
 * 2. **Parent/child stays put.** Sorting only reorders **siblings**. A child's subtree
 *    moves with it; a sub-project never floats above its parent because its priority is
 *    higher. Depth in the prepared list is the hierarchy the view is already showing
 *    (outline tree depth, or rebased depth on Projects/Tasks after ancestors were
 *    filtered out).
 *
 * `Array.prototype.sort` is stable, so ties keep the order the slice produced — for the
 * tree tabs that is the outline's own `sortKey` order, and is the only sensible tiebreak.
 *
 * Both constraints survive **multi-column** sort unchanged: extra keys only refine how two
 * siblings compare, never which rows are siblings. Adding a secondary sort therefore cannot
 * lift a child above its parent or move a header, no matter what the second column says.
 */

export type SortDirection = "asc" | "desc";

export type SortValue = string | number | null | undefined;

/**
 * Ordering for one cell against another.
 *
 * Blanks sort last in **both** directions rather than flipping to the top on descending: a
 * column of deadlines is being read for the ones that exist, and burying them under thirty
 * empty rows is never the intent. Numbers compare numerically; everything else compares as
 * text with `numeric` on, so `A2` lands before `A10`.
 */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

type NodeRow<T> = Extract<GridRow<T>, { kind: "node" }>;

type TreeNode<T> = {
  row: NodeRow<T>;
  children: TreeNode<T>[];
};

/**
 * Parse a flat depth-indented run into a forest. Each row's children are the following
 * rows with strictly greater depth, until a peer or ancestor appears.
 *
 * Orphan depths (a jump of more than one, or a first row deeper than the base) are treated
 * as siblings of the nearest open level so a filter that dropped a mid-level parent still
 * produces a coherent forest rather than dropping rows.
 */
function parseForest<T>(rows: NodeRow<T>[]): TreeNode<T>[] {
  if (rows.length === 0) return [];

  const baseDepth = Math.min(...rows.map((row) => row.depth));
  const root: TreeNode<T>[] = [];
  /** Stack of open parents, root-most first. */
  const stack: { depth: number; node: TreeNode<T> }[] = [];

  for (const row of rows) {
    const node: TreeNode<T> = { row, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].depth >= row.depth) {
      stack.pop();
    }

    if (stack.length === 0 || row.depth <= baseDepth) {
      root.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ depth: row.depth, node });
  }

  return root;
}

/**
 * One sort key: how to read the value, and which way it runs.
 *
 * Multiple keys compare in order, first non-zero winning — the standard lexicographic rule.
 * Each key keeps its own direction, so "priority ascending, then deadline descending" is
 * expressible; a single shared direction would not be.
 */
export type SortKey<T> = {
  valueOf: (row: NodeRow<T>) => SortValue;
  direction: SortDirection;
};

/**
 * Compare two rows across every key.
 *
 * Blanks sort last **regardless of direction** (see `compareSortValues`), which is why the
 * direction factor is applied only when both values are present. Flipping a descending sort
 * would otherwise drag thirty empty deadlines to the top of a column that is being read
 * precisely for the ones that exist.
 */
function compareRows<T>(a: NodeRow<T>, b: NodeRow<T>, keys: SortKey<T>[]): number {
  for (const key of keys) {
    const left = key.valueOf(a);
    const right = key.valueOf(b);
    const order =
      left == null || right == null
        ? compareSortValues(left, right)
        : compareSortValues(left, right) * (key.direction === "asc" ? 1 : -1);
    if (order !== 0) return order;
  }
  return 0;
}

function sortForest<T>(forest: TreeNode<T>[], keys: SortKey<T>[]): void {
  forest.sort((a, b) => compareRows(a.row, b.row, keys));
  for (const node of forest) {
    if (node.children.length > 0) sortForest(node.children, keys);
  }
}

function flattenForest<T>(forest: TreeNode<T>[]): NodeRow<T>[] {
  const out: NodeRow<T>[] = [];
  for (const node of forest) {
    out.push(node.row);
    if (node.children.length > 0) out.push(...flattenForest(node.children));
  }
  return out;
}

/** Sort one contiguous run of node rows, keeping each subtree under its parent. */
function sortNodeRun<T>(run: NodeRow<T>[], keys: SortKey<T>[]): NodeRow<T>[] {
  if (run.length <= 1) return run;
  const forest = parseForest(run);
  sortForest(forest, keys);
  return flattenForest(forest);
}

/**
 * Sort node rows within each group segment, leaving headers where they are and only
 * reordering siblings inside each parent.
 *
 * `keys` is the sort in priority order, primary first. An empty list leaves the rows
 * exactly as the slice produced them.
 */
export function sortRowsWithinGroups<T>(
  rows: GridRow<T>[],
  keys: SortKey<T>[],
): GridRow<T>[] {
  if (keys.length === 0) return rows;

  const out: GridRow<T>[] = [];
  let run: NodeRow<T>[] = [];

  function flush() {
    if (run.length === 0) return;
    out.push(...sortNodeRun(run, keys));
    run = [];
  }

  for (const row of rows) {
    if (row.kind === "node") {
      run.push(row);
      continue;
    }
    flush();
    out.push(row);
  }
  flush();

  return out;
}
