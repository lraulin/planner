/**
 * Writes for the bank sync.
 *
 * Every mutation takes `userId` first and proves the row was theirs before touching it. An
 * update whose `where` matches nothing is indistinguishable from a successful no-op unless
 * you check, and that is exactly how a cross-user write slips through unnoticed.
 *
 * The one place this module knowingly diverges from `finances/mutations.ts`: it updates and
 * deletes transaction rows, which the CSV importer never does. That is the pending contract
 * (spec D5) and it is confined to rows carrying `external_source = 'api:simplefin'`, so no
 * statement-imported row can be reached from here.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  bankConnections,
  financeAccounts,
  financeTransactions,
} from "@/db/schema";
import { centsToNumericString, numericStringToCents } from "@/lib/finances/money";
import { captureFinanceMoneyCheckpoint } from "@/lib/finances/audit/checkpoints";
import type { FinanceAuditChange } from "@/lib/finances/audit/types";
import { writeFinanceAuditEvent } from "@/lib/finances/audit/writes";
import { monthKeyOf } from "@/lib/finances/budget/envelope";
import { shouldKeepScrapedBalance } from "./scrapeBalance";
import type { BankInsert, BankUpdate } from "./syncPlan";

async function requireConnection(userId: string, connectionId: string): Promise<void> {
  const [row] = await db
    .select({ id: bankConnections.id })
    .from(bankConnections)
    .where(
      and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)),
    )
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
 * Store a claimed access URL.
 *
 * A setup token can only be claimed once, so the claim and this write have to happen in the
 * same operation — losing the result means generating a new token at the provider.
 */
export async function saveConnection(
  userId: string,
  input: { accessUrl: string; label?: string },
): Promise<string> {
  const [row] = await db
    .insert(bankConnections)
    .values({ userId, accessUrl: input.accessUrl, label: input.label ?? "" })
    .returning({ id: bankConnections.id });
  return row.id;
}

/** Give a connection a display label. */
export async function renameConnection(
  userId: string,
  connectionId: string,
  label: string,
): Promise<void> {
  await requireConnection(userId, connectionId);
  await db
    .update(bankConnections)
    .set({ label, updatedAt: new Date() })
    .where(
      and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)),
    );
}

/** Replace the access URL on an existing connection, e.g. after re-claiming a fresh token. */
export async function replaceAccessUrl(
  userId: string,
  connectionId: string,
  accessUrl: string,
): Promise<void> {
  await requireConnection(userId, connectionId);
  await db
    .update(bankConnections)
    .set({ accessUrl, reauthRequiredAt: null, updatedAt: new Date() })
    .where(
      and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)),
    );
}

/**
 * Bind a provider account to a register account. Idempotent on re-link.
 *
 * Both ids are proven to belong to the user first: the connection because it is the parent,
 * and the account because a link is a write into the register's namespace.
 */
export async function linkAccount(
  userId: string,
  input: {
    connectionId: string;
    externalAccountId: string;
    accountId: string;
    institution?: string;
  },
): Promise<string> {
  await requireConnection(userId, input.connectionId);
  await requireAccount(userId, input.accountId);

  // There are *two* unique indexes on this table and `onConflictDoUpdate` can only name
  // one. It names `(user_id, external_account_id)`, so re-matching the same provider
  // account is an upsert — but pointing a *second* provider account at a register account
  // that already has one violates `(user_id, account_id)` and comes back as a raw driver
  // error. Checked here so it reads as the sentence it is.
  const [clash] = await db
    .select({ externalAccountId: bankAccountLinks.externalAccountId })
    .from(bankAccountLinks)
    .where(
      and(
        eq(bankAccountLinks.userId, userId),
        eq(bankAccountLinks.accountId, input.accountId),
      ),
    )
    .limit(1);
  if (clash && clash.externalAccountId !== input.externalAccountId) {
    throw new Error(
      "That register account is already matched to another bank account. Unmatch it first.",
    );
  }

  const [row] = await db
    .insert(bankAccountLinks)
    .values({
      userId,
      connectionId: input.connectionId,
      externalAccountId: input.externalAccountId,
      accountId: input.accountId,
      institution: input.institution ?? "",
    })
    .onConflictDoUpdate({
      target: [bankAccountLinks.userId, bankAccountLinks.externalAccountId],
      set: {
        connectionId: input.connectionId,
        accountId: input.accountId,
        institution: input.institution ?? "",
        updatedAt: new Date(),
      },
    })
    .returning({ id: bankAccountLinks.id });
  return row.id;
}

