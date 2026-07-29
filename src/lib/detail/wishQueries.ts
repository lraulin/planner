import { db } from "@/db";
import { nodeItems, nodes, resultAreaDetails } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { WISH_KINDS, type WishKind, type WishListRow } from "./wishTypes";

export {
  WISH_KINDS,
  WISH_TYPE_CODES,
  type WishKind,
  type WishListRow,
} from "./wishTypes";

/**
 * Every wish-list entry across the outline, with its nearest result-area ancestor resolved
 * for grouping. There is no other cross-node `node_items` query in the repo — the drawer
 * always loads one node's lists.
 */
export async function loadWishList(userId: string): Promise<WishListRow[]> {
  const items = await db
    .select({
      id: nodeItems.id,
      nodeId: nodeItems.nodeId,
      kind: nodeItems.kind,
      priorityLetter: nodeItems.priorityLetter,
      priorityRank: nodeItems.priorityRank,
      title: nodeItems.title,
      description: nodeItems.description,
      sortKey: nodeItems.sortKey,
      ownerName: nodes.name,
      ownerType: nodes.type,
    })
    .from(nodeItems)
    .innerJoin(nodes, eq(nodes.id, nodeItems.nodeId))
    .where(and(eq(nodeItems.userId, userId), inArray(nodeItems.kind, [...WISH_KINDS])))
    .orderBy(asc(nodeItems.sortKey));

  if (items.length === 0) return [];

  const allNodes = await db
    .select({
      id: nodes.id,
      parentId: nodes.parentId,
      type: nodes.type,
      name: nodes.name,
    })
    .from(nodes)
    .where(eq(nodes.userId, userId));

  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const areas = await db
    .select({
      nodeId: resultAreaDetails.nodeId,
      category: resultAreaDetails.category,
    })
    .from(resultAreaDetails);
  const categoryByArea = new Map(areas.map((a) => [a.nodeId, a.category]));

  const rows: WishListRow[] = items.map((item) => {
    let resultAreaId: string | null = null;
    let resultAreaName: string | null = null;
    let cur = byId.get(item.nodeId) ?? null;
    while (cur) {
      if (cur.type === "result_area") {
        resultAreaId = cur.id;
        resultAreaName = cur.name;
        break;
      }
      cur = cur.parentId ? (byId.get(cur.parentId) ?? null) : null;
    }

    return {
      id: item.id,
      nodeId: item.nodeId,
      kind: item.kind as WishKind,
      priorityLetter: item.priorityLetter,
      priorityRank: item.priorityRank,
      title: item.title,
      description: item.description,
      ownerName: item.ownerName,
      ownerType: item.ownerType,
      resultAreaId,
      resultAreaName,
      category: resultAreaId ? (categoryByArea.get(resultAreaId) ?? null) : null,
    };
  });

  rows.sort((a, b) => {
    const area = (a.resultAreaName ?? "").localeCompare(b.resultAreaName ?? "");
    if (area !== 0) return area;
    return a.title.localeCompare(b.title);
  });

  return rows;
}
