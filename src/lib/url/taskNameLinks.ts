/**
 * Promote web URLs found in a task name into attachment rows, and rewrite the name
 * with page titles when fetch succeeds — same title source as attachment autofill.
 *
 * Outline create is blank-then-rename, capture and agent create pass a name on insert:
 * both paths call into here via `createNode` / `renameNode`.
 *
 * URL extract is in `extractHttpUrls.ts` so a client can share the matcher without
 * pulling this module's `db` import into the browser.
 */

import { db } from "@/db";
import { nodeItems, nodes } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { between } from "@/lib/tree/sortKey";
import { fetchPageTitle, normalizeHttpUrl } from "./pageTitle";
import { extractHttpUrls, rewriteNameReplacingUrls } from "./extractHttpUrls";

export type { UrlInText } from "./extractHttpUrls";
export { extractHttpUrls, rewriteNameReplacingUrls };

/**
 * If this node is a task whose name contains web URL(s), attach each URL and rewrite
 * the name with page titles when available. No-op for non-tasks, missing nodes, or names
 * without URLs. Never throws for network failures.
 *
 * Safe to call after every task name write. Does not re-enter `renameNode`.
 */
export async function promoteUrlsFromTaskName(
  userId: string,
  nodeId: string,
): Promise<void> {
  const [node] = await db
    .select({ id: nodes.id, type: nodes.type, name: nodes.name })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node || node.type !== "task") return;

  const matches = extractHttpUrls(node.name);
  if (matches.length === 0) return;

  const attachments = await db
    .select({
      id: nodeItems.id,
      url: nodeItems.url,
      title: nodeItems.title,
      sortKey: nodeItems.sortKey,
    })
    .from(nodeItems)
    .where(
      and(
        eq(nodeItems.userId, userId),
        eq(nodeItems.nodeId, nodeId),
        eq(nodeItems.kind, "attachment"),
      ),
    )
    .orderBy(asc(nodeItems.sortKey));

  const byNormalized = new Map<string, { title: string; url: string }>();
  for (const row of attachments) {
    const normalized = normalizeHttpUrl(row.url);
    if (!normalized) continue;
    if (!byNormalized.has(normalized)) {
      byNormalized.set(normalized, { title: row.title, url: row.url });
    }
  }

  const distinct = [...new Set(matches.map((m) => m.normalized))];
  const titleByUrl = new Map<string, string | null>();

  // Fetch titles for URLs we do not already have a non-blank title for.
  await Promise.all(
    distinct.map(async (normalized) => {
      const existing = byNormalized.get(normalized);
      if (existing?.title.trim()) {
        titleByUrl.set(normalized, existing.title.trim());
        return;
      }
      const title = await fetchPageTitle(normalized);
      titleByUrl.set(normalized, title);
    }),
  );

  // Append missing attachments (reuse last sort key chain).
  let lastKey = attachments.at(-1)?.sortKey ?? null;
  for (const normalized of distinct) {
    if (byNormalized.has(normalized)) continue;
    const title = titleByUrl.get(normalized) ?? "";
    const sortKey = between(lastKey, null);
    lastKey = sortKey;
    await db.insert(nodeItems).values({
      userId,
      nodeId,
      kind: "attachment",
      sortKey,
      title: title ?? "",
      url: normalized,
    });
    byNormalized.set(normalized, { title: title ?? "", url: normalized });
  }

  const nextName = rewriteNameReplacingUrls(node.name, matches, (href) =>
    titleByUrl.get(href),
  );
  if (nextName === node.name) return;

  await db
    .update(nodes)
    .set({ name: nextName, updatedAt: new Date() })
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)));
}
