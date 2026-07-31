/**
 * Resolve a human title for a web attachment URL.
 *
 * When someone pastes a link into an attachment's URL field and leaves the name blank,
 * we fetch the page and pull `<title>` / Open Graph so the list shows something readable
 * without a second trip to rename the row.
 *
 * Network failures, non-HTML responses, and non-http(s) URLs all return null — the URL
 * itself is still saved; only the convenience fill is skipped.
 */

const FETCH_TIMEOUT_MS = 4_000;
const MAX_HTML_CHARS = 256_000;
const MAX_TITLE_LENGTH = 200;

/**
 * Turn free-typed link text into an absolute http(s) URL, or null if it cannot be one.
 * Bare hosts get `https://` so "example.com/path" works without the scheme.
 */
export function normalizeHttpUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  return url.href;
}

/** True when this attachment row should receive a fetched page title. */
export function shouldAutofillAttachmentTitle(params: {
  kind: string;
  title: string;
  url: string;
}): boolean {
  if (params.kind !== "attachment") return false;
  if (params.title.trim()) return false;
  return normalizeHttpUrl(params.url) !== null;
}

/**
 * Pull a display title from an HTML document.
 *
 * Prefers the document `<title>` (what the browser tab shows) over Open Graph /
 * Twitter cards. Sites often put a path slug or marketing short name in og:title —
 * AWS cert pages are a concrete example: og is `certified-developer-associate`
 * while the tab is `AWS Certified Developer - Associate`.
 */
export function extractPageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match?.[1] !== undefined) {
    const fromTitle = cleanTitle(match[1]);
    if (fromTitle) return fromTitle;
  }

  const fromMeta = metaContent(html, "og:title") ?? metaContent(html, "twitter:title");
  if (fromMeta) return cleanTitle(fromMeta);

  return null;
}

/**
 * Fetch `url` and return its page title, or null if anything goes wrong.
 * Safe to call from server actions: never throws for network/parse failures.
 */
export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  const url = normalizeHttpUrl(rawUrl);
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "PlannerTitleBot/1.0 (personal planner; +https://github.com/lraulin/planner)",
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      return null;
    }

    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    return extractPageTitle(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function metaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // property/name first, then content — and the reverse order both appear in the wild.
  const propertyFirst = new RegExp(
    `<meta\\b[^>]*\\b(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`,
    "i",
  );
  const contentFirst = new RegExp(
    `<meta\\b[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\b(?:property|name)\\s*=\\s*["']${escaped}["']`,
    "i",
  );
  return propertyFirst.exec(html)?.[1] ?? contentFirst.exec(html)?.[1] ?? null;
}

function cleanTitle(raw: string): string | null {
  const decoded = decodeBasicEntities(raw);
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  if (collapsed.length <= MAX_TITLE_LENGTH) return collapsed;
  return collapsed.slice(0, MAX_TITLE_LENGTH).trimEnd();
}

/** Enough entity decoding for typical page titles without pulling in a dependency. */
function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}
