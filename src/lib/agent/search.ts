import type { NodeState, NodeType } from "@/db/schema";
import { isSettled } from "@/lib/tree/completionCascade";
import type { OutlineNode } from "@/lib/tree/types";
import { pageBounds, paginate, type PageInfo } from "./pagination";
import { buildPathMap, nodeSummary, type AgentNodeSummary } from "./serialize";

export type SearchNodesFilter = {
  type?: NodeType | NodeType[];
  state?: NodeState | NodeState[];
  focus?: boolean;
  /** Case-insensitive substring match on name. */
  query?: string;
  parentId?: string | null;
  /** When false (default), completed and cancelled rows are omitted. */
  includeCompleted?: boolean;
  offset?: number;
  limit?: number;
};

function asList<T>(value: T | T[] | undefined): T[] | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? value : [value];
}

/**
 * Filter an already-loaded outline for agent search.
 *
 * Personal outlines are small enough that load-once + filter is fine and keeps nest/path
 * logic consistent with the UI. Pure so unit tests do not need Postgres.
 */
export function filterOutline(
  outline: OutlineNode[],
  filter: SearchNodesFilter = {},
): AgentNodeSummary[] {
  return filterOutlinePage(outline, filter).nodes;
}

export function filterOutlinePage(
  outline: OutlineNode[],
  filter: SearchNodesFilter = {},
): {
  nodes: AgentNodeSummary[];
  pageInfo: PageInfo;
} {
  const types = asList(filter.type);
  const states = asList(filter.state);
  const q = filter.query?.trim().toLowerCase() ?? "";
  const includeCompleted = filter.includeCompleted ?? false;
  const paths = buildPathMap(outline);

  const rows: AgentNodeSummary[] = [];
  for (const node of outline) {
    if (types && !types.includes(node.type)) continue;
    if (states && (node.state === null || !states.includes(node.state))) continue;
    if (filter.focus !== undefined && node.focus !== filter.focus) continue;
    if (filter.parentId !== undefined && node.parentId !== filter.parentId) continue;
    if (!includeCompleted && isSettled(node.state)) {
      continue;
    }
    if (q && !node.name.toLowerCase().includes(q)) continue;

    rows.push(nodeSummary(node, paths));
  }
  const page = paginate(rows, pageBounds(filter.offset, filter.limit));
  return { nodes: page.items, pageInfo: page.pageInfo };
}
