/**
 * Path labels for a single node without loading the whole outline.
 *
 * Agent `get_node` (and create/update, which re-read through it) only need "Area / Project /
 * Task" for one id. Loading every row just to walk parents was the bulk of that call.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { NodeType } from "@/db/schema";

export type NodePathSegment = {
  id: string;
  parentId: string | null;
  name: string;
  type: NodeType;
};

/**
 * Ancestors from root to `nodeId` (inclusive), user-scoped.
 *
 * Returns null when the node is missing or owned by someone else. A parent cycle cannot
 * be created through normal mutations; the walk still depth-caps so a corrupt import
 * cannot hang the agent.
 */
export async function loadNodeChain(
  userId: string,
  nodeId: string,
): Promise<NodePathSegment[] | null> {
  // Walk up the tree. `dist` is 0 at the target and grows toward the root; we reverse
  // after so callers see root → leaf like `buildPathMap`.
  const result = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT
        n.id,
        n.parent_id,
        n.name,
        n.type,
        0 AS dist
      FROM nodes n
      WHERE n.id = ${nodeId} AND n.user_id = ${userId}

      UNION ALL

      SELECT
        p.id,
        p.parent_id,
        p.name,
        p.type,
        c.dist + 1
      FROM nodes p
      JOIN chain c ON p.id = c.parent_id
      WHERE p.user_id = ${userId} AND c.dist < 64
    )
    SELECT id, parent_id, name, type, dist
    FROM chain
    ORDER BY dist DESC
  `);

  const rows = result as unknown as Record<string, unknown>[];
  if (rows.length === 0) return null;

  return rows.map((r) => ({
    id: r.id as string,
    parentId: (r.parent_id as string | null) ?? null,
    name: r.name as string,
    type: r.type as NodeType,
  }));
}

/**
 * "Area / Project / Task" from a root→leaf chain. Same label shape as `buildPathMap`.
 */
export function formatNodePath(chain: readonly NodePathSegment[]): string {
  if (chain.length === 0) return "";
  return chain
    .map((segment) => segment.name || `(unnamed ${segment.type})`)
    .join(" / ");
}
