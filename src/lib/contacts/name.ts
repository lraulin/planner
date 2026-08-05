/**
 * Deriving the strings a contact is *shown* as, from the parts it is *stored* as.
 *
 * Google People stores name parts separately and computes `displayName` and
 * `displayNameLastFirst` server-side as output-only fields. We store the same parts and
 * compute the same renderings here, so the grid, the drawer title, a picker and a future
 * sync all answer the same question the same way. Anything that builds a name by
 * concatenating fields at a call site will eventually disagree with this file.
 */

export type NameParts = {
  namePrefix: string;
  givenName: string;
  middleName: string;
  familyName: string;
  nameSuffix: string;
  nickname: string;
  /** Stored override. Blank means derive. */
  initials: string;
  /** Stored sort-name override. Blank means derive. */
  fileAs: string;
  company: string;
};

/** What an empty contact is called, rather than rendering a blank row. */
export const UNNAMED_CONTACT = "Unnamed contact";

/** Blank-or-whitespace is blank. `"   "` is not an override. */
function filled(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function join(parts: (string | null | undefined)[]): string {
  return parts.map(filled).filter(Boolean).join(" ");
}

/**
 * The first *character* — grapheme-ish, via code points.
 *
 * `s[0]` splits a surrogate pair and yields half a code point, which renders as a
 * replacement glyph. Emoji and astral-plane scripts are rare in a name field and exactly
 * the case nobody checks.
 */
function firstChar(value: string): string {
  const trimmed = filled(value);
  if (!trimmed) return "";
  return Array.from(trimmed)[0] ?? "";
}

/**
 * The grid's Name column and the drawer's title — Google's `displayName`.
 *
 * **Prefix and suffix are excluded**, which is Google's own rule and the right one: "Dr.
 * Ada Lovelace Jr." in a 12rem column is mostly punctuation. `formalNameOf` has them when
 * the full rendering is wanted.
 *
 * Falls back through nickname → company → an email → `UNNAMED_CONTACT`, so a row created
 * from nothing but a phone number still has something to click on. The email fallback is
 * passed in rather than read from the parts, because it lives on `contact_items`.
 */
export function displayNameOf(parts: NameParts, fallbackEmail?: string): string {
  const full = join([parts.givenName, parts.middleName, parts.familyName]);
  if (full) return full;

  return (
    filled(parts.nickname) ||
    filled(parts.company) ||
    filled(fallbackEmail) ||
    UNNAMED_CONTACT
  );
}

/**
 * What the list sorts by — Google's `displayNameLastFirst`, with the stored override
 * winning. Achieve calls this the sort name; Outlook calls it File As.
 *
 * Never returns blank for a contact that has *something*: a blank sort key puts a row at
 * the top of the list with no visible reason.
 */
export function fileAsOf(parts: NameParts): string {
  const override = filled(parts.fileAs);
  if (override) return override;

  const family = filled(parts.familyName);
  const rest = join([parts.givenName, parts.middleName]);
  if (family) return rest ? `${family}, ${rest}` : family;
  if (rest) return rest;

  return filled(parts.company) || displayNameOf(parts);
}

/**
 * Avatar / compact-row initials. Stored value wins — Achieve has an Initials field and
 * someone who filled it in means it.
 *
 * No particle heuristics: `"van der Berg"` initials as `"V"`. Guessing which particles are
 * droppable is a per-language problem with no right answer, and a wrong guess is worse than
 * a boring one. Returns `""` rather than a placeholder, so the caller decides what nothing
 * looks like.
 */
export function initialsOf(parts: NameParts): string {
  const override = filled(parts.initials);
  if (override) return override;

  const given = firstChar(parts.givenName);
  const family = firstChar(parts.familyName);
  const fromName = `${given}${family}`;
  if (fromName) return fromName.toUpperCase();

  // A vendor or a clinic has a company and no person. Two letters, not one, so "Ac" reads
  // as an organisation rather than as someone whose surname was lost.
  const company = filled(parts.company);
  if (company) return Array.from(company).slice(0, 2).join("").toUpperCase();

  return "";
}

/** The full formal rendering, prefix and suffix included. The drawer header's tooltip. */
export function formalNameOf(parts: NameParts): string {
  const full = join([
    parts.namePrefix,
    parts.givenName,
    parts.middleName,
    parts.familyName,
    parts.nameSuffix,
  ]);
  return full || displayNameOf(parts);
}

/**
 * Which of a contact's phones (or emails, or addresses) is *the* one.
 *
 * People's `metadata.primary` first, then lowest `sortKey` — which is array order, and
 * therefore what Google itself would consider first. The database enforces at most one
 * flagged row per kind, so the flagged-tie branch should be unreachable; it exists because
 * a restore or a hand-run UPDATE can produce one, and a list that silently picks
 * differently on each render is worse than one that picks arbitrarily but consistently.
 *
 * **Does not mutate its input.** The caller's array is usually React state.
 */
export function primaryOf<T extends { isPrimary: boolean; sortKey: string }>(
  items: readonly T[],
): T | null {
  if (items.length === 0) return null;

  const flagged = items.filter((item) => item.isPrimary);
  const pool = flagged.length > 0 ? flagged : items;

  return [...pool].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0,
  )[0];
}

/**
 * List ordering. Diacritic- and case-insensitive, so "Ångström" sits by "Anderson" rather
 * than after "Zulu" — the default `<` on strings sorts by code point and gets this wrong in
 * a way nobody notices until the one name that matters is missing from where they looked.
 *
 * A blank file-as sorts last: an unnamed row at the top of the list looks like a bug.
 */
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

export function compareContacts(a: { fileAs: string }, b: { fileAs: string }): number {
  const left = filled(a.fileAs);
  const right = filled(b.fileAs);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return collator.compare(left, right);
}

/**
 * People's partial `Date` as text — "4 Jan", "4 Jan 1979", or blank.
 *
 * The year is genuinely optional in People and routinely unknown, which is why the birthday
 * is three columns and not one. Month-without-day cannot reach the database (a CHECK
 * forbids it) but must not throw here either.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatBirthday(
  year: number | null,
  month: number | null,
  day: number | null,
): string {
  const monthName =
    month != null && month >= 1 && month <= 12 ? MONTHS[month - 1] : null;

  if (monthName && day != null) {
    return year != null ? `${day} ${monthName} ${year}` : `${day} ${monthName}`;
  }
  // A year on its own is legal in People ("born in 1979, day unknown").
  if (year != null) return String(year);
  return "";
}
