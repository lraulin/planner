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
};

export type GridRow =
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
      node: OutlineNode;
      depth: number;
      context: RowContext;
    };

export type GroupBy = "category" | "resultArea" | "goal";

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
  /** When false, `postponed` nodes are dropped — Achieve's Deferred toggle off. */
  includeDeferred: boolean;
};

type Prepared = {
  node: OutlineNode;
  depth: number;
  context: RowContext;
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
    if (!opts.includeDeferred && node.state === "postponed") continue;
    if (!inScope(node, opts.scopeId, byId)) continue;
    if (!opts.keep(node)) continue;
    kept.push({
      node,
      depth: 0, // filled after we know the full kept set
      context: contextFor(node, byId),
    });
  }

  const keptIds = new Set(kept.map((k) => k.node.id));
  for (const entry of kept) {
    entry.depth = rebasedDepth(entry.node, keptIds, byId);
  }

  const groupBy = opts.groupBy ?? [];
  if (groupBy.length === 0) {
    return kept.map(toNodeRow);
  }

  return emitGrouped(kept, groupBy);
}

function toNodeRow(entry: Prepared): GridRow {
  return {
    kind: "node",
    id: entry.node.id,
    node: entry.node,
    depth: entry.depth,
    context: entry.context,
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
 * Indentation among kept rows only. A project under a filtered-out goal sits at depth 0;
 * a sub-project under a kept project sits at depth 1.
 */
function rebasedDepth(
  node: OutlineNode,
  keptIds: Set<string>,
  byId: Map<string, OutlineNode>,
): number {
  let depth = 0;
  let parentId = node.parentId;
  while (parentId) {
    if (keptIds.has(parentId)) depth += 1;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
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
  let category: string | null = null;
  let goalId: string | null = null;
  let goalName: string | null = null;

  let cur: OutlineNode | undefined = node;
  while (cur) {
    if (cur.type === "result_area" && resultAreaId === null) {
      resultAreaId = cur.id;
      resultAreaName = cur.name;
      resultAreaColor = cur.color;
      category = cur.category;
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
    category,
    goalId,
    goalName,
  };
}

function groupKey(dim: GroupBy, context: RowContext): { key: string; label: string } {
  switch (dim) {
    case "category":
      return {
        key: context.category ?? "",
        label: context.category?.trim() ? context.category : "(No Category)",
      };
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
  }
}

/**
 * Nested group headers around the kept nodes, preserving the input (DFS) order within
 * each group. Counts are the number of node rows under a header, including those nested
 * under deeper group levels.
 */
function emitGrouped(kept: Prepared[], groupBy: GroupBy[]): GridRow[] {
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

  for (const entry of kept) {
    for (let level = 0; level < groupBy.length; level++) {
      const dim = groupBy[level];
      const { key, label } = groupKey(dim, entry.context);
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
