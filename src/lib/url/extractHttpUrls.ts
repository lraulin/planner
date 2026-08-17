/**
 * Find and rewrite web URLs in free text.
 *
 * Pure on purpose: the client command that reads the clipboard has to call this without
 * pulling `db` into the browser bundle. The mutations that persist attachments live in
 * sibling files and import from here.
 */

import { normalizeHttpUrl } from "./pageTitle";

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
