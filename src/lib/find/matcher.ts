/**
 * The one matcher Advanced Find uses, for every field of every source.
 *
 * This is the expressive rung. `src/lib/grid/search.ts` is rung 1 and stays deliberately dumb
 * — substring only, no operators, no regex — because `data-grid.md` routes anything more
 * expressive to a higher rung rather than growing the box above the grid. Advanced Find *is*
 * that rung, on its own surface, so `Matches Regular Expression` (deferred by
 * `2026-08-02-1208-custom-column-filters`) lands here and nowhere else.
 *
 * **The query is one pattern, not a term list.** Achieve's dialog has a single "Search for:"
 * field and no documented term semantics, and AND-across-whitespace would be incoherent next
 * to Whole Word and a user-supplied regex. `rowMatchesSearch` keeps the multi-term behaviour
 * for the grid box, where it belongs.
 */

import type { FindMatchOptions } from "./types";

export type MatchSpan = { start: number; end: number };

/** Returns the first hit in `text`, or null. Safe to call with null and empty strings. */
export type Matcher = (text: string | null | undefined) => MatchSpan | null;

export type MatcherResult = { ok: true; match: Matcher } | { ok: false; error: string };

/** Escape every character the regex engine would otherwise read as syntax. */
function escapeLiteral(query: string): string {
  return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap a pattern so it only matches when it is not butted against a word character.
 *
 * Lookarounds rather than `\b`, because `\b` is defined relative to the *pattern's* edge
 * characters: `\b\.\b` can never match, so a whole-word search for `.` or `C++` would
 * silently find nothing. `(?<!\w)…(?!\w)` asks the question the checkbox actually means —
 * "is this a standalone occurrence" — for any query, punctuation included.
 */
function wholeWordWrap(pattern: string): string {
  return `(?<!\\w)(?:${pattern})(?!\\w)`;
}

/**
 * Build a matcher, or explain why the query cannot be one.
 *
 * The error is a sentence for the user, not a code: an invalid regex is a typo in progress,
 * and "Unterminated character class" beside the box is what lets them fix it. Never throws —
 * a bad pattern must not take down the page, and must not read as "no matches" either, which
 * would be indistinguishable from a correct search of an empty corpus.
 */
export function makeMatcher(query: string, options: FindMatchOptions): MatcherResult {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Enter something to find." };

  const base = options.regex ? trimmed : escapeLiteral(trimmed);
  const pattern = options.wholeWord ? wholeWordWrap(base) : base;

  // `g` so a zero-length hit can be stepped over rather than ending the search; see the loop
  // below. No `u` — a user-supplied pattern need not be Unicode-mode valid.
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, options.matchCase ? "g" : "gi");
  } catch (error) {
    // V8 says `Invalid regular expression: /plan[che/gi: Unterminated character class`.
    // The prefix and the echoed pattern are both noise beside an input box that already
    // shows the pattern, and prefixing again produced the message twice over. Keep the
    // reason, which is the only part that says what to fix.
    const raw = error instanceof Error ? error.message : "";
    const detail =
      raw.replace(/^Invalid regular expression:\s*\/.*\/[a-z]*:\s*/i, "").trim() ||
      "Invalid pattern";
    return { ok: false, error: `Invalid regular expression: ${detail}` };
  }

  return {
    ok: true,
    match: (text) => {
      if (!text) return null;
      // `g` makes `lastIndex` persist across calls, and this matcher is reused for every
      // field of every record. Reset before each search or the second field resumes from
      // wherever the first one stopped.
      regex.lastIndex = 0;

      // A nullable pattern (`a*`, `\\b`, `^`) matches the empty string at offset 0 of every
      // field, which would make every record in the database a result. Step past those and
      // keep looking for a hit with actual text in it.
      while (regex.lastIndex <= text.length) {
        const found = regex.exec(text);
        if (!found) return null;
        if (found[0].length > 0) {
          return { start: found.index, end: found.index + found[0].length };
        }
        regex.lastIndex = found.index + 1;
      }
      return null;
    },
  };
}

const SNIPPET_RADIUS = 40;

/**
 * The text around a hit, for the Match column.
 *
 * Whitespace is collapsed first so a hit inside a Markdown note body does not arrive as four
 * blank lines and an indent. Both ends are elided only when something was actually cut — a
 * short field should read as itself, not as `…foo…`.
 */
export function snippet(
  text: string,
  span: MatchSpan,
  radius = SNIPPET_RADIUS,
): string {
  const before = text.slice(Math.max(0, span.start - radius), span.start);
  const hit = text.slice(span.start, span.end);
  const after = text.slice(span.end, span.end + radius);

  const collapse = (value: string) => value.replace(/\s+/g, " ");
  const leading = span.start - radius > 0 ? "…" : "";
  const trailing = span.end + radius < text.length ? "…" : "";

  return `${leading}${collapse(before).trimStart()}${collapse(hit)}${collapse(after).trimEnd()}${trailing}`;
}
