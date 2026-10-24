const BEFORE = 20;
const LENGTH = 80;
const SKIP_MIN = 10;

/**
 * A short window of `note` around the match at `at`, starting on a word boundary so the line
 * under a search hit never opens mid-word. An ellipsis marks a window that does not start the
 * note.
 */
export function snippetAround(note: string, at: number): string {
  if (at < 0) return "";
  // Skipping a handful of characters to save nothing reads worse than showing them.
  let start = at - BEFORE < SKIP_MIN ? 0 : at - BEFORE;
  let lead = "";
  if (start > 0) {
    const space = note.indexOf(" ", start);
    // No space before the match: show the match rather than skip past it.
    start = space !== -1 && space < at ? space + 1 : start;
    lead = "…";
  }
  return (
    lead +
    note
      .slice(start, start + LENGTH)
      .replace(/\s+/g, " ")
      .trim()
  );
}
