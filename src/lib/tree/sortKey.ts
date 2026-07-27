/**
 * Fractional indexing for sibling order.
 *
 * A node's position among its siblings is a string, ordered lexicographically. Inserting
 * between two rows generates a key strictly between theirs, so a move rewrites one row
 * instead of renumbering every sibling after it.
 *
 * Keys are read as base-62 fractions with an implicit leading "0." — the alphabet is
 * ordered so that lexicographic string comparison matches numeric comparison. Keys never
 * end in "0", which guarantees a strictly-between key always exists.
 */

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function assertValid(key: string, label: string): void {
  if (key === "") return;
  for (const char of key) {
    if (!BASE62.includes(char)) {
      throw new Error(`${label} contains a character outside the key alphabet: ${key}`);
    }
  }
  if (key.endsWith("0")) {
    throw new Error(`${label} must not end with "0": ${key}`);
  }
}

/**
 * Returns a key strictly between `a` and `b`.
 *
 * `a` is `""` to mean "before everything"; `b` is `null` to mean "after everything".
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`Cannot find a key between ${a || '""'} and ${b}: out of order`);
  }

  if (b !== null) {
    // Keep any shared prefix and recurse on the remainder.
    let shared = 0;
    while ((a[shared] ?? "0") === b[shared]) {
      shared++;
    }
    if (shared > 0) {
      return b.slice(0, shared) + midpoint(a.slice(shared), b.slice(shared));
    }
  }

  const digitA = a === "" ? 0 : BASE62.indexOf(a[0]);
  const digitB = b === null ? BASE62.length : BASE62.indexOf(b[0]);

  if (digitB - digitA > 1) {
    // Room between the leading digits — take the one in the middle.
    return BASE62[Math.round((digitA + digitB) / 2)];
  }

  if (b !== null && b.length > 1) {
    // Leading digits are adjacent, but `b` has more to it, so `b`'s first digit alone
    // already sits below `b` and above `a`.
    return b.slice(0, 1);
  }

  // No room at this digit — keep `a`'s digit and subdivide one place further down.
  return BASE62[digitA] + midpoint(a.slice(1), null);
}

/** A key for the first node in an empty list. */
export function first(): string {
  return midpoint("", null);
}

/** A key ordering before `next`. */
export function before(next: string): string {
  assertValid(next, "next key");
  return midpoint("", next);
}

/** A key ordering after `prev`. */
export function after(prev: string): string {
  assertValid(prev, "previous key");
  return midpoint(prev, null);
}

/**
 * A key ordering between `prev` and `next`. Pass `null` for either bound to mean the start
 * or end of the list, which makes this usable for every insert position.
 */
export function between(prev: string | null, next: string | null): string {
  if (prev === null && next === null) return first();
  if (prev === null) return before(next!);
  if (next === null) return after(prev);

  assertValid(prev, "previous key");
  assertValid(next, "next key");
  return midpoint(prev, next);
}

/** Generates `count` keys in ascending order, for seeding or bulk insert. */
export function sequence(count: number): string[] {
  const keys: string[] = [];
  let previous: string | null = null;
  for (let i = 0; i < count; i++) {
    previous = between(previous, null);
    keys.push(previous);
  }
  return keys;
}
