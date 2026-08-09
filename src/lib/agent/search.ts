import type { NodeState, NodeType } from "@/db/schema";
import type { OutlineNode } from "@/lib/tree/types";
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
  const types = asList(filter.type);
  const states = asList(filter.state);
  const q = filter.query?.trim().toLowerCase() ?? "";
  const includeCompleted = filter.includeCompleted ?? false;
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const paths = buildPathMap(outline);

  const rows: AgentNodeSummary[] = [];
  for (const node of outline) {
    if (types && !types.includes(node.type)) continue;
    if (states && (node.state === null || !states.includes(node.state))) continue;
    if (filter.focus !== undefined && node.focus !== filter.focus) continue;
    if (filter.parentId !== undefined && node.parentId !== filter.parentId) continue;
    if (
      !includeCompleted &&
      (node.state === "completed" || node.state === "cancelled")
    ) {
      continue;
    }
    if (q && !node.name.toLowerCase().includes(q)) continue;

    rows.push(nodeSummary(node, paths));
    if (rows.length >= limit) break;
  }
  return rows;
}
