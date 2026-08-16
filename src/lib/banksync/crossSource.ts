/**
 * Recognising that a synced row and a statement row are the same event.
 *
 * Deliberately **not** `matchExisting.ts`. That module is the CSV importer's, tuned to
 * exports of the same transaction by two banks that broadly agree; loosening it would
 * loosen CSV-to-CSV dedup too, which currently works. This one exists because a live feed
 * and a bank statement disagree in two specific ways that were measured against real data,
 * not imagined:
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
 */

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

export type SyncWindow = {
  /** Earliest day to ask the provider for. */
  fetchFrom: string;
  /** Earliest existing register row to compare against. */
  compareFrom: string;
  /** Latest existing register row to compare against. */
  compareTo: string;
};

const shiftDay = (key: string, days: number): string => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Which days to fetch, and which existing rows to weigh them against.
 *
 * Pure because the relationship between the three dates is the part that was wrong once and
 * is invisible when it is: **`compareFrom` must reach back past `fetchFrom`** by at least
 * the matcher's date tolerance. A statement dated two days before the window still records
 * the same event as a feed row inside it, and loading existing rows from `fetchFrom` hides
 * exactly those — which duplicates every transaction sitting on the boundary. That produced
 * three duplicates on the first real run and would have produced a few more every sync.
 *
 * `anchor` is where the last sync finished, or failing that the newest row the register
 * already holds; `maxInitialDays` caps how far a first sync reaches back.
 */
export function syncWindow(
  anchor: string | null,
  today: string,
  overlapDays: number,
  maxInitialDays: number,
): SyncWindow {
  const floor = shiftDay(today, -maxInitialDays);
  const proposed = anchor ? shiftDay(anchor, -overlapDays) : floor;
  const fetchFrom = proposed > floor ? proposed : floor;

  return {
    fetchFrom,
    compareFrom: shiftDay(fetchFrom, -DATE_TOLERANCE_DAYS),
    compareTo: shiftDay(today, DATE_TOLERANCE_DAYS),
  };
}
