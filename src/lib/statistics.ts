/**
 * The middle of a set of numbers, and the two answers an even-length set can give.
 *
 * Median rather than mean everywhere it appears here: a bill's typical charge and a
 * paycheck's typical size are both read off histories with one enormous outlier in them
 * (an annual renewal filed to a monthly envelope, a bonus), and a mean would report a
 * number no month ever looked like.
 *
 * It lived four times over in `src/lib/finances/` — the analytics fold, the Track-as-bill
 * draft, the income detector, and the one-budget cutover — because each caller needed it
 * before the previous one existed. Three agreed and one did not, which is the whole reason
 * this is one module: the even-length case is a real choice, and a copy made in a hurry
 * takes whichever answer the author happened to think of.
 */

/**
 * The exact median. An even-length set returns the mean of the two middle values, so a set
 * of integers can answer with a half.
 *
 * Empty is `0` rather than `null`: every caller here is asking "what is typical", and there
 * being nothing to be typical of is a zero, not a missing value they would have to branch on.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The median rounded to a whole number — what a caller working in cents or in whole days
 * wants, because half a cent is not a value the rest of the app can carry.
 *
 * `Math.round` is half-up, so an even-length set straddling `.5` rounds away from zero on
 * the positive side and toward zero on the negative. That is the behaviour every copy of
 * this had; it is named here so a caller that cares can see it rather than rediscover it.
 */
export function medianRounded(values: readonly number[]): number {
  return Math.round(median(values));
}
