/**
 * Writes for the bank sync.
 *
 * Every mutation takes `userId` first and proves the row was theirs before touching it. An
 * update whose `where` matches nothing is indistinguishable from a successful no-op unless
 * you check, and that is exactly how a cross-user write slips through unnoticed.
 *
 * The one place this module knowingly diverges from `finances/mutations.ts`: it updates and
 * deletes transaction rows, which the CSV importer never does. That is the pending-row
 * contract (spec D5) and it is confined to rows carrying `external_source = 'api:plaid'`,
 * so no statement-imported row can be reached from here.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeTransactions,
  plaidAccountLinks,
  plaidItems,
} from "@/db/schema";
import { centsToNumericString } from "@/lib/finances/money";
import type { PlaidInsert, PlaidUpdate } from "./syncPlan";

async function requireItem(userId: string, itemRowId: string): Promise<void> {
  const [row] = await db
    .select({ id: plaidItems.id })
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemRowId), eq(plaidItems.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Bank connection not found.");
}

async function requireAccount(userId: string, accountId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Account not found.");
}

/**
 * Store a freshly exchanged Item, or refresh the token on one we already have.
 *
 * Re-linking the same institution through Link's update mode returns the same `item_id`,
 * so the conflict path is the normal re-authentication case, not an error. It clears
 * `reauthRequiredAt` because a new token is exactly what that flag was asking for.
 */
