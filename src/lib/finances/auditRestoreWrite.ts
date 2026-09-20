import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeAuditChanges,
  financeAuditEvents,
  financeBudgetCategories,
  financePayees,
  financeTransactions,
} from "@/db/schema";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import { writeFinanceAuditEvent } from "./audit/writes";
import { restorableHold } from "./auditRestore";
import { monthKeyOf } from "./budget/envelope";
import { resolveLostHold } from "./feedPairing";
import { centsToNumericString, numericStringToCents } from "./money";

/**
 * Put back a pending hold an ingestion deleted, from the audit record of its deletion
 * (`agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/` D4).
 *
 * Restores under the original id, envelope, notes and flow, and writes its own audit event.
 * Refuses — with a reason the caller shows — when the row is already back, when the account
 * is gone, or when a posted row that could be its successor has arrived since: bringing the
 * hold back beside its own posting is the duplicate this exists to avoid. Every read and
 * write is scoped by `userId`; another user's audit record is simply not found.
 */
export async function restoreDeletedHold(
  userId: string,
  transactionId: string,
): Promise<{ eventId: string }> {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        entityType: financeAuditChanges.entityType,
        before: financeAuditChanges.beforeFields,
        after: financeAuditChanges.afterFields,
        evidence: financeAuditEvents.sourceEvidence,
      })
      .from(financeAuditChanges)
      .innerJoin(
        financeAuditEvents,
        eq(financeAuditEvents.id, financeAuditChanges.eventId),
      )
      .where(
        and(
          eq(financeAuditChanges.userId, userId),
          eq(financeAuditEvents.userId, userId),
          eq(financeAuditChanges.entityType, "transaction"),
          eq(financeAuditChanges.entityIdentity, transactionId),
          isNotNull(financeAuditChanges.beforeFields),
          isNull(financeAuditChanges.afterFields),
        ),
      )
      .orderBy(desc(financeAuditEvents.occurredAt))
      .limit(1);
    if (!record) throw new Error("No deletion of that transaction was recorded.");

    const verdict = restorableHold(record, record.evidence);
    if (!verdict.ok) throw new Error(verdict.reason);
    const { hold } = verdict;

    const [account] = await tx
      .select({ id: financeAccounts.id })
      .from(financeAccounts)
      .where(
        and(eq(financeAccounts.id, hold.accountId), eq(financeAccounts.userId, userId)),
      )
      .limit(1);
    if (!account) throw new Error("The account that held it no longer exists.");

    const [present] = await tx
      .select({ id: financeTransactions.id })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.id, transactionId),
          eq(financeTransactions.userId, userId),
        ),
      )
      .limit(1);
    if (present) throw new Error("That transaction is already back.");

    const accountRows = await tx
      .select({
        id: financeTransactions.id,
        transactionDate: financeTransactions.transactionDate,
        postedDate: financeTransactions.postedDate,
        amount: financeTransactions.amount,
        description: financeTransactions.description,
        pending: financeTransactions.pending,
        externalSource: financeTransactions.externalSource,
        externalId: financeTransactions.externalId,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.accountId, hold.accountId),
        ),
      );
    if (
      hold.externalId !== null &&
      accountRows.some(
        (row) =>
          row.externalSource === hold.externalSource &&
          row.externalId === hold.externalId,
      )
    ) {
      throw new Error("The bank page has already brought this hold back.");
    }
    const successor = resolveLostHold(
      { id: transactionId, ...hold, amountCents: hold.amountCents },
      accountRows
        .filter((row) => !row.pending)
        .map((row) => ({
          id: row.id,
          transactionDate: row.transactionDate,
          postedDate: row.postedDate,
          amountCents: numericStringToCents(row.amount) ?? 0,
          description: row.description,
        })),
    );
    if (successor.outcome !== "none") {
      throw new Error(
        "A posted transaction that looks like this hold's successor has arrived since. Restoring it would count the charge twice.",
      );
    }

    // A category or payee deleted since is dropped rather than left dangling.
    const [category] = hold.budgetCategoryId
      ? await tx
          .select({ id: financeBudgetCategories.id })
          .from(financeBudgetCategories)
          .where(
            and(
              eq(financeBudgetCategories.id, hold.budgetCategoryId),
              eq(financeBudgetCategories.userId, userId),
            ),
          )
          .limit(1)
      : [];
    const [payee] = hold.payeeId
      ? await tx
          .select({ id: financePayees.id })
          .from(financePayees)
          .where(
            and(eq(financePayees.id, hold.payeeId), eq(financePayees.userId, userId)),
          )
          .limit(1)
      : [];

    const scope = {
      accountIds: [hold.accountId],
      budgetMonths: [monthKeyOf(hold.transactionDate)],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await tx.insert(financeTransactions).values({
      id: transactionId,
      userId,
      accountId: hold.accountId,
      transactionDate: hold.transactionDate,
      postedDate: hold.postedDate,
      pending: true,
      description: hold.description,
      amount: centsToNumericString(hold.amountCents),
      sourceCategory: hold.sourceCategory,
      notes: hold.notes,
      derivedFlow: hold.derivedFlow,
      flowOverride: hold.flowOverride,
      transferGroupId: hold.transferGroupId,
      budgetCategoryId: category?.id ?? null,
      payeeId: payee?.id ?? null,
      externalSource: hold.externalSource,
      externalId: hold.externalId,
    });
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const audit = await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_change",
      origin: "Activity restore",
      summary: `Restored pending hold "${hold.description}".`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        {
          entityType: "transaction",
          entityIdentity: transactionId,
          before: null,
          after: {
            accountId: hold.accountId,
            transactionDate: hold.transactionDate,
            pending: true,
            description: hold.description,
            amountCents: hold.amountCents,
            budgetCategoryId: category?.id ?? null,
          },
        },
      ],
    });
    return { eventId: audit.eventId };
  });
}
