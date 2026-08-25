import { isSettled } from "@/lib/tree/completionCascade";
import type { OutlineNode } from "@/lib/tree/types";
import { effectiveState } from "@/lib/tree/shelving";
import { walkUp } from "@/lib/tree/walkUp";

/**
 * One row in the hierarchy-aware destination picker (Tasks scope, Overview, organizer).
 *
 * Goals and dreams are peers of projects here — Achieve's Tasks picker treats them as
 * interchangeable scopes for "show me this branch's tasks." Result areas appear only when
 * grouping by result area (and remain valid filing destinations for the organizer).
 */
export type ProjectPickerRow = {
  id: string;
  parentId: string | null;
  name: string;
  type: OutlineNode["type"];
  isDream: boolean;
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
    /** Outline Move to… can file a task under another task. Organizer stays task-free. */
    includeTasks?: boolean;
  },
): ProjectPickerRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const needle = options.query.trim().toLowerCase();

  // Projects, goals, and dreams always. Result areas only when grouping by them —
  // unchecking that checkbox is the flat list Achieve uses for project/goal peers.
  const candidates = nodes.filter((node) => {
    if (!isDestinationNode(node, options)) return false;
    if (!options.groupByResultArea && node.type === "result_area") return false;
    return matchesQuery(node, needle);
  });

  const shownIds = new Set(candidates.map((node) => node.id));
  for (const candidate of candidates) {
    for (const ancestor of walkUp(
      candidate.parentId ? byId.get(candidate.parentId) : undefined,
      byId,
    )) {
      if (
        shouldShowAncestor(ancestor, options.groupByResultArea, options.includeTasks)
      ) {
        shownIds.add(ancestor.id);
      }
    }
  }

  // Preserve outline order so the tree reads like the Outline tab.
  const shown = nodes.filter((node) => shownIds.has(node.id));
  const depths = new Map<string, number>();
  const parents = new Map<string, string | null>();
  for (const node of shown) {
    // Rebase onto the nearest *shown* ancestor so a project under a hidden goal still
    // sits under its result area (or under nothing in flat mode).
    let parentId: string | null = null;
    for (const ancestor of walkUp(
      node.parentId ? byId.get(node.parentId) : undefined,
      byId,
    )) {
      if (shownIds.has(ancestor.id)) {
        parentId = ancestor.id;
        break;
      }
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
      // name match (filter "beta" still lets you pick Alpha or Grow). Completed
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
    includeTasks?: boolean;
  },
): boolean {
  if (node.isInbox) return false;
  if (node.type === "task") return options.includeTasks === true;
  if (node.type === "result_area") return true;
  // Goal covers Dream (isDream is a flag on the same type).
  if (node.type !== "goal" && node.type !== "project") return false;
  if (isSettled(node.state)) return false;
  if (
    !options.includeDeferred &&
    effectiveState(node.state, node.shelf, options.today) === "postponed"
  ) {
    return false;
  }
  return true;
}

/** Ancestors kept only to hold the tree — skip RAs in flat mode. */
function shouldShowAncestor(
  parent: OutlineNode,
  groupByResultArea: boolean,
  includeTasks = false,
): boolean {
  if (parent.isInbox) return false;
  if (parent.type === "task") return includeTasks;
  if (parent.type === "result_area") return groupByResultArea;
  return parent.type === "goal" || parent.type === "project";
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
    isDream: Boolean(node.isDream),
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
