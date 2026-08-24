/** Actual-style `#tag` tokens embedded in transaction Notes. */

export type NoteTag = { tag: string; start: number; end: number };

const TAG = /(?<!#)#([^#\s]+)/g;
const VALID_TAG = /^[^#\s]+$/u;

/** Every tag occurrence in source order. `##literal` is deliberately ignored. */
export function noteTagOccurrences(notes: string): NoteTag[] {
  return [...notes.matchAll(TAG)].map((match) => ({
    tag: match[1] ?? "",
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Unique, case-sensitive tags in first-occurrence order. */
export function tagsInNotes(notes: string): string[] {
  const seen = new Set<string>();
  return noteTagOccurrences(notes).flatMap(({ tag }) => {
    if (seen.has(tag)) return [];
    seen.add(tag);
    return [tag];
  });
}

export function isValidTag(tag: string): boolean {
  return tag !== "" && VALID_TAG.test(tag);
}

export function normalizeTagInput(value: string): string {
  const tag = value.trim().replace(/^#/, "");
  if (!isValidTag(tag)) {
    throw new Error("A tag cannot be empty or contain whitespace or #.");
  }
  return tag;
}

/** Append an exact tag once, preserving every existing byte of the note. */
export function addTagToNotes(notes: string, rawTag: string): string {
  const tag = normalizeTagInput(rawTag);
  if (tagsInNotes(notes).includes(tag)) return notes;
  if (notes === "") return `#${tag}`;
  return `${notes}${/\s$/u.test(notes) ? "" : " "}#${tag}`;
}

/** Stable migration slug for the fixed labels the retired classifier produced. */
export function legacyCategoryTag(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/gu, " and ")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || "category";
}