export async function saveItem(
  userId: string,
  input: {
    itemId: string;
    accessToken: string;
    institutionId?: string;
    institutionName?: string;
  },
): Promise<string> {
  const [row] = await db
    .insert(plaidItems)
    .values({
      userId,
      itemId: input.itemId,
      accessToken: input.accessToken,
      institutionId: input.institutionId ?? "",
      institutionName: input.institutionName ?? "",
    })
    .onConflictDoUpdate({
      target: [plaidItems.userId, plaidItems.itemId],
      set: {
        accessToken: input.accessToken,
        reauthRequiredAt: null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: plaidItems.id });
  return row.id;
}

/**
 * Bind a Plaid account to a register account. Idempotent on re-link.
 *
 * Both ids are proven to belong to the user first: `itemRowId` because it is the parent, and
 * `accountId` because a link is a write into the register's namespace.
 */
export async function linkAccount(
  userId: string,
  input: {
    itemRowId: string;
    plaidAccountId: string;
    accountId: string;
    plaidType?: string;
    plaidSubtype?: string;
  },
): Promise<string> {
  await requireItem(userId, input.itemRowId);
  await requireAccount(userId, input.accountId);

  const [row] = await db
    .insert(plaidAccountLinks)
    .values({
      userId,
      itemId: input.itemRowId,
      plaidAccountId: input.plaidAccountId,
      accountId: input.accountId,
      plaidType: input.plaidType ?? "",
      plaidSubtype: input.plaidSubtype ?? "",
    })
    .onConflictDoUpdate({
      target: [plaidAccountLinks.userId, plaidAccountLinks.plaidAccountId],
      set: {
        itemId: input.itemRowId,
        accountId: input.accountId,
        plaidType: input.plaidType ?? "",
        plaidSubtype: input.plaidSubtype ?? "",
        updatedAt: new Date(),
      },
    })
    .returning({ id: plaidAccountLinks.id });
  return row.id;
}

/** Drop a link. The register account and its rows stay; only the live feed stops. */
export async function unlinkAccount(userId: string, linkId: string): Promise<void> {
  const deleted = await db
    .delete(plaidAccountLinks)
    .where(and(eq(plaidAccountLinks.id, linkId), eq(plaidAccountLinks.userId, userId)))
    .returning({ id: plaidAccountLinks.id });
  if (deleted.length === 0) throw new Error("Link not found.");
}

/**
 * Remove a connection. Cascades to its links; imported transactions are untouched.
 *
 * Note this does not call Plaid's `/item/remove`. On the Trial plan removing an Item does
 * not free its slot against the cap of 10, so the call spends nothing and gains nothing —
 * and forgetting the token locally is what the user actually asked for.
 */
export async function deleteItem(userId: string, itemRowId: string): Promise<void> {
  const deleted = await db
    .delete(plaidItems)
    .where(and(eq(plaidItems.id, itemRowId), eq(plaidItems.userId, userId)))
    .returning({ id: plaidItems.id });
  if (deleted.length === 0) throw new Error("Bank connection not found.");
}

/** Flag a connection as needing re-authentication, or clear the flag. */
export async function setReauthRequired(
  userId: string,
  itemRowId: string,
  required: boolean,
): Promise<void> {
  await requireItem(userId, itemRowId);
  await db
    .update(plaidItems)
    .set({ reauthRequiredAt: required ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(plaidItems.id, itemRowId), eq(plaidItems.userId, userId)));
}

/** Live balance snapshot for one link, already in module sign. */
export async function saveBalance(
  userId: string,
  input: {
    linkId: string;
    balanceCents: number | null;
    availableCents: number | null;
    asOf: Date;
  },
): Promise<void> {
  const updated = await db
    .update(plaidAccountLinks)
    .set({
      balanceCents: input.balanceCents,
      availableCents: input.availableCents,
      balanceAsOf: input.asOf,
      updatedAt: new Date(),
    })
    .where(
      and(eq(plaidAccountLinks.id, input.linkId), eq(plaidAccountLinks.userId, userId)),
    )
    .returning({ id: plaidAccountLinks.id });
  if (updated.length === 0) throw new Error("Link not found.");
}

export type ApplySyncResult = {
  inserted: number;
  updated: number;
  deleted: number;
};

/**
 * Apply one Item's deltas and advance its cursor, in a single transaction.
 *
 * **The cursor moves in the same transaction as the rows, deliberately.** It only ever goes
 * forward, so a crash between writing rows and saving the cursor would either replay a page
 * or skip one permanently, depending on the order. Inside one transaction there is no
 * between.
 */
export async function applySync(
  userId: string,
  input: {
    itemRowId: string;
    inserts: readonly PlaidInsert[];
    updates: readonly PlaidUpdate[];
    deletes: readonly string[];
    cursor: string;
  },
): Promise<ApplySyncResult> {
  await requireItem(userId, input.itemRowId);

  return db.transaction(async (tx) => {
    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    if (input.deletes.length > 0) {
      const rows = await tx
        .delete(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            // Scoped to the Plaid feed so a delta can never reach a statement-imported row.
            eq(financeTransactions.externalSource, "api:plaid"),
            inArray(financeTransactions.externalId, [...input.deletes]),
          ),
        )
        .returning({ id: financeTransactions.id });
      deleted = rows.length;
    }

    for (const update of input.updates) {
      const rows = await tx
        .update(financeTransactions)
        .set({
          transactionDate: update.transactionDate,
          postedDate: update.postedDate,
          description: update.description,
          amount: centsToNumericString(update.amountCents),
          sourceCategory: update.sourceCategory,
          pending: update.pending,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.externalSource, "api:plaid"),
            eq(financeTransactions.externalId, update.externalId),
          ),
        )
        .returning({ id: financeTransactions.id });
      updated += rows.length;
    }

    if (input.inserts.length > 0) {
      const rows = await tx
        .insert(financeTransactions)
        .values(
          input.inserts.map((insert) => ({
            userId,
            accountId: insert.accountId,
            transactionDate: insert.transaction.transactionDate,
            postedDate: insert.transaction.postedDate,
            description: insert.transaction.description,
            amount: centsToNumericString(insert.transaction.amountCents),
            sourceCategory: insert.transaction.sourceCategory,
            notes: insert.transaction.memo,
            pending: insert.pending,
            externalSource: "api:plaid" as const,
            externalId: insert.externalId,
          })),
        )
        // The partial unique index on (user_id, external_source, external_id) is the
        // arbiter, the same way it is for CSV import.
        .onConflictDoNothing()
        .returning({ id: financeTransactions.id });
      inserted = rows.length;
    }

    await tx
      .update(plaidItems)
      .set({
        syncCursor: input.cursor,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(plaidItems.id, input.itemRowId), eq(plaidItems.userId, userId)));

    return { inserted, updated, deleted };
  });
}
