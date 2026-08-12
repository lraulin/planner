import type { ParsedTransaction } from "./types";

/**
 * Cross-source identity for "is this the same economic event we already stored?"
 *
 * The fingerprint unique index includes `postedDate`. Chase statements have none and the
 * CSV does, so the index will not recognise overlap. Date + signed amount + description
 * (after the Chase normalizer has run) is what both feeds share. Occurrence-counted so
 * two identical $6.59 rows on one day still both import when neither exists yet.
 */

export function matchKey(transaction: {
  transactionDate: string;
  amountCents: number;
  description: string;
}): string {
  return JSON.stringify([
    transaction.transactionDate,
    transaction.amountCents,
    transaction.description,
  ]);
}

export function selectNewTransactions(
  existing: readonly {
    transactionDate: string;
    amountCents: number;
    description: string;
  }[],
  incoming: readonly ParsedTransaction[],
): { keep: ParsedTransaction[]; skipCount: number } {
  const existingCounts = new Map<string, number>();
  for (const row of existing) {
    const key = matchKey(row);
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const keep: ParsedTransaction[] = [];
  for (const transaction of incoming) {
    const key = matchKey(transaction);
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    if (ordinal < (existingCounts.get(key) ?? 0)) continue;
    keep.push(transaction);
  }
  return { keep, skipCount: incoming.length - keep.length };
}
