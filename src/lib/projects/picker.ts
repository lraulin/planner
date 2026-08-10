import type { OutlineNode } from "@/lib/tree/types";
import { effectiveState } from "@/lib/tree/shelving";

/**
 * One row in the hierarchy-aware destination picker (Tasks scope, Overview, organizer).
 *
 * When grouped by result area the tree includes result areas, goals, and projects so a
 * task or project can be filed under any of them — Achieve's rule, and ours. Flat mode
 * lists projects only.
 */
export type ProjectPickerRow = {
  id: string;
  parentId: string | null;
  name: string;
  type: OutlineNode["type"];
  depth: number;
  selectable: boolean;
  disabled: boolean;
  priority: string | null;
  hasChildren: boolean;
};

export function projectPickerRows(
  nodes: readonly OutlineNode[],
  options: {
    query: string;
    groupByResultArea: boolean;
    includeDeferred: boolean;
    today: string | null;
    excludedIds?: ReadonlySet<string>;
  },
): ProjectPickerRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const needle = options.query.trim().toLowerCase();

  if (!options.groupByResultArea) {
    const projects = nodes.filter(
      (node) => isOpenProject(node, options) && matchesQuery(node, needle),
    );
    const available = new Set(projects.map((project) => project.id));
    const rows = projects.map((project) => {
      let depth = 0;
      let parentId: string | null = null;
      let parent = project.parentId ? byId.get(project.parentId) : undefined;
      while (parent) {
        if (parent.type === "project" && available.has(parent.id)) {
          if (!parentId) parentId = parent.id;
          depth += 1;
        }
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return asRow(project, parentId, depth, options.excludedIds, true);
    });
    return withChildFlags(rows);
  }

  // Destination candidates: result areas always, plus open goals and projects. Empty
  // result areas must appear so the organizer can file under them before any project
  // exists.
  const candidates = nodes.filter((node) => {
    if (!isDestinationNode(node, options)) return false;
    return matchesQuery(node, needle);
  });

  const shownIds = new Set(candidates.map((node) => node.id));
  for (const candidate of candidates) {
    let parent = candidate.parentId ? byId.get(candidate.parentId) : undefined;
    while (parent) {
      if (parent.type !== "task" && !parent.isInbox) shownIds.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }

  // Preserve outline order so the tree reads like the Outline tab.
  const shown = nodes.filter((node) => shownIds.has(node.id));
  const depths = new Map<string, number>();
  const parents = new Map<string, string | null>();
  for (const node of shown) {
    // Rebase onto the nearest *shown* ancestor so a project under a hidden goal still
    // sits under its result area when the goal was filtered out of the tree.
    let parentId: string | null = null;
    let walk = node.parentId ? byId.get(node.parentId) : undefined;
    while (walk) {
      if (shownIds.has(walk.id)) {
        parentId = walk.id;
        break;
      }
      walk = walk.parentId ? byId.get(walk.parentId) : undefined;
    }
    parents.set(node.id, parentId);
    const parentDepth = parentId ? depths.get(parentId) : undefined;
    depths.set(node.id, parentDepth === undefined ? 0 : parentDepth + 1);
  }

  const rows = shown.map((node) =>
    asRow(
      node,
      parents.get(node.id) ?? null,
      depths.get(node.id) ?? 0,
      options.excludedIds,
      // Open destinations stay selectable even when only shown as ancestors of a
      // name match (filter "beta" still lets you pick Alpha or Work). Completed
      // structural ancestors remain visible but not selectable.
      isDestinationNode(node, options),
    ),
  );
  return withChildFlags(rows);
}

/**
 * Drop rows whose ancestors are collapsed. Pure so the component only owns the expanded
 * set and click handlers.
 */
export function visiblePickerRows(
  rows: readonly ProjectPickerRow[],
  expandedIds: ReadonlySet<string>,
): ProjectPickerRow[] {
  const hidden = new Set<string>();
  const visible: ProjectPickerRow[] = [];
  for (const row of rows) {
    if (row.parentId && (hidden.has(row.parentId) || !expandedIds.has(row.parentId))) {
      hidden.add(row.id);
      continue;
    }
    visible.push(row);
  }
  return visible;
}

/** Every row that currently has children — the natural "fully expanded" default. */
export function defaultExpandedPickerIds(
  rows: readonly ProjectPickerRow[],
): Set<string> {
  return new Set(rows.filter((row) => row.hasChildren).map((row) => row.id));
}

function isDestinationNode(
  node: OutlineNode,
  options: {
    includeDeferred: boolean;
    today: string | null;
  },
): boolean {
  if (node.isInbox || node.type === "task") return false;
  if (node.type === "result_area") return true;
  if (node.type !== "goal" && node.type !== "project") return false;
  if (node.state === "completed" || node.state === "cancelled") return false;
  if (
    !options.includeDeferred &&
    effectiveState(node.state, node.shelf, options.today) === "postponed"
  ) {
    return false;
  }
  return true;
}

function isOpenProject(
  node: OutlineNode,
  options: { includeDeferred: boolean; today: string | null },
): boolean {
  return node.type === "project" && isDestinationNode(node, options);
}

function matchesQuery(node: OutlineNode, needle: string): boolean {
  return !needle || node.name.toLowerCase().includes(needle);
}

function asRow(
  node: OutlineNode,
  parentId: string | null,
  depth: number,
  excludedIds: ReadonlySet<string> | undefined,
  selectable: boolean,
): ProjectPickerRow {
  const disabled = excludedIds?.has(node.id) ?? false;
  const priority = node.priorityLetter
    ? `${node.priorityLetter}${node.priorityRank ?? ""}`
    : null;
  return {
    id: node.id,
    parentId,
    name: node.name,
    type: node.type,
    depth,
    selectable: selectable && !disabled,
    disabled,
    priority,
    hasChildren: false,
  };
}

function withChildFlags(rows: ProjectPickerRow[]): ProjectPickerRow[] {
  const parentsWithChildren = new Set<string>();
  for (const row of rows) {
    if (row.parentId) parentsWithChildren.add(row.parentId);
  }
  return rows.map((row) =>
    parentsWithChildren.has(row.id) ? { ...row, hasChildren: true } : row,
  );
}