/** Drop a link. The register account and its rows stay; only the live feed stops. */
export async function unlinkAccount(userId: string, linkId: string): Promise<void> {
  const deleted = await db
    .delete(bankAccountLinks)
    .where(and(eq(bankAccountLinks.id, linkId), eq(bankAccountLinks.userId, userId)))
    .returning({ id: bankAccountLinks.id });
  if (deleted.length === 0) throw new Error("Link not found.");
}

/** Remove a connection. Cascades to its links; imported transactions are untouched. */
export async function deleteConnection(
  userId: string,
  connectionId: string,
): Promise<void> {
  const deleted = await db
    .delete(bankConnections)
    .where(
      and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)),
    )
    .returning({ id: bankConnections.id });
  if (deleted.length === 0) throw new Error("Bank connection not found.");
}

/** Flag a connection as needing re-setup, or clear the flag. */
export async function setReauthRequired(
  userId: string,
  connectionId: string,
  required: boolean,
): Promise<void> {
  await requireConnection(userId, connectionId);
  await db
    .update(bankConnections)
    .set({ reauthRequiredAt: required ? new Date() : null, updatedAt: new Date() })
    .where(
      and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, userId)),
    );
}

/** Balance snapshot for one link, already in module sign. */
export async function saveBalance(
  userId: string,
  input: {
    linkId: string;
    balanceCents: number | null;
    availableCents: number | null;
    asOf: Date;
    auditBatchId?: string;
    auditOrigin?: string;
  },
): Promise<{ auditEventId: string; auditBatchId: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: bankAccountLinks.id,
        accountId: bankAccountLinks.accountId,
        balanceCents: bankAccountLinks.balanceCents,
        availableCents: bankAccountLinks.availableCents,
        balanceAsOf: bankAccountLinks.balanceAsOf,
        scrapeBalanceAsOf: bankAccountLinks.scrapeBalanceAsOf,
        accountName: financeAccounts.name,
      })
      .from(bankAccountLinks)
      .innerJoin(
        financeAccounts,
        and(
          eq(financeAccounts.id, bankAccountLinks.accountId),
          eq(financeAccounts.userId, userId),
        ),
      )
      .where(
        and(eq(bankAccountLinks.id, input.linkId), eq(bankAccountLinks.userId, userId)),
      )
      .limit(1);
    if (!existing) throw new Error("Link not found.");

    const scope = {
      accountIds: [existing.accountId],
      accountNames: [existing.accountName],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const keepBrowser = shouldKeepScrapedBalance(existing, input, Date.now());
    if (!keepBrowser) {
      const updated = await tx
        .update(bankAccountLinks)
        .set({
          balanceCents: input.balanceCents,
          availableCents: input.availableCents,
          balanceAsOf: input.asOf,
          scrapeBalanceAsOf: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bankAccountLinks.id, input.linkId),
            eq(bankAccountLinks.userId, userId),
          ),
        )
        .returning({ id: bankAccountLinks.id });
      if (updated.length === 0) throw new Error("Link not found.");
    }
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const changes: FinanceAuditChange[] = keepBrowser
      ? []
      : [
          {
            entityType: "bank_balance",
            entityIdentity: existing.id,
            before: {
              balanceCents: existing.balanceCents,
              availableCents: existing.availableCents,
              balanceAsOf: existing.balanceAsOf?.toISOString() ?? null,
              browserAuthority: existing.scrapeBalanceAsOf !== null,
            },
            after: {
              balanceCents: input.balanceCents,
              availableCents: input.availableCents,
              balanceAsOf: input.asOf.toISOString(),
              browserAuthority: false,
            },
          },
        ];
    const audit = await writeFinanceAuditEvent(tx, userId, {
      kind: "simplefin_sync",
      origin: input.auditOrigin ?? "SimpleFIN balance",
      batchId: input.auditBatchId,
      summary: keepBrowser
        ? `Kept the fresher browser balance for ${existing.accountName}.`
        : `Updated the SimpleFIN balance for ${existing.accountName}.`,
      scope,
      warnings: keepBrowser
        ? [
            "A bank-page snapshot is still authoritative, so this older balance was not applied.",
          ]
        : [],
      sourceEvidence: {
        linkId: existing.id,
        providerBalanceAsOf: input.asOf.toISOString(),
      },
      beforeCheckpoint,
      afterCheckpoint,
      changes,
    });
    return { auditEventId: audit.eventId, auditBatchId: audit.batchId };
  });
}

