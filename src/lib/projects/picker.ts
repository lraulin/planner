import type { OutlineNode } from "@/lib/tree/types";
import { effectiveState } from "@/lib/tree/shelving";

export type ProjectPickerRow = {
  id: string;
  name: string;
  type: OutlineNode["type"];
  depth: number;
  selectable: boolean;
  disabled: boolean;
  priority: string | null;
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
  const projects = nodes.filter((node) => {
    if (node.type !== "project" || node.isInbox) return false;
    if (node.state === "completed" || node.state === "cancelled") return false;
    if (
      !options.includeDeferred &&
      effectiveState(node.state, node.shelf, options.today) === "postponed"
    ) {
      return false;
    }
    return !needle || node.name.toLowerCase().includes(needle);
  });

  if (!options.groupByResultArea) {
    const available = new Set(projects.map((project) => project.id));
    return projects.map((project) => {
      let depth = 0;
      let parent = project.parentId ? byId.get(project.parentId) : undefined;
      while (parent) {
        if (parent.type === "project" && available.has(parent.id)) depth += 1;
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      return asRow(project, depth, options.excludedIds);
    });
  }

  const shownIds = new Set(projects.map((project) => project.id));
  for (const project of projects) {
    let parent = project.parentId ? byId.get(project.parentId) : undefined;
    while (parent) {
      if (parent.type !== "task" && !parent.isInbox) shownIds.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }

  const shown = nodes.filter((node) => shownIds.has(node.id));
  const depths = new Map<string, number>();
  for (const node of shown) {
    const parentDepth = node.parentId ? depths.get(node.parentId) : undefined;
    depths.set(node.id, parentDepth === undefined ? 0 : parentDepth + 1);
  }

  return shown.map((node) =>
    asRow(node, depths.get(node.id) ?? 0, options.excludedIds, projects),
  );
}

function asRow(
  node: OutlineNode,
  depth: number,
  excludedIds?: ReadonlySet<string>,
  eligibleProjects?: readonly OutlineNode[],
): ProjectPickerRow {
  const eligible = eligibleProjects
    ? eligibleProjects.some((project) => project.id === node.id)
    : node.type === "project";
  const disabled = excludedIds?.has(node.id) ?? false;
  const priority = node.priorityLetter
    ? `${node.priorityLetter}${node.priorityRank ?? ""}`
    : null;
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    depth,
    selectable: node.type === "project" && eligible && !disabled,
    disabled,
    priority,
  };
}
