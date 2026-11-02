/**
 * A repeatable random source for generated-case tests: the same `seed` gives the same
 * sequence on every run, so a failing case can be replayed. A plain LCG — enough to spread
 * cases, not for anything that needs real randomness.
 */
export function seededRandom(seed: number) {
  let state = seed;
  const random = () =>
    (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  /** A whole number in [low, high], both ends included. */
  const between = (low: number, high: number) =>
    low + Math.floor(random() * (high - low + 1));
  return { random, between };
}
