/**
 * Turns markdown source into a single line of plain text for the grid's Snippet column.
 *
 * This column is why the Notes tab does not need Achieve's always-present note panel: a
 * grid showing only Title / Subject / Date / Flag leaves two notes indistinguishable while
 * scanning. So the snippet has to show the note's *prose*, which means skipping the parts
 * that carry no meaning out of context — a fenced code block, a table's pipes, the `#` of
 * a heading.
 *
 * Deliberately not a markdown parser. It runs per row on every render and only has to be
 * right about the common shapes; anything it mishandles degrades to slightly noisier text,
 * never to a wrong note.
 */

import { stripLeadingMarkers } from "@/lib/text/markers";

const DEFAULT_LENGTH = 120;

/** Lines that are structure rather than prose, once list/quote markers are stripped. */
function isSkippableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  // Thematic breaks: ---, ***, ___
  if (/^([-*_])\s*(\1\s*){2,}$/.test(trimmed)) return true;
  // A table's delimiter row: |---|:--:|
  if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(trimmed) && trimmed.includes("-")) return true;
  // A setext heading's underline.
  if (/^(=+|-+)$/.test(trimmed)) return true;
  return false;
}

function stripInline(text: string): string {
  return (
    text
      // Images before links: ![alt](src) keeps the alt text, which is the only prose in it.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Reference links and bare autolinks.
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      .replace(/<((?:https?|mailto):[^>]+)>/g, "$1")
      // Inline code: keep what is inside, drop the backticks.
      .replace(/`+([^`]*)`+/g, "$1")
      // Emphasis, strong, and strikethrough markers.
      .replace(/(\*\*\*|___)(\S(?:.*?\S)?)\1/g, "$2")
      .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, "$2")
      .replace(/(\*|_)(\S(?:.*?\S)?)\1/g, "$2")
      .replace(/~~(\S(?:.*?\S)?)~~/g, "$1")
      // Leftover escapes.
      .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")
  );
}

/**
 * A one-line plain-text preview of `body`, at most `maxLength` characters, truncated on a
 * word boundary with an ellipsis. Returns `""` for a note with no prose.
 */
export function noteSnippet(body: string, maxLength = DEFAULT_LENGTH): string {
  const parts: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  for (const rawLine of body.split("\n")) {
    const trimmed = rawLine.trim();

    // Fenced code: skip the whole block. A note that opens with one — pasted output, a
    // config snippet — would otherwise preview as its own opening ``` line.
    const fence = /^(```+|~~~+)/.exec(trimmed);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    if (isSkippableLine(rawLine)) continue;

    const text = stripInline(stripLeadingMarkers(rawLine)).trim();
    if (text === "") continue;

    parts.push(text);

    // Enough to fill the column, with slack so the word-boundary trim has somewhere to cut.
    if (parts.join(" ").length > maxLength + 40) break;
  }

  const flat = parts.join(" ").replace(/\s+/g, " ").trim();
  if (flat.length <= maxLength) return flat;

  const cut = flat.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  // Fall back to a hard cut when the first "word" is longer than the whole column.
  const trimmedCut = lastSpace > maxLength * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${trimmedCut.replace(/[\s,;:.-]+$/, "")}…`;
}
