/**
 * Prepared collators for comparators that run once per pair of rows.
 *
 * `a.localeCompare(b, undefined, options)` builds a new `Intl.Collator` on every call —
 * about two microseconds, fourteen times what a prepared one costs — and a sort calls its
 * comparator n·log n times. Sorting the Register's seven thousand rows by description is
 * some ninety thousand comparisons, which is the difference between a tenth of a second
 * and nothing anyone would notice. `a.localeCompare(b)` with no options is not affected;
 * the engine keeps that collator itself.
 *
 * Each one orders exactly as the `localeCompare` call it replaces: that method is defined
 * as constructing a collator from the same arguments and calling `compare`.
 */

/** `A2` before `A10`; case and accents still tell two strings apart. */
export const naturalOrder = new Intl.Collator(undefined, { numeric: true });

/** `A2` before `A10`, and `apple` beside `Apple` beside `Äpple`. */
export const naturalOrderFolded = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Plain alphabetical with case and accents folded away. */
export const alphabeticalFolded = new Intl.Collator(undefined, { sensitivity: "base" });

/** Case folded, accents kept — for asking whether two values are the same word. */
export const accentSensitive = new Intl.Collator(undefined, { sensitivity: "accent" });
