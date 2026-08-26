/**
 * How many units are in one Amazon purchase, read out of the product title.
 *
 * There is no pack-size field in the order export — Amazon puts it in the name, in about a
 * dozen spellings, next to numbers that look identical and mean something else entirely.
 * `3 Fl Oz (Pack of 1)` is one unit, not three; `.75-Inch by 125-Inch, 5-Pack` is five, not
 * a hundred and twenty-five. So every pattern here **requires a pack word**: a bare number
 * with a unit of volume, weight or length can never match, which is the whole safety
 * property. `packSize.test.ts` pins that down against real titles from the order history.
 *
 * A miss returns `null` rather than 1. Guessing "one" would silently price a 42-can case as
 * a single can, and the suggestion the user is asked to check would be off by a factor of
 * forty-two with nothing on screen to say so.
 */

/**
 * The first pack statement in the title wins.
 *
 * Titles routinely carry two — `336 Count (8 Packs of 42)`, `6 Ultra Rolls = 24 Regular
 * Rolls … (1 Pack of 6)` — and the leading one is the headline figure, which is the number
 * a person reading the row would also take.
 *
 * The multiplied form (`8 Packs of 42`) is first in the alternation so that at an equal
 * start offset it beats the plain `8 Packs` reading. The lookbehind keeps a decimal's
 * fraction from being read as a count: `1.5 Pack` must not be `5`.
 */
const PACK_PATTERN =
  /(?<![\d.])(\d+)\s*packs?\s+of\s+(\d+)\b|(?<![\d.])(\d+)\s*-?\s*(?:counts?|ct|packs?|pks?)\b|\b(?:packs?|case|box|set)\s+of\s+(\d+)\b/gi;

/** Beyond this a "count" is part number noise, not a pack size. */
const MAX_PACK = 10_000;

export function parsePackCount(productName: string): number | null {
  for (const match of productName.matchAll(PACK_PATTERN)) {
    const [, multiplierGroup, multiplicandGroup, plainGroup, ofGroup] = match;
    const count =
      multiplierGroup !== undefined
        ? Number(multiplierGroup) * Number(multiplicandGroup)
        : Number(plainGroup ?? ofGroup);
    if (Number.isFinite(count) && count > 0 && count <= MAX_PACK) return count;
  }
  return null;
}
