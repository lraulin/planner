import type { NodeState, NodeType } from "@/db/schema";
import { toDateKey } from "@/lib/schedule/geometry";
import { isSettled } from "@/lib/tree/completionCascade";
import type { OutlineNode } from "@/lib/tree/types";
import { pageBounds, paginate, type PageInfo } from "./pagination";
import {
  buildPathMap,
  compactNodeSummary,
  nodeSummary,
  type AgentCompactNode,
  type AgentNodeSummary,
} from "./serialize";

/** Row order: the outline's own, or soonest deadline first. */
export type SearchNodesSort = "outline" | "deadline";

/** `summary` is the full row; `compact` drops path, depth, and effort for long lists. */
export type SearchNodesFields = "summary" | "compact";

export type SearchNodesFilter = {
  type?: NodeType | NodeType[];
  state?: NodeState | NodeState[];
  focus?: boolean;
  /** Case-insensitive substring match on name. */
  query?: string;
  parentId?: string | null;
  /** When false (default), completed and cancelled rows are omitted. */
  includeCompleted?: boolean;
  /** Inclusive: only rows whose deadline day is on or after this YYYY-MM-DD. */
  dueAfter?: string;
  /** Inclusive: only rows whose deadline day is on or before this YYYY-MM-DD. */
  dueBefore?: string;
  /**
   * true: only rows whose deadline day is before `today`. false: only rows that are not
   * (no deadline, or due today or later). Needs `today`.
   */
  overdue?: boolean;
  /** The reader's calendar day, YYYY-MM-DD. Passed in: no rule here reads a clock. */
  today?: string;
  /** Defaults to `deadline` when any due filter is set, else `outline`. */
  sort?: SearchNodesSort;
  fields?: SearchNodesFields;
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
  return filterOutlinePage(outline, { ...filter, fields: "summary" }).nodes;
}

export function filterOutlinePage(
  outline: OutlineNode[],
  filter: SearchNodesFilter & { fields: "compact" },
): { nodes: AgentCompactNode[]; pageInfo: PageInfo };
export function filterOutlinePage(
  outline: OutlineNode[],
  filter?: SearchNodesFilter & { fields?: "summary" },
): { nodes: AgentNodeSummary[]; pageInfo: PageInfo };
export function filterOutlinePage(
  outline: OutlineNode[],
  filter?: SearchNodesFilter,
): { nodes: AgentNodeSummary[] | AgentCompactNode[]; pageInfo: PageInfo };
export function filterOutlinePage(
  outline: OutlineNode[],
  filter: SearchNodesFilter = {},
): {
  nodes: AgentNodeSummary[] | AgentCompactNode[];
  pageInfo: PageInfo;
} {
  const types = asList(filter.type);
  const states = asList(filter.state);
  const q = filter.query?.trim().toLowerCase() ?? "";
  const includeCompleted = filter.includeCompleted ?? false;
  const dueFiltered =
    filter.dueAfter !== undefined ||
    filter.dueBefore !== undefined ||
    filter.overdue !== undefined;
  if (filter.overdue !== undefined && filter.today === undefined) {
    throw new Error("filterOutlinePage: overdue needs today");
  }

  const matches: { node: OutlineNode; due: string | null }[] = [];
  for (const node of outline) {
    if (types && !types.includes(node.type)) continue;
    if (states && (node.state === null || !states.includes(node.state))) continue;
    if (filter.focus !== undefined && node.focus !== filter.focus) continue;
    if (filter.parentId !== undefined && node.parentId !== filter.parentId) continue;
    if (!includeCompleted && isSettled(node.state)) {
      continue;
    }
    if (q && !node.name.toLowerCase().includes(q)) continue;
    // Deadlines are calendar days stored at UTC noon; compare day keys, never instants.
    const due = node.deadline ? toDateKey(node.deadline) : null;
    if (filter.dueAfter !== undefined && (due === null || due < filter.dueAfter))
      continue;
    if (filter.dueBefore !== undefined && (due === null || due > filter.dueBefore)) {
      continue;
    }
    if (filter.overdue !== undefined && filter.today !== undefined) {
      const isOverdue = due !== null && due < filter.today;
      if (isOverdue !== filter.overdue) continue;
    }
    matches.push({ node, due });
  }

  const sort = filter.sort ?? (dueFiltered ? "deadline" : "outline");
  if (sort === "deadline") {
    // Stable: equal days keep outline order. Undated rows go last.
    matches.sort((a, b) => {
      if (a.due === b.due) return 0;
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due < b.due ? -1 : 1;
    });
  }

  const page = paginate(matches, pageBounds(filter.offset, filter.limit));
  // Paths walk ancestors, so build them only for a page that needs them.
  const paths = filter.fields === "compact" ? null : buildPathMap(outline);
  const rows = page.items.map(({ node }) =>
    paths ? nodeSummary(node, paths) : compactNodeSummary(node),
  );
  return fitPageToBudget(rows, page.pageInfo) as {
    nodes: AgentNodeSummary[] | AgentCompactNode[];
    pageInfo: PageInfo;
  };
}

/**
 * The connector gateway keeps the first 20,000 bytes of a tool's text and silently drops the
 * rest. Long names nest into long paths, so 50 summary rows can pass that. Stop the page
 * where it would cross this budget and point `nextOffset` at the first row left out.
 */
export const SEARCH_NODES_BYTE_BUDGET = 16 * 1024;
/** Room for `{"nodes":[…],"pageInfo":{…}}` around the rows. */
const PAGE_ENVELOPE_BYTES = 256;

const encoder = new TextEncoder();

function fitPageToBudget<T>(
  rows: T[],
  pageInfo: PageInfo,
): { nodes: T[]; pageInfo: PageInfo } {
  let used = PAGE_ENVELOPE_BYTES;
  let kept = 0;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    // Always return at least one row so paging cannot stall.
    if (kept > 0 && used + size > SEARCH_NODES_BYTE_BUDGET) break;
    used += size;
    kept += 1;
  }
  if (kept === rows.length) return { nodes: rows, pageInfo };
  const nextOffset = pageInfo.offset + kept;
  return {
    nodes: rows.slice(0, kept),
    pageInfo: { ...pageInfo, returned: kept, hasMore: true, nextOffset },
  };
}
