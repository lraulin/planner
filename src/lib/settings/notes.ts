import { EMPTY_NOTE_FILTER, type MatchMode, type NoteFilter } from "@/lib/notes/filter";
import type { NotesMode, NotesSort } from "@/lib/notes/slice";
import { asBoolean, asOneOf, asRecord, asString, asStringArray } from "./parse";
import { SETTINGS_VERSION } from "./scopes";

/**
 * What the Notes tab remembers beyond its column layout: mode, sort, and the filter
 * dialog. Stored under `notes:filter`.
 *
 * Column filters / sort / widths live on `grid:notes` like every other tab. This scope
 * is the Notes-specific dialog state that has no column id to hang off.
 */

const MODES: readonly NotesMode[] = ["nested", "flat"];
const SORTS: readonly NotesSort[] = ["manual", "title", "date"];
const MATCH_MODES: readonly MatchMode[] = ["all", "any"];

export type NotesViewSettings = {
  mode: NotesMode;
  sort: NotesSort;
  filter: NoteFilter;
};

export const DEFAULT_NOTES_VIEW: NotesViewSettings = {
  mode: "nested",
  sort: "manual",
  filter: EMPTY_NOTE_FILTER,
};

export function parseNotesView(value: unknown): NotesViewSettings {
  const record = asRecord(value);
  if (!record) return DEFAULT_NOTES_VIEW;

  return {
    mode: asOneOf(record.mode, MODES, DEFAULT_NOTES_VIEW.mode),
    sort: asOneOf(record.sort, SORTS, DEFAULT_NOTES_VIEW.sort),
    filter: parseNoteFilter(record.filter),
  };
}

function parseNoteFilter(value: unknown): NoteFilter {
  const record = asRecord(value);
  if (!record) return EMPTY_NOTE_FILTER;

  return {
    search: asString(record.search, EMPTY_NOTE_FILTER.search),
    searchMode: asOneOf(record.searchMode, MATCH_MODES, EMPTY_NOTE_FILTER.searchMode),
    searchInTitle: asBoolean(record.searchInTitle, EMPTY_NOTE_FILTER.searchInTitle),
    searchInBody: asBoolean(record.searchInBody, EMPTY_NOTE_FILTER.searchInBody),
    searchInOtherFields: asBoolean(
      record.searchInOtherFields,
      EMPTY_NOTE_FILTER.searchInOtherFields,
    ),
    // Explicitly empty subject/context lists stay empty — "match nothing on this
    // criterion" is legal and must not silently reopen the filter.
    subjects: asStringArray(record.subjects, EMPTY_NOTE_FILTER.subjects),
    subjectMode: asOneOf(
      record.subjectMode,
      MATCH_MODES,
      EMPTY_NOTE_FILTER.subjectMode,
    ),
    contexts: asStringArray(record.contexts, EMPTY_NOTE_FILTER.contexts),
    contextMode: asOneOf(
      record.contextMode,
      MATCH_MODES,
      EMPTY_NOTE_FILTER.contextMode,
    ),
    matchMode: asOneOf(record.matchMode, MATCH_MODES, EMPTY_NOTE_FILTER.matchMode),
  };
}

export function serializeNotesView(settings: NotesViewSettings): unknown {
  return { v: SETTINGS_VERSION, ...settings };
}

/** True when the stored blob is the factory Notes extras — Custom is then a grid matter. */
export function notesMatchDefaults(raw: unknown): boolean {
  if (raw === undefined) return true;
  const parsed = parseNotesView(raw);
  return (
    parsed.mode === DEFAULT_NOTES_VIEW.mode &&
    parsed.sort === DEFAULT_NOTES_VIEW.sort &&
    JSON.stringify(parsed.filter) === JSON.stringify(DEFAULT_NOTES_VIEW.filter)
  );
}