export type ApplySyncResult = {
  inserted: number;
  updated: number;
  deleted: number;
  auditEventId: string;
  auditBatchId: string;
};

/**
 * Apply one connection's reconciliation and advance its window, in a single transaction.
 *
 * **`syncedThrough` moves in the same transaction as the rows, deliberately.** It only ever
 * goes forward, so a crash between writing rows and saving it would either replay a window
 * or skip one permanently, depending on the order. Inside one transaction there is no
 * between.
 */
export async function applySync(
  userId: string,
  input: {
    connectionId: string;
    inserts: readonly BankInsert[];
    updates: readonly BankUpdate[];
    deletes: readonly string[];
    syncedThrough: string;
    unmatchedAccountCount: number;
    providerErrors?: readonly string[];
    auditBatchId?: string;
    auditOrigin?: string;
  },
): Promise<ApplySyncResult> {
  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select({ id: bankConnections.id })
      .from(bankConnections)
      .where(
        and(
          eq(bankConnections.id, input.connectionId),
          eq(bankConnections.userId, userId),
        ),
      )
      .limit(1);
    if (!connection) throw new Error("Bank connection not found.");
    const externalIds = [
      ...new Set([...input.deletes, ...input.updates.map((row) => row.externalId)]),
    ];
    const beforeRows =
      externalIds.length === 0
        ? []
        : await tx
            .select({
              id: financeTransactions.id,
              accountId: financeTransactions.accountId,
              transactionDate: financeTransactions.transactionDate,
              postedDate: financeTransactions.postedDate,
              amount: financeTransactions.amount,
              pending: financeTransactions.pending,
              externalId: financeTransactions.externalId,
            })
            .from(financeTransactions)
            .where(
              and(
                eq(financeTransactions.userId, userId),
                eq(financeTransactions.externalSource, "api:simplefin"),
                inArray(financeTransactions.externalId, externalIds),
              ),
            );
    const beforeByExternal = new Map(
      beforeRows.flatMap((row) =>
        row.externalId ? [[row.externalId, row] as const] : [],
      ),
    );
    const accountIds = [
      ...new Set([
        ...beforeRows.map((row) => row.accountId),
        ...input.inserts.map((row) => row.accountId),
      ]),
    ];
    const accountNames =
      accountIds.length === 0
        ? []
        : await tx
            .select({ id: financeAccounts.id, name: financeAccounts.name })
            .from(financeAccounts)
            .where(
              and(
                eq(financeAccounts.userId, userId),
                inArray(financeAccounts.id, accountIds),
              ),
            );
    const budgetMonths = [
      ...new Set([
        ...beforeRows.map((row) => monthKeyOf(row.transactionDate)),
        ...input.inserts.map((row) => monthKeyOf(row.transaction.transactionDate)),
        ...input.updates.map((row) => monthKeyOf(row.transactionDate)),
      ]),
    ].sort();
    const scope = {
      accountIds,
      accountNames: accountNames.map((row) => row.name),
      budgetMonths,
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    let inserted = 0;
    let updated = 0;
    let deleted = 0;
    const changes: FinanceAuditChange[] = [];

    if (input.deletes.length > 0) {
      const rows = await tx
        .delete(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            // Scoped to this feed so reconciliation can never reach a statement row.
            eq(financeTransactions.externalSource, "api:simplefin"),
            inArray(financeTransactions.externalId, [...input.deletes]),
          ),
        )
        .returning({
          id: financeTransactions.id,
          externalId: financeTransactions.externalId,
        });
      deleted = rows.length;
      for (const row of rows) {
        const before = row.externalId
          ? beforeByExternal.get(row.externalId)
          : undefined;
        changes.push({
          entityType: "transaction",
          entityIdentity: row.id,
          before: before
            ? {
                accountId: before.accountId,
                transactionDate: before.transactionDate,
                postedDate: before.postedDate,
                amountCents: numericStringToCents(before.amount) ?? 0,
                pending: before.pending,
                externalSource: "api:simplefin",
                externalId: before.externalId,
              }
            : null,
          after: null,
        });
      }
    }

    for (const update of input.updates) {
      const rows = await tx
        .update(financeTransactions)
        .set({
          transactionDate: update.transactionDate,
          postedDate: update.postedDate,
          description: update.description,
          amount: centsToNumericString(update.amountCents),
          pending: update.pending,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.externalSource, "api:simplefin"),
            eq(financeTransactions.externalId, update.externalId),
          ),
        )
        .returning({ id: financeTransactions.id });
      updated += rows.length;
      const before = beforeByExternal.get(update.externalId);
      for (const row of rows) {
        changes.push({
          entityType: "transaction",
          entityIdentity: row.id,
          before: before
            ? {
                accountId: before.accountId,
                transactionDate: before.transactionDate,
                postedDate: before.postedDate,
                amountCents: numericStringToCents(before.amount) ?? 0,
                pending: before.pending,
                externalSource: "api:simplefin",
                externalId: before.externalId,
              }
            : null,
          after: {
            accountId: before?.accountId ?? null,
            transactionDate: update.transactionDate,
            postedDate: update.postedDate,
            amountCents: update.amountCents,
            pending: update.pending,
            externalSource: "api:simplefin",
            externalId: update.externalId,
          },
        });
      }
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
            externalSource: "api:simplefin" as const,
            externalId: insert.externalId,
          })),
        )
        // The partial unique index on (user_id, external_source, external_id) is the
        // arbiter, the same way it is for CSV import.
        .onConflictDoNothing()
        .returning({
          id: financeTransactions.id,
          accountId: financeTransactions.accountId,
          transactionDate: financeTransactions.transactionDate,
          postedDate: financeTransactions.postedDate,
          amount: financeTransactions.amount,
          pending: financeTransactions.pending,
          externalId: financeTransactions.externalId,
        });
      inserted = rows.length;
      changes.push(
        ...rows.map((row) => ({
          entityType: "transaction",
          entityIdentity: row.id,
          before: null,
          after: {
            accountId: row.accountId,
            transactionDate: row.transactionDate,
            postedDate: row.postedDate,
            amountCents: numericStringToCents(row.amount) ?? 0,
            pending: row.pending,
            externalSource: "api:simplefin",
            externalId: row.externalId,
          },
        })),
      );
    }

    const advanced = await tx
      .update(bankConnections)
      .set({
        syncedThrough: input.syncedThrough,
        lastSyncedAt: new Date(),
        // Recorded every sync so the count reflects the latest truth rather than whatever
        // the first one happened to see.
        unmatchedAccountCount: input.unmatchedAccountCount,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(bankConnections.id, input.connectionId),
          eq(bankConnections.userId, userId),
        ),
      )
      .returning({ id: bankConnections.id });
    if (advanced.length === 0) throw new Error("Bank connection not found.");

    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const audit = await writeFinanceAuditEvent(tx, userId, {
      kind: "simplefin_sync",
      origin: input.auditOrigin ?? "SimpleFIN",
      batchId: input.auditBatchId,
      summary: `SimpleFIN rows: ${inserted} inserted, ${updated} updated, ${deleted} deleted.`,
      scope,
      warnings: [
        ...(input.providerErrors ?? []),
        ...(input.unmatchedAccountCount > 0
          ? [
              `${input.unmatchedAccountCount} provider account${input.unmatchedAccountCount === 1 ? " is" : "s are"} not linked to a Planner account.`,
            ]
          : []),
      ],
      sourceEvidence: {
        connectionId: input.connectionId,
        syncedThrough: input.syncedThrough,
        unmatchedAccountCount: input.unmatchedAccountCount,
        providerErrors: [...(input.providerErrors ?? [])],
      },
      beforeCheckpoint,
      afterCheckpoint,
      changes,
    });

    return {
      inserted,
      updated,
      deleted,
      auditEventId: audit.eventId,
      auditBatchId: audit.batchId,
    };
  });
}
