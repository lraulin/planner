/**
 * Stripping markdown's leading line markers, shared by the two features that need it:
 * the Notes grid's snippet column and quick capture's paste handling.
 *
 * Neither is a markdown parser. Both only have to be right about the shapes people
 * actually paste — a bulleted list copied out of a document, a checklist, a quoted reply —
 * and to degrade into slightly noisier text rather than into something wrong.
 */

/** Leading whitespace, and everything after it. */
export function splitIndent(line: string): { indent: string; rest: string } {
  const match = /^[ \t]*/.exec(line);
  const indent = match ? match[0] : "";
  return { indent, rest: line.slice(indent.length) };
}

/**
 * How far a run of whitespace indents, in columns, with a tab worth `tabWidth`.
 *
 * Depth only ever gets compared against other lines in the same paste, so this needs to be
 * monotonic rather than a faithful terminal simulation: what matters is that a deeper line
 * measures larger, whichever whitespace the source used.
 */
export function indentColumns(indent: string, tabWidth = 4): number {
  let columns = 0;
  for (const char of indent) {
    columns += char === "\t" ? tabWidth : 1;
  }
  return columns;
}

/**
 * Peels list bullets, ordered numbers, task checkboxes, blockquote arrows and ATX heading
 * hashes off the front of a line.
 *
 * Markers nest — `> - [ ] thing` is a quoted, checked list item — so it peels until the
 * line stops changing.
 */
export function stripLeadingMarkers(line: string): string {
  let text = line;
  let previous: string;

  do {
    previous = text;
    text = text
      .replace(/^\s*>\s?/, "")
      // `\s+|$` rather than `\s+`: a marker with nothing after it — the empty bullet left
      // behind by a copied list — is still a marker, and leaving it would turn "-" into a
      // task named "-".
      .replace(/^\s*(?:[-*+]|\d+[.)])(?:\s+|$)/, "")
      .replace(/^\s*#{1,6}(?:\s+|$)/, "")
      // Task-list boxes, once the bullet in front of them is gone.
      .replace(/^\[[ xX]\]\s*/, "");
  } while (text !== previous);

  return text;
}
