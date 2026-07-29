import type { NoteNode } from "./types";

/**
 * Achieve's "Note Item Filter" dialog, as a pure predicate.
 *
 * The dialog has three independent criteria — a text search, a Subject list, and a Contexts
 * list — each with its own All/Any toggle, plus an overall Match All / Match Any across the
 * three. Reproducing that faithfully matters because the two levels of All/Any are easy to
 * conflate, and getting it wrong shows up as a filter that quietly returns too much.
 *
 * The text search is what makes the growing pile usable: it reads the note **body**, not
 * just the title, which is the one thing the grid columns cannot show you.
 */

/** Whether every term must match, or any one of them. */
export type MatchMode = "all" | "any";

export type NoteFilter = {
  /** Whitespace-separated search terms. Empty disables the text criterion. */
  search: string;
  /** How the individual search terms combine. */
  searchMode: MatchMode;
  searchInTitle: boolean;
  searchInBody: boolean;
  /** Achieve's "in other text fields" — here, Subject and Contexts. */
  searchInOtherFields: boolean;
  /** Subjects to keep. Empty disables the criterion. */
  subjects: string[];
  subjectMode: MatchMode;
  /** Contexts to keep. Empty disables the criterion. */
  contexts: string[];
  contextMode: MatchMode;
  /** How the three criteria above combine. */
  matchMode: MatchMode;
};

export const EMPTY_NOTE_FILTER: NoteFilter = {
  search: "",
  searchMode: "all",
  searchInTitle: true,
  searchInBody: true,
  searchInOtherFields: false,
  subjects: [],
  subjectMode: "any",
  contexts: [],
  contextMode: "any",
  matchMode: "all",
};

/** True when the filter would keep every note, so callers can skip the work entirely. */
export function isEmptyNoteFilter(filter: NoteFilter): boolean {
  return (
    filter.search.trim() === "" &&
    filter.subjects.length === 0 &&
    filter.contexts.length === 0
  );
}

function terms(search: string): string[] {
  return search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term !== "");
}

/** The note text a search looks at, given which boxes are ticked. */
function searchableText(note: NoteNode, filter: NoteFilter): string {
  const parts: string[] = [];
  if (filter.searchInTitle) parts.push(note.title);
  if (filter.searchInBody) parts.push(note.body);
  if (filter.searchInOtherFields) {
    parts.push(note.subject, note.contexts.join(" "), note.nodeName ?? "");
  }
  return parts.join("\n").toLowerCase();
}

function combine(results: boolean[], mode: MatchMode): boolean {
  // No criteria is not a rejection: an untouched filter keeps everything, under either mode.
  if (results.length === 0) return true;
  return mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

function matchesSearch(note: NoteNode, filter: NoteFilter): boolean | null {
  const list = terms(filter.search);
  if (list.length === 0) return null;

  // Every box unticked can never match, and silently keeping everything would look like the
  // search was ignored. Report no match so the empty result is visible and explainable.
  const haystack = searchableText(note, filter);
  if (haystack.trim() === "" && !filter.searchInTitle && !filter.searchInBody) {
    return false;
  }

  const hits = list.map((term) => haystack.includes(term));
  return combine(hits, filter.searchMode);
}

function matchesSubject(note: NoteNode, filter: NoteFilter): boolean | null {
  if (filter.subjects.length === 0) return null;

  const subject = note.subject.trim().toLowerCase();
  const wanted = filter.subjects.map((s) => s.trim().toLowerCase());

  // "All" across subjects can only match when one subject is asked for — a note has exactly
  // one Subject. Achieve offers the toggle anyway; this reproduces its behaviour rather
  // than pretending the option does something else.
  const hits = wanted.map((value) => value === subject);
  return combine(hits, filter.subjectMode);
}

function matchesContexts(note: NoteNode, filter: NoteFilter): boolean | null {
  if (filter.contexts.length === 0) return null;

  const owned = new Set(note.contexts.map((value) => value.trim().toLowerCase()));
  const hits = filter.contexts.map((value) => owned.has(value.trim().toLowerCase()));
  return combine(hits, filter.contextMode);
}

/** Whether one note survives the filter. */
export function notePassesFilter(note: NoteNode, filter: NoteFilter): boolean {
  const results = [
    matchesSearch(note, filter),
    matchesSubject(note, filter),
    matchesContexts(note, filter),
  ].filter((result): result is boolean => result !== null);

  return combine(results, filter.matchMode);
}

/** Distinct contexts across the notes, for the filter dialog's Contexts picker. */
export function contextOptions(notes: NoteNode[]): string[] {
  const seen = new Set<string>();
  for (const note of notes) {
    for (const context of note.contexts) {
      const trimmed = context.trim();
      if (trimmed !== "") seen.add(trimmed);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
