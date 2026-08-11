import type { NoteNode, NoteSummary } from "./types";

/** List rows are summaries; detail rows keep a body. Slice only needs shared fields. */
type SliceNote = NoteNode | NoteSummary;

/**
 * Turns the loaded note tree into the flat row list the grid renders.
 *
 * Achieve bundles hierarchy, sort, and panel orientation into one "View" dropdown, and gets
 * hierarchy wrong: all four of its views are nested, so "Simple List" versus "Outline"
 * promises a flat-versus-nested choice it never delivers. Here they are separate: `mode`
 * decides nesting, `sort` decides order, and filtering is applied by the caller before this
 * runs.
 *
 * Pure and free of I/O, so the combinations can be tested without mounting a grid.
 */

export type NotesMode = "nested" | "flat";

/** `manual` is the stored sibling order, and is only meaningful when nested. */
export type NotesSort = "manual" | "title" | "date";

export type NoteRowView<T extends SliceNote = NoteNode> = {
  id: string;
  note: T;
  /** Indentation level. Always 0 in flat mode. */
  depth: number;
};

export type SliceNotesOpts<T extends SliceNote = NoteNode> = {
  mode: NotesMode;
  sort: NotesSort;
  direction?: "asc" | "desc";
  /** Which notes survive. Applied before nesting, so a kept child re-bases its indent. */
  keep?: (note: T) => boolean;
};

function compareTitles(a: SliceNote, b: SliceNote): number {
  const left = a.title.trim();
  const right = b.title.trim();
  // An untitled note sorts last either way rather than leading the list as "".
  if (left === "" && right !== "") return 1;
  if (right === "" && left !== "") return -1;
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareDates(a: SliceNote, b: SliceNote): number {
  // Undated notes sort last, for the same reason untitled ones do.
  if (a.noteDate === null && b.noteDate === null) return 0;
  if (a.noteDate === null) return 1;
  if (b.noteDate === null) return -1;
  return a.noteDate.getTime() - b.noteDate.getTime();
}

function comparatorFor(
  sort: NotesSort,
): ((a: SliceNote, b: SliceNote) => number) | null {
  switch (sort) {
    case "title":
      return compareTitles;
    case "date":
      return compareDates;
    case "manual":
      // Input order already *is* the stored order; re-sorting would be a no-op at best.
      return null;
  }
}

/**
 * Flattens `notes` into grid rows.
 *
 * In **nested** mode, sorting applies *within each sibling group* so the tree survives —
 * sorting a tree globally would tear children away from their parents. In **flat** mode
 * every note is a root, so sorting applies across the whole list, which is the only place
 * a global order makes sense.
 *
 * `collapsed` is honoured in nested mode only: a collapsed note in a flat list would hide
 * rows for a hierarchy that is not on screen.
 */
export function sliceNotes<T extends SliceNote>(
  notes: T[],
  opts: SliceNotesOpts<T>,
): NoteRowView<T>[] {
  const { mode, sort, direction = "asc", keep } = opts;
  const kept = keep ? notes.filter(keep) : notes;
  const comparator = comparatorFor(sort);
  const sign = direction === "desc" ? -1 : 1;

  if (mode === "flat") {
    const rows = comparator ? [...kept].sort((a, b) => comparator(a, b) * sign) : kept;
    return rows.map((note) => ({ id: note.id, note, depth: 0 }));
  }

  const keptIds = new Set(kept.map((note) => note.id));

  // Re-base each note onto its nearest *kept* ancestor, so filtering out a parent promotes
  // its children rather than leaving them indented under nothing.
  const byId = new Map(notes.map((note) => [note.id, note]));
  const effectiveParent = new Map<string, string | null>();

  for (const note of kept) {
    const seen = new Set<string>();
    let parentId = note.parentId;
    while (parentId !== null && !keptIds.has(parentId)) {
      if (seen.has(parentId)) {
        parentId = null;
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    effectiveParent.set(note.id, parentId);
  }

  const childrenOf = new Map<string | null, T[]>();
  for (const note of kept) {
    const parentId = effectiveParent.get(note.id) ?? null;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(note);
    else childrenOf.set(parentId, [note]);
  }

  if (comparator) {
    for (const siblings of childrenOf.values()) {
      siblings.sort((a, b) => comparator(a, b) * sign);
    }
  }

  const rows: NoteRowView<T>[] = [];

  function walk(parentId: string | null, depth: number): void {
    for (const note of childrenOf.get(parentId) ?? []) {
      rows.push({ id: note.id, note, depth });
      // `hidden` from the loader tracks the *stored* tree; after re-basing, what matters is
      // whether this note — now the visible parent — is collapsed.
      if (!note.collapsed) walk(note.id, depth + 1);
    }
  }

  walk(null, 0);
  return rows;
}

/** Distinct subjects across the notes, for the Subject combobox. "General" is always offered. */
export function subjectOptions(notes: readonly { subject: string }[]): string[] {
  const seen = new Set<string>(["General"]);
  for (const note of notes) {
    const subject = note.subject.trim();
    if (subject !== "") seen.add(subject);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
