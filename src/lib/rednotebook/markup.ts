/**
 * Light RedNotebook (txt2tags-inspired) → markdown conversion.
 *
 * Not full txt2tags parity — enough for headings, emphasis, strike, line comments, and
 * hashtags. See RedNotebook help / this journal's real corpus.
 */

export type MarkupResult = {
  markdown: string;
  /** Hashtags found in the source (without `#`), unique, order of first appearance. */
  contexts: string[];
};

/** Normalize trailing newlines for equality checks; preserve internal whitespace. */
export function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

/**
 * Convert RN markup to markdown and collect `#hashtags` for note contexts.
 */
export function rednotebookToMarkdown(source: string): MarkupResult {
  const contexts: string[] = [];
  const seen = new Set<string>();

  // Line-oriented pass: drop % comments; convert headings; collect hashtags later on body.
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const outLines: string[] = [];

  for (const line of lines) {
    // Comments: % must be the first character on the line (RN help).
    if (line.startsWith("%")) continue;

    // Headings: = Title = through ===== Title ===== (more equals = smaller heading).
    // Title line only — entire line is the heading.
    const heading = /^(={1,5})\s*(.+?)\s*\1\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      outLines.push(`${"#".repeat(level)} ${heading[2].trim()}`);
      continue;
    }

    outLines.push(line);
  }

  let body = outLines.join("\n");

  // RN uses \\\\ for a hard newline in some versions — collapse to real newline.
  body = body.replace(/\\\\/g, "\n");

  // --struck through-- → ~~struck through~~ (require at least one non-dash inside).
  body = body.replace(/--([^\n-](?:[^\n]*?[^\n-])?)--/g, "~~$1~~");

  // //italic// → *italic*. Avoid turning https:// into markup by requiring the
  // opening // not to follow a word char or colon.
  body = body.replace(/(^|[^:\w])\/\/([^\n/][\s\S]*?)\/\//g, "$1*$2*");

  // Hashtags: #word (twitter-style). Leave them in the body; also collect for contexts.
  const tagRe = /(?:^|[\s(])#([A-Za-z][\w-]*)/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(body)) !== null) {
    const tag = tm[1];
    if (!seen.has(tag)) {
      seen.add(tag);
      contexts.push(tag);
    }
  }

  return { markdown: normalizeBody(body), contexts };
}
