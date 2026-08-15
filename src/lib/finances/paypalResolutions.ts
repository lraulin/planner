import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financePaymentResolutions } from "@/db/schema";
import { centsToNumericString } from "./money";
import type { PaypalEntry } from "./paypalStatement";

export const PAYPAL_RESOLUTION_SOURCE = "paypal";

/** Postgres caps bind parameters; these rows have a handful of columns each. */
const INSERT_CHUNK = 500;

/** Only the economic events. Funding legs would collide with unrelated same-size credits. */
function isNamedEvent(entry: PaypalEntry): boolean {
  return entry.kind === "payment" || entry.kind === "receipt";
}

export type PaypalResolutionCounts = { created: number; skipped: number };

/**
 * Insert-or-skip the statement entries that name a register row.
 *
 * Never updates. The counterparty is a fact PayPal wrote, and a later re-download of
 * the same PDF must not overwrite a correction someone typed. `external_id` is the
 * PayPal transaction id, so the unique index is the arbiter.
 */
export async function persistPaypalResolutions(
  userId: string,
  entries: readonly PaypalEntry[],
): Promise<PaypalResolutionCounts> {
  const incoming = entries.filter(isNamedEvent).map((entry) => ({
    userId,
    source: PAYPAL_RESOLUTION_SOURCE,
    externalId: entry.externalId,
    transactionDate: entry.date,
    amount: centsToNumericString(entry.amountCents),
    counterparty: entry.counterparty,
    direction: entry.amountCents > 0 ? "in" : "out",
  }));

  if (incoming.length === 0) return { created: 0, skipped: 0 };

  const existing = await db
    .select({ externalId: financePaymentResolutions.externalId })
    .from(financePaymentResolutions)
    .where(eq(financePaymentResolutions.userId, userId));
  const known = new Set(existing.map((row) => row.externalId));

  const fresh = incoming.filter((row) => !known.has(row.externalId));
  // Two files in one upload can list the same id (the duplicate Balance statement
  // is already dropped at parse time; this is the zip-vs-single-PDF case).
  const unique: typeof fresh = [];
  const seen = new Set<string>();
  for (const row of fresh) {
    if (seen.has(row.externalId)) continue;
    seen.add(row.externalId);
    unique.push(row);
  }

  let created = 0;
  for (let start = 0; start < unique.length; start += INSERT_CHUNK) {
    const chunk = unique.slice(start, start + INSERT_CHUNK);
    const inserted = await db
      .insert(financePaymentResolutions)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: financePaymentResolutions.id });
    created += inserted.length;
  }

  return { created, skipped: incoming.length - created };
}
