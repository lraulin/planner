/**
 * Closing the gap between a split parent's amount and the sum of its children.
 *
 * The mutation refuses to write an unbalanced split
 * (`agent-os/specs/2026-08-26-2022-split-transactions/` D6), which is only liveable because
 * balancing is one click. This module is that click.
 *
 * **The case it has to solve is sales tax.** You type the two subscription prices off an
 * Apple receipt — $13.00 and $19.99 — against a $34.97 charge, and the $1.98 left over is
 * tax. Actual's `Distribute` spreads a remainder evenly across *zero-amount* children
 * (`desktop-client/src/components/transactions/TransactionsTable.tsx:3774`), which cannot
 * help here: both children have amounts, and 99¢ each is the wrong answer because tax is
 * proportional to price, not per line. So there are two weightings over one allocator.
 *
 * Nothing here touches the database or React. Everything is integer cents, asserted, and the
 * result sums to the target **exactly** — an allocator that is off by a cent produces a
 * number that looks entirely plausible and fails `reconcile.ts` a month later.
 */

/** Every money value in this module is a whole number of cents, and proves it. */
function cents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

/**
 * How a remainder is spread across children.
 *
 * - `proportional` — across children that already have an amount, in proportion to those
 *   amounts. The tax case, and the default once every child has been filled in.
 * - `even` — across children with no amount yet, equally. Actual's behaviour, and the right
 *   one immediately after adding a row: the empty child is the one waiting for a number.
 */
export type DistributeStrategy = "proportional" | "even";

/** What is left to allocate: the parent's amount minus what the children already claim. */
export function splitRemainderCents(
  parentCents: number,
  childCents: readonly number[],
): number {
  cents(parentCents, "parent amount");
  childCents.forEach((value, i) => cents(value, `child ${i} amount`));
  return parentCents - childCents.reduce((sum, value) => sum + value, 0);
}

/**
 * The strategy `Distribute` picks when the user has not chosen one.
 *
 * An empty child is an unanswered question, so it takes precedence: while one exists, `even`
 * puts the remainder where the person was about to type. Once every child has a number, the
 * only sensible reading of a leftover is tax or a fee, which is proportional.
 */
export function defaultStrategy(childCents: readonly number[]): DistributeStrategy {
  return childCents.some((value) => value === 0) ? "even" : "proportional";
}

/**
 * Spread the remainder across `childCents`, returning the new child amounts.
 *
 * The result always sums to `parentCents` exactly. A remainder of zero returns the children
 * unchanged, so calling this on a balanced split is a no-op rather than a reshuffle.
 *
 * Where the chosen strategy has no eligible child — `proportional` when every child is zero,
 * `even` when every child is filled — the remainder falls back to every child equally rather
 * than being refused. Returning an unbalanced result would hand the caller a value the
 * mutation is about to reject, which is a worse answer than an arbitrary but exact one.
 */
export function distributeRemainder(
  parentCents: number,
  childCents: readonly number[],
  strategy: DistributeStrategy = defaultStrategy(childCents),
): number[] {
  const remainder = splitRemainderCents(parentCents, childCents);
  if (childCents.length === 0 || remainder === 0) return [...childCents];

  const weights = weightsFor(childCents, strategy);
  const shares = allocate(remainder, weights);
  return childCents.map((value, i) => value + shares[i]);
}

/**
 * Give one child the whole remainder — the manual escape when neither weighting is what you
 * meant, and the only way to say "that fee belongs to this line".
 */
export function assignRemainderTo(
  parentCents: number,
  childCents: readonly number[],
  index: number,
): number[] {
  const remainder = splitRemainderCents(parentCents, childCents);
  if (index < 0 || index >= childCents.length) {
    throw new Error(`no child at index ${index}`);
  }
  return childCents.map((value, i) => (i === index ? value + remainder : value));
}

/**
 * Weight each child's claim on the remainder.
 *
 * Magnitudes, not signed amounts: a split of a refund runs negative throughout, and weighting
 * by the signed value would hand the largest share to whichever line was closest to zero.
 */
function weightsFor(
  childCents: readonly number[],
  strategy: DistributeStrategy,
): number[] {
  const eligible =
    strategy === "proportional"
      ? childCents.map((value) => Math.abs(value))
      : childCents.map((value) => (value === 0 ? 1 : 0));

  return eligible.some((weight) => weight > 0) ? eligible : childCents.map(() => 1);
}

/**
 * Largest-remainder allocation of `total` across `weights`, in integer cents.
 *
 * Each share is the exact proportion floored, then the cents left over by that flooring are
 * dealt out one apiece to the largest fractional parts — ties to the earlier child, so two
 * runs over the same split always agree. The sign is carried outside the arithmetic so that
 * flooring works on magnitudes: `Math.floor` on a negative rounds away from zero, which would
 * over-allocate and then claw back.
 */
function allocate(total: number, weights: readonly number[]): number[] {
  const sign = total < 0 ? -1 : 1;
  const magnitude = Math.abs(total);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  const products = weights.map((weight) => magnitude * weight);
  if (!products.every((product) => Number.isSafeInteger(product))) {
    throw new Error("split amounts are too large to allocate exactly");
  }

  const shares = products.map((product) => Math.floor(product / weightTotal));
  const fractions = products.map((product) => product % weightTotal);

  let leftover = magnitude - shares.reduce((sum, share) => sum + share, 0);
  const order = fractions
    .map((fraction, index) => ({ fraction, index }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of order) {
    if (leftover === 0) break;
    shares[index] += 1;
    leftover -= 1;
  }

  return shares.map((share) => share * sign);
}
