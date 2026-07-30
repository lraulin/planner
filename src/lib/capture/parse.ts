import { indentColumns, splitIndent, stripLeadingMarkers } from "@/lib/text/markers";

/**
 * Turning the quick capture box's text into a shallow tree of tasks.
 *
 * The point of capture is that it costs nothing: you type or paste what is in your head and
 * the app works out what you meant. So this is deliberately forgiving about *format* while
 * being exact about *structure* — indentation is the one thing the user is actually saying,
 * and getting it wrong builds a plausible-looking tree in the wrong shape, which is far
 * worse than refusing the input.
 *
 * Formats it absorbs, because they are what the clipboard hands you: plain indented text,
 * markdown and rich-text bullets (`-`, `*`, `+`), numbered lists (`1.`, `1)`), task lists
 * (`[ ]`, `[x]`), quoted replies (`>`), and headings (`#`).
 */

/** One line of the box, resolved into a node to create. */
export type CapturedItem = {
  /** 0 for a top-level item; each level of indentation adds one. */
  depth: number;
  name: string;
  /** Achieve's `##` note, or `""`. */
  note: string;
};

/** Achieve's separator between a task's name and its note. */
const NOTE_SEPARATOR = "##";

/**
 * Parses the capture box into items, outermost first, in input order.
 *
 * Indentation is normalised rather than measured absolutely: the shallowest line becomes
 * depth 0 whatever it was indented by, so a block pasted out of the middle of a document
 * does not arrive nested under nothing. Widths need not be consistent — tabs, two spaces
 * and four spaces can be mixed, and only the relative order matters. A jump of several
 * levels at once lands one level deeper than its parent, since there is no node in between
 * for it to hang from.
 */
export function parseCapture(text: string): CapturedItem[] {
  const items: CapturedItem[] = [];
  // Indent widths of the currently open levels, shallowest first. Its length is the depth.
  const openLevels: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim() === "") continue;

    const { indent, rest } = splitIndent(rawLine);
    const columns = indentColumns(indent);

    const { name, note } = splitNote(stripLeadingMarkers(rest).trim());
    // A line that was nothing but a marker — a stray bullet, an empty checkbox — carries no
    // task. Skipping it before it opens an indent level keeps it from re-parenting the
    // lines below it.
    if (name === "" && note === "") continue;

    while (openLevels.length > 0 && columns < openLevels[openLevels.length - 1]) {
      openLevels.pop();
    }
    if (openLevels.length === 0 || columns > openLevels[openLevels.length - 1]) {
      openLevels.push(columns);
    }

    items.push({ depth: openLevels.length - 1, name, note });
  }

  return items;
}

/**
 * Splits `name ## note` at the first separator.
 *
 * Markers are stripped before this runs, so a markdown heading (`## Groceries`) has already
 * become plain text and cannot be mistaken for an empty name with a note.
 */
function splitNote(line: string): { name: string; note: string } {
  const at = line.indexOf(NOTE_SEPARATOR);
  if (at === -1) return { name: line, note: "" };

  return {
    name: line.slice(0, at).trim(),
    note: line.slice(at + NOTE_SEPARATOR.length).trim(),
  };
}
