import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financePaymentResolutions } from "@/db/schema";
import { centsToNumericString } from "./money";
import type { PaypalEntry } from "./paypalStatement";
import type { FinanceExecutor } from "./dbExecutor";
import type { FinanceAuditChange } from "./audit/types";

export const PAYPAL_RESOLUTION_SOURCE = "paypal";

/** Postgres caps bind parameters; these rows have a handful of columns each. */
const INSERT_CHUNK = 500;

/** Only the economic events. Funding legs would collide with unrelated same-size credits. */
function isNamedEvent(entry: PaypalEntry): boolean {
  return entry.kind === "payment" || entry.kind === "receipt";
}

export type PaypalResolutionCounts = {
  created: number;
  skipped: number;
  changes: FinanceAuditChange[];
};

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
  executor: FinanceExecutor = db,
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

  if (incoming.length === 0) return { created: 0, skipped: 0, changes: [] };

  const existing = await executor
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
  const changes: FinanceAuditChange[] = [];
  for (let start = 0; start < unique.length; start += INSERT_CHUNK) {
    const chunk = unique.slice(start, start + INSERT_CHUNK);
    const inserted = await executor
      .insert(financePaymentResolutions)
      .values(chunk)
      .onConflictDoNothing()
      .returning({
        id: financePaymentResolutions.id,
        externalId: financePaymentResolutions.externalId,
        transactionDate: financePaymentResolutions.transactionDate,
        amount: financePaymentResolutions.amount,
        direction: financePaymentResolutions.direction,
      });
    created += inserted.length;
    changes.push(
      ...inserted.map((row) => ({
        entityType: "payment_resolution",
        entityIdentity: row.id,
        before: null,
        after: {
          externalId: row.externalId,
          transactionDate: row.transactionDate,
          amount: row.amount,
          direction: row.direction,
        },
      })),
    );
  }

  return { created, skipped: incoming.length - created, changes };
}
