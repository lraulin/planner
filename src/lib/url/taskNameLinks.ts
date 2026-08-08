/**
 * Promote web URLs found in a task name into attachment rows, and rewrite the name
 * with page titles when fetch succeeds — same title source as attachment autofill.
 *
 * Outline create is blank-then-rename, capture and agent create pass a name on insert:
 * both paths call into here via `createNode` / `renameNode`.
 */

import { db } from "@/db";
import { nodeItems, nodes } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { between } from "@/lib/tree/sortKey";
import { fetchPageTitle, normalizeHttpUrl } from "./pageTitle";

/** One http(s) URL occurrence inside free text. */
export type UrlInText = {
  /** Exact substring as found in the source (before normalize). */
  raw: string;
  /** Start index of `raw` in the source string. */
  index: number;
  /** Absolute http(s) href. */
  normalized: string;
};

/**
 * Find web URLs in free text for promotion.
 *
 * Matches `http(s)://…` and `www.…` spans. Does not treat bare hosts mid-sentence as
 * URLs (too many false positives like version numbers). If the entire trimmed name is a
 * bare host that `normalizeHttpUrl` accepts, that alone is a match.
 */
export function extractHttpUrls(text: string): UrlInText[] {
  const matches: UrlInText[] = [];
  const re = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const peeled = peelTrailingPunctuation(m[0]);
    if (!peeled) continue;
    const normalized = normalizeHttpUrl(peeled);
    if (!normalized) continue;
    matches.push({ raw: peeled, index: start, normalized });
  }

  if (matches.length > 0) return matches;

  // Whole-name bare host: "example.com/path" with no scheme and no surrounding text.
  // Single words like "Untitled" parse as hostnames under URL(), so require a real-looking
  // host (dot in hostname, or localhost) before treating the whole name as a link.
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return matches;
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return matches;
  const whole = normalizeHttpUrl(trimmed);
  if (!whole) return matches;
  let hostname: string;
  try {
    hostname = new URL(whole).hostname;
  } catch {
    return matches;
  }
  if (!isPlausibleBareHostname(hostname)) return matches;
  const index = text.indexOf(trimmed);
  if (index === -1) return matches;
  return [{ raw: trimmed, index, normalized: whole }];
}

/**
 * Replace matched URL spans with titles. Spans without a title are left unchanged.
 * Collapses leftover whitespace after replacements.
 */
export function rewriteNameReplacingUrls(
  text: string,
  matches: readonly UrlInText[],
  titleFor: (normalized: string) => string | null | undefined,
): string {
  if (matches.length === 0) return text;

  // End → start so earlier indices stay valid.
  const ordered = [...matches].sort((a, b) => b.index - a.index);
  let result = text;
  for (const match of ordered) {
    const title = titleFor(match.normalized);
    if (!title) continue;
    // Guard against a stale index if the same span was already rewritten.
    if (result.slice(match.index, match.index + match.raw.length) !== match.raw) {
      continue;
    }
    result =
      result.slice(0, match.index) +
      title +
      result.slice(match.index + match.raw.length);
  }
  return result.replace(/\s+/g, " ").trim();
}

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

/** Hostnames we will accept when the whole task name has no scheme. */
function isPlausibleBareHostname(hostname: string): boolean {
  if (hostname === "localhost") return true;
  // Need a multi-label host with a TLD-ish final label (rejects "untitled", "v1.2").
  return /\.[a-z][a-z0-9-]{1,}$/i.test(hostname);
}

/**
 * Drop trailing punctuation that is usually prose, not part of the URL
 * (e.g. `https://x.com/a).` → `https://x.com/a`). Keeps peeling while the shorter
 * form still normalizes as http(s).
 */
function peelTrailingPunctuation(raw: string): string {
  let trimmed = raw;
  while (/[.,;:!?)]$/u.test(trimmed)) {
    const without = trimmed.slice(0, -1);
    if (!normalizeHttpUrl(without)) break;
    trimmed = without;
  }
  return normalizeHttpUrl(trimmed) ? trimmed : "";
}
