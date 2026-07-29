/**
 * Markdown editing helpers for the note textarea, as pure functions.
 *
 * These live here rather than in the component because they are cursor arithmetic — the
 * kind of off-by-one logic that looks right, reads right, and is wrong, and that no React
 * test would catch as cheaply as a table of string cases.
 *
 * Every helper takes the full text plus a selection and returns the full text plus the new
 * selection, or `null` when it does not apply and the browser's default should stand.
 */

export type Selection = { start: number; end: number };
export type EditResult = { text: string; selection: Selection };

/** The line containing `index`, as offsets into `text`. */
function lineBounds(text: string, index: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const nextBreak = text.indexOf("\n", index);
  return { start, end: nextBreak === -1 ? text.length : nextBreak };
}

/** The marker opening a list item, split into its parts. */
type ListMarker = {
  /** Leading whitespace. */
  indent: string;
  /** `- `, `* `, `+ `, or `12. `. */
  bullet: string;
  /** `[ ] ` or `[x] `, when this is a task item. */
  checkbox: string;
  /** Whether the bullet is an ordered number, and which one. */
  ordered: number | null;
};

function parseListMarker(line: string): ListMarker | null {
  const match = /^(\s*)(?:([-*+])|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/.exec(line);
  if (!match) return null;

  const [, indent, bulletChar, number, delimiter, checkbox] = match;

  return {
    indent,
    bullet: bulletChar ? `${bulletChar} ` : `${number}${delimiter} `,
    checkbox: checkbox ? checkbox.replace(/\s+$/, " ") : "",
    ordered: number ? Number(number) : null,
  };
}

/** A blockquote's `> ` prefix, if the line has one. */
function quotePrefix(line: string): string {
  const match = /^(\s*(?:>\s?)+)/.exec(line);
  return match ? match[1] : "";
}

function replaceRange(
  text: string,
  start: number,
  end: number,
  insert: string,
): { text: string; caret: number } {
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    caret: start + insert.length,
  };
}

/**
 * Enter inside a list continues it: a new item with the same indent, bullet, and — for
 * ordered lists — the next number. A task item continues as an *unchecked* box, never
 * carrying the tick forward.
 *
 * On an item that is empty apart from its marker, Enter **clears the marker** instead. That
 * is how every editor ends a list, and the alternative — emitting another empty bullet — is
 * the single most irritating thing a naive implementation does.
 *
 * Returns `null` when the caret is not in a list or quote, letting Enter do its normal job.
 */
export function continueListOnEnter(
  text: string,
  selection: Selection,
): EditResult | null {
  // With text selected, Enter replaces it; continuing a list would be a guess.
  if (selection.start !== selection.end) return null;

  const { start, end } = lineBounds(text, selection.start);
  const line = text.slice(start, end);

  // Only continue from the end of the line. Splitting mid-item is a normal line break.
  if (selection.start !== end) return null;

  const marker = parseListMarker(line);

  if (marker) {
    const markerLength =
      marker.indent.length + marker.bullet.length + marker.checkbox.length;
    const content = line.slice(markerLength);

    // Empty item: clear it and end the list.
    if (content.trim() === "") {
      const { text: next, caret } = replaceRange(text, start, end, marker.indent);
      return { text: next, selection: { start: caret, end: caret } };
    }

    const bullet =
      marker.ordered === null
        ? marker.bullet
        : `${marker.ordered + 1}${marker.bullet.slice(-2)}`;
    // A continued task item always starts unchecked — carrying `[x]` forward would tick a
    // box the user has not done.
    const checkbox = marker.checkbox ? "[ ] " : "";
    const insert = `\n${marker.indent}${bullet}${checkbox}`;

    const { text: next, caret } = replaceRange(text, end, end, insert);
    return { text: next, selection: { start: caret, end: caret } };
  }

  const quote = quotePrefix(line);
  if (quote !== "") {
    // An empty quote line ends the quote, mirroring the empty-list-item rule.
    if (line.slice(quote.length).trim() === "") {
      const { text: next, caret } = replaceRange(text, start, end, "");
      return { text: next, selection: { start: caret, end: caret } };
    }
    const { text: next, caret } = replaceRange(text, end, end, `\n${quote}`);
    return { text: next, selection: { start: caret, end: caret } };
  }

  return null;
}

