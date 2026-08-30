/**
 * Attach web URLs from free text (the system clipboard) onto a project or task.
 *
 * Same extract + title source as promoting URLs out of a task name, but this path does not
 * rewrite the node. Lives under `src/lib/url/` so it can insert with `db` + `between` and
 * never import `detail/mutations` — the tree↔detail cycle the name-promote work already
 * walked around.
 */

import { db } from "@/db";
import { nodeItems, nodes } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { between } from "@/lib/tree/sortKey";
import { fetchPageTitle, normalizeHttpUrl } from "./pageTitle";
import { extractHttpUrls } from "./extractHttpUrls";
import { ATTACH_NO_LINK } from "./clipboardAttach";

export {
  ATTACH_NO_LINK,
  CLIPBOARD_UNREADABLE,
  clipboardAttachRefusal,
  clipboardAttachStatus,
} from "./clipboardAttach";
export const ATTACH_KIND_REFUSAL = "Attachments live on projects and tasks.";

export type AttachUrlsResult = {
  created: number;
  urls: string[];
};

/**
 * Append each new http(s) URL in `text` as an attachment on `nodeId`.
 *
 * Missing and other-user nodes are the same error. Goals, dreams, and result areas are
 * refused even though `node_items` would take the row — there is no Attachments tab to
 * see it on. Already-attached URLs are skipped. Title fetch is outside the write.
 */
export async function attachUrlsToNode(
  userId: string,
  nodeId: string,
  text: string,
): Promise<AttachUrlsResult> {
  const [node] = await db
    .select({ id: nodes.id, type: nodes.type })
    .from(nodes)
    .where(and(eq(nodes.id, nodeId), eq(nodes.userId, userId)))
    .limit(1);

  if (!node) throw new Error(`Node not found: ${nodeId}`);
  if (node.type !== "project" && node.type !== "task") {
    throw new Error(ATTACH_KIND_REFUSAL);
  }

  const matches = extractHttpUrls(text);
  if (matches.length === 0) throw new Error(ATTACH_NO_LINK);

  const attachments = await db
    .select({
      url: nodeItems.url,
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

  const existing = new Set<string>();
  for (const row of attachments) {
    const normalized = normalizeHttpUrl(row.url);
    if (normalized) existing.add(normalized);
  }

  const missing = [...new Set(matches.map((match) => match.normalized))].filter(
    (url) => !existing.has(url),
  );
  if (missing.length === 0) return { created: 0, urls: [] };

  const titles = await Promise.all(missing.map((url) => fetchPageTitle(url)));

  const created: string[] = [];
  await db.transaction(async (tx) => {
    let lastKey = attachments.at(-1)?.sortKey ?? null;
    for (let i = 0; i < missing.length; i++) {
      const url = missing[i];
      const sortKey = between(lastKey, null);
      lastKey = sortKey;
      await tx.insert(nodeItems).values({
        userId,
        nodeId,
        kind: "attachment",
        sortKey,
        title: titles[i] ?? "",
        url,
      });
      created.push(url);
    }
  });

  return { created: created.length, urls: created };
}
