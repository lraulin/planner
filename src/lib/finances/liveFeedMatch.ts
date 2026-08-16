/**
 * Recognising that a live-feed row and a bank-statement row are the same event.
 *
 * Deliberately **not** `matchExisting.ts`. That module compares two file exports of the
 * same transaction, which broadly agree; loosening it would loosen CSV-to-CSV dedup too,
 * and that works. This one exists because a live feed and a bank statement disagree in two
 * specific ways, both measured against real accounts rather than imagined:
 *
 * **Dates are off by a day or two.** The aggregator reports when the merchant authorised
 * the charge; the statement records the bank's own transaction date. For one Chase card
 * over three months, 176 of 217 rows differed by exactly one day with byte-identical
 * descriptions. An exact-date rule matched none of them.
 *
 * **Descriptions get wrapped.** The Capital One 360 export writes
 * `Withdrawal from RENT:RAULIN RENT:RAULI` where the feed says `RENT:RAULIN`. The shared
 * matcher requires one string to be a *prefix* of the other, and here the feed's text sits
 * in the middle.
 *
 * The direction of error matters and is chosen deliberately. A missed match inserts a
 * duplicate: visible in the register, and deletable. An over-eager match drops a real
 * transaction: invisible, and `fingerprint.ts` already names that as the worse outcome. So
 * every rule below requires an **exact amount** and a substantial description overlap; only
 * the date is allowed to be approximate.
 *
 * Used in **both** directions. A sync compares what the provider sent against rows the
 * statements already wrote; an import compares statement rows against what the sync already
 * wrote. The second is the one that bites later — a statement imported weeks after the sync
 * covers days the sync already has.
 */

import { descriptionsMatch } from "./matchExisting";

/** How far apart two records of one event may be dated. */
export const DATE_TOLERANCE_DAYS = 2;

/**
 * Shortest description that may be matched by containment.
 *
 * Without a floor, a feed description of `PAYPAL` would match every statement row
 * mentioning PayPal at the same amount. Eleven characters is comfortably longer than the
 * bare processor stamps (`PAYPAL`, `SQ *`, `TST*`) and shorter than every real counterparty
 * observed in the data this was measured against.
 */
const MIN_CONTAINMENT_LENGTH = 11;

function fold(description: string): string {
  return description.replace(/\s+/g, " ").trim().toUpperCase();
}

function daysApart(a: string, b: string): number {
  return (
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
  );
}

/**
 * Do these two descriptions name the same counterparty?
 *
 * Equality first, then containment either way round — the wrapper can be on either side,
 * since a statement may pad what the feed reports or the reverse.
 */
export function descriptionsOverlap(a: string, b: string): boolean {
  const left = fold(a);
  const right = fold(b);
  if (left === right) return true;
  if (left === "" || right === "") return false;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < MIN_CONTAINMENT_LENGTH) return false;
  return longer.includes(shorter);
}

export type ComparableRow = {
  transactionDate: string;
  amountCents: number;
  description: string;
};

function sameEvent(existing: ComparableRow, incoming: ComparableRow): boolean {
  return (
    existing.amountCents === incoming.amountCents &&
    daysApart(existing.transactionDate, incoming.transactionDate) <=
      DATE_TOLERANCE_DAYS &&
    descriptionsOverlap(existing.description, incoming.description)
  );
}

/**
 * Which incoming rows are not already present, occurrence-counted.
 *
 * The counting is what keeps two identical charges on one day from collapsing into one —
 * the case `fingerprint.ts` was written for. Each existing row can absorb at most one
 * incoming row, so a second identical charge still imports when only one is on file.
 *
 * Nearest date wins when several existing rows could absorb the same incoming row, so a
 * recurring charge pairs with its own occurrence rather than the first one scanned.
 */
export function selectUnmatched<T extends ComparableRow>(
  existing: readonly ComparableRow[],
  incoming: readonly T[],
): { keep: T[]; matchedCount: number } {
  const used = new Array<boolean>(existing.length).fill(false);
  const keep: T[] = [];
  let matchedCount = 0;

  for (const row of incoming) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < existing.length; i++) {
      if (used[i] || !sameEvent(existing[i], row)) continue;
      const distance = daysApart(existing[i].transactionDate, row.transactionDate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      used[bestIndex] = true;
      matchedCount++;
    } else {
      keep.push(row);
    }
  }

  return { keep, matchedCount };
}

/** An existing register row, tagged with which comparison applies to it. */
export type TaggedRow = ComparableRow & {
  /** True for rows a live feed wrote, which are the ones dated approximately. */
  fromLiveFeed: boolean;
};

/** Strict comparison: what `matchExisting` does, for rows that came from a file. */
function sameFileEvent(existing: ComparableRow, incoming: ComparableRow): boolean {
  return (
    existing.transactionDate === incoming.transactionDate &&
    existing.amountCents === incoming.amountCents &&
    descriptionsMatch(existing.description, incoming.description)
  );
}

/**
 * Which incoming rows are new, against a register holding rows from both kinds of source.
 *
 * This is the importer's entry point once a live feed exists. A statement row is compared
 * strictly against other statement rows — unchanged behaviour, and the reason CSV-to-CSV
 * dedup keeps working — but **tolerantly against rows the feed wrote**, because those carry
 * the aggregator's date rather than the bank's and will not line up exactly.
 *
 * Occurrence-counted, so two identical charges on one day still both import when only one is
 * on file.
 */
export function selectNewAgainstMixed<T extends ComparableRow>(
  existing: readonly TaggedRow[],
  incoming: readonly T[],
): { keep: T[]; skipCount: number } {
  const used = new Array<boolean>(existing.length).fill(false);
  const keep: T[] = [];

  for (const row of incoming) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < existing.length; i++) {
      if (used[i]) continue;
      const candidate = existing[i];
      const matches = candidate.fromLiveFeed
        ? sameEvent(candidate, row)
        : sameFileEvent(candidate, row);
      if (!matches) continue;
      const distance = daysApart(candidate.transactionDate, row.transactionDate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) used[bestIndex] = true;
    else keep.push(row);
  }

  return { keep, skipCount: incoming.length - keep.length };
}
