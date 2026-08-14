import type { ParsedTransaction } from "./types";

/**
 * Cross-source identity for "is this the same economic event we already stored?"
 *
 * The fingerprint unique index includes `postedDate`. Chase statements have none and the
 * CSV does, so the index will not recognise overlap. Date + signed amount + description
 * (after the Chase / Capital One normalizer has run) is what both feeds share.
 * Occurrence-counted so two identical $6.59 rows on one day still both import when
 * neither exists yet.
 */

function foldDescription(description: string): string {
  return description.replace(/\s+/g, " ").trim().toUpperCase();
}

export function matchKey(transaction: {
  transactionDate: string;
  amountCents: number;
  description: string;
}): string {
  // Case and interior spaces are not identity — the Capital One CSV writes
  // "WL *Steam Purchase" and "WL *STEAM PURCHASE", and "AGENT FEE   890…".
  // Date + cents still have to agree; Disney Plus and Kindle can share both.
  return JSON.stringify([
    transaction.transactionDate,
    transaction.amountCents,
    foldDescription(transaction.description),
  ]);
}

/**
 * Same merchant after folding, or one is the other plus a leftover location / domain
 * the statement normalizer failed to peel (`CURSOR, AI POWERED IDE` vs
 * `CURSOR, AI POWERED IDECURSOR.COM`). Not a prefix of a different token
 * (`AMAZON MKTPL*0W88` vs `AMAZON MKTPL*HJ06`).
 */
export function descriptionsMatch(a: string, b: string): boolean {
  const left = foldDescription(a);
  const right = foldDescription(b);
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length === 0 || !longer.startsWith(shorter)) return false;
  const rest = longer.slice(shorter.length);
  if (rest.startsWith("*")) return false;
  if (/^[A-Z]{2}$/.test(rest)) return true;
  if (/^\S*\.[A-Z]{2,}/i.test(rest)) return true;
  if (/^\d+$/.test(rest) || /^\d{7,}[A-Z]{0,2}$/.test(rest)) return true;
  if (/^[A-Za-z]/.test(rest) && !/\d/.test(rest)) return true;
  if (/^\s+[A-Z][A-Z\s.'-]*$/i.test(rest) && !/\d/.test(rest)) return true;
  // Single leftover token: " P", a PayPal id, or a truncated Amazon order id.
  // Require a long stem so a bare "UNITED" does not swallow "UNITED 016…".
  return /^\s+\S+$/.test(rest) && shorter.length >= 10;
}

function sameEvent(
  existing: {
    transactionDate: string;
    amountCents: number;
    description: string;
  },
  incoming: ParsedTransaction,
): boolean {
  return (
    existing.transactionDate === incoming.transactionDate &&
    existing.amountCents === incoming.amountCents &&
    descriptionsMatch(existing.description, incoming.description)
  );
}

export function selectNewTransactions(
  existing: readonly {
    transactionDate: string;
    amountCents: number;
    description: string;
  }[],
  incoming: readonly ParsedTransaction[],
): { keep: ParsedTransaction[]; skipCount: number } {
  const unused = existing.map((row) => ({ row, used: false }));
  const keep: ParsedTransaction[] = [];
  for (const transaction of incoming) {
    const match = unused.find((slot) => !slot.used && sameEvent(slot.row, transaction));
    if (match) {
      match.used = true;
      continue;
    }
    keep.push(transaction);
  }
  return { keep, skipCount: incoming.length - keep.length };
}
