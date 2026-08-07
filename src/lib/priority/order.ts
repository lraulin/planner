import type { PriorityLetter } from "@/db/schema";

/**
 * The one ordering rule for ABCD priorities: **letter first, then rank, and a bare letter
 * comes after every ranked item of that letter.**
 *
 * A bare letter and a ranked one say different things. `A` means "active — I am working on
 * this"; `A1` means "and this is the one I am working on first" (user manual §2.7: a ranked
 * priority designates the main focus for the week). So `B1` reads as a sharper claim than a
 * plain `B` and belongs above it. Achieve shows the same order in its Remove Priority Gaps
 * example, where a letter's rows list as `A1, A2, A` — ranked, then bare.
 *
 * This is deliberately **not** `encodePriority` from `lib/achieve/encodings.ts`. That one
 * reproduces the int Achieve writes to disk, where a bare `B` is the band floor (2500) and
 * `B1` is 2501 — correct for the file format, wrong as a display order, and it was being
 * used for both. Sorting keys come from here; file bytes come from there.
 *
 * Blank priorities return `null`; every caller already sorts blanks last regardless of
 * direction, and filters treat `null` as "no comparable value".
 */

const LETTER_ORDER: readonly PriorityLetter[] = ["A", "B", "C", "D"];

/** Band width per letter. Same 2500 as the file format, so the numbers stay recognisable. */
const BAND = 2500;

/** The bare letter's slot: the last position inside its band. */
const BARE = BAND - 1;

/**
 * Position of a rank **within** its letter, bare last.
 *
 * Clamped into the band so a nonsense rank from imported data cannot leak into the next
 * letter and sort a `B` under the `C`s.
 */
export function rankOrderValue(rank: number | null | undefined): number {
  if (rank == null || rank <= 0) return BARE;
  return Math.min(rank, BARE - 1);
}

/** Sort key for one priority, or `null` when there is no letter. */
export function priorityOrderValue(
  letter: PriorityLetter | null | undefined,
  rank: number | null | undefined,
): number | null {
  if (letter == null) return null;
  const index = LETTER_ORDER.indexOf(letter);
  if (index < 0) return null;
  return index * BAND + rankOrderValue(rank);
}

/**
 * Compare two priorities directly, blanks last. `priorityOrderValue` is the key; this is the
 * comparator for the lists that sort in memory rather than handing a key to a grid.
 */
export function comparePriorityOrder(
  a: { letter: PriorityLetter | null; rank: number | null },
  b: { letter: PriorityLetter | null; rank: number | null },
): number {
  const left = priorityOrderValue(a.letter, a.rank);
  const right = priorityOrderValue(b.letter, b.rank);
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}