const INDENT = "  ";

/**
 * Tab indents, Shift+Tab outdents. With a selection spanning lines, every touched line
 * moves; with a bare caret, Tab inserts an indent at the caret.
 *
 * Without this, Tab leaves the textarea, which makes indenting a nested list impossible
 * without reaching for the mouse — and `ux-principles.md` asks for keyboard first.
 */
export function indentOnTab(
  text: string,
  selection: Selection,
  outdent: boolean,
): EditResult | null {
  const spansLines =
    selection.start !== selection.end &&
    text.slice(selection.start, selection.end).includes("\n");

  if (!spansLines && !outdent) {
    if (selection.start !== selection.end) {
      const { text: next, caret } = replaceRange(
        text,
        selection.start,
        selection.end,
        INDENT,
      );
      return { text: next, selection: { start: caret, end: caret } };
    }
    const { text: next, caret } = replaceRange(
      text,
      selection.start,
      selection.start,
      INDENT,
    );
    return { text: next, selection: { start: caret, end: caret } };
  }

  const first = lineBounds(text, selection.start).start;
  const last = lineBounds(text, selection.end).end;
  const block = text.slice(first, last);

  let caretLineDelta = 0;
  let delta = 0;

  const lines = block.split("\n").map((line, index) => {
    if (outdent) {
      // Take up to INDENT.length spaces, or a single tab — whichever the line actually has,
      // so a line indented by one space does not lose two characters.
      const match = /^(\t| {1,2})/.exec(line);
      if (!match) return line;
      if (index === 0) caretLineDelta = -match[1].length;
      delta -= match[1].length;
      return line.slice(match[1].length);
    }
    if (index === 0) caretLineDelta = INDENT.length;
    delta += INDENT.length;
    return INDENT + line;
  });

  const nextBlock = lines.join("\n");
  if (nextBlock === block) return null;

  const nextText = text.slice(0, first) + nextBlock + text.slice(last);

  // A bare caret stays a bare caret, moved by what its own line gained or lost. A real
  // selection expands to the whole block, which is what every editor does on Tab — the
  // alternative leaves the first line's new indentation outside the selection, so a second
  // Tab would indent a different range than the first.
  const selectionOut =
    selection.start === selection.end
      ? (() => {
          const caret = Math.max(first, selection.start + caretLineDelta);
          return { start: caret, end: caret };
        })()
      : { start: first, end: Math.max(first, last + delta) };

  return { text: nextText, selection: selectionOut };
}

/**
 * Wraps the selection in `marker` (`**` for bold, `_` for italic), or unwraps it when it is
 * already wrapped — so the same shortcut toggles, as it does everywhere else.
 *
 * With no selection, inserts the pair and puts the caret between them.
 */
export function toggleWrap(
  text: string,
  selection: Selection,
  marker: string,
): EditResult {
  const { start, end } = selection;
  const selected = text.slice(start, end);

  if (selected === "") {
    const { text: next, caret } = replaceRange(text, start, end, marker + marker);
    return {
      text: next,
      selection: { start: caret - marker.length, end: caret - marker.length },
    };
  }

  // Already wrapped inside the selection: **bold**
  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    const { text: next } = replaceRange(text, start, end, inner);
    return { text: next, selection: { start, end: start + inner.length } };
  }

  // Wrapped just outside the selection: **[bold]**
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    const outerStart = start - marker.length;
    const { text: next } = replaceRange(
      text,
      outerStart,
      end + marker.length,
      selected,
    );
    return {
      text: next,
      selection: { start: outerStart, end: outerStart + selected.length },
    };
  }

  const wrapped = marker + selected + marker;
  const { text: next } = replaceRange(text, start, end, wrapped);
  return {
    text: next,
    selection: { start: start + marker.length, end: end + marker.length },
  };
}
