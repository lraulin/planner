import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financePayees, financeTransactions } from "@/db/schema";
import { requireOwnedRow } from "@/lib/db/owned";
import { effectiveFlow } from "../analytics";
import {
  categoryAssignableIds,
  partitionCategoryTargets,
} from "../categoryEligibility";
import { numericStringToCents } from "../money";
import { learnFromCategoryEdit } from "../payees/learn";
import { moneyRows } from "../splitRows";
import { monthKeyOf } from "./envelope";
import { requireCategory } from "./structureRows";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import { writeFinanceAuditEvent } from "../audit/writes";

/**
 * Filing transactions into envelopes. Every write takes `userId` first and scopes on it, so a
 * guessed transaction id belonging to someone else is simply not loaded
 * (`agent-os/standards/development/security.md`).
 */

async function learnCategoryForPayee(
  userId: string,
  editedId: string,
  payeeId: string,
): Promise<string | void> {
  await learnFromCategoryEdit(userId, payeeId, editedId);
}

export type BulkCategoryResult = {
  updated: string[];
  skipped: { id: string; reason: string }[];
};

const CATEGORY_ROW_COLUMNS = {
  id: financeTransactions.id,
  accountId: financeTransactions.accountId,
  accountOffBudget: financeAccounts.offBudget,
  transactionDate: financeTransactions.transactionDate,
  transferGroupId: financeTransactions.transferGroupId,
  derivedFlow: financeTransactions.derivedFlow,
  flowOverride: financeTransactions.flowOverride,
  amount: financeTransactions.amount,
  payeeId: financeTransactions.payeeId,
  budgetCategoryId: financeTransactions.budgetCategoryId,
  isParent: financeTransactions.isParent,
} as const;

/** Put many transactions in a Category, skipping ineligible rows. */
export async function setTransactionBudgetCategories(
  userId: string,
  transactionIds: readonly string[],
  categoryId: string | null,
  options: { auditOrigin?: string } = {},
): Promise<BulkCategoryResult> {
  const unique = [...new Set(transactionIds)];
  if (unique.length === 0) return { updated: [], skipped: [] };
  if (categoryId !== null) await requireCategory(userId, categoryId);

  const rows = await db
    .select(CATEGORY_ROW_COLUMNS)
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.id, unique),
      ),
    );

  const groupIds = [
    ...new Set(
      rows.flatMap((row) => (row.transferGroupId ? [row.transferGroupId] : [])),
    ),
  ];
  const mates =
    groupIds.length === 0
      ? []
      : await db
          .select(CATEGORY_ROW_COLUMNS)
          .from(financeTransactions)
          .innerJoin(
            financeAccounts,
            eq(financeAccounts.id, financeTransactions.accountId),
          )
          .where(
            and(
              eq(financeTransactions.userId, userId),
              inArray(financeTransactions.transferGroupId, groupIds),
            ),
          );

  const byId = new Map<string, (typeof rows)[number]>();
  for (const row of [...mates, ...rows]) byId.set(row.id, row);
  const assignmentRows = [...byId.values()];
  const assignableSet = categoryAssignableIds(
    assignmentRows.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      transactionDate: entry.transactionDate,
      transferGroupId: entry.transferGroupId,
      effectiveFlow: effectiveFlow({
        derivedFlow: entry.derivedFlow,
        flowOverride: entry.flowOverride,
        amountCents: numericStringToCents(entry.amount) ?? 0,
      }),
    })),
    new Set(
      assignmentRows.flatMap((entry) =>
        entry.accountOffBudget ? [entry.accountId] : [],
      ),
    ),
  );

  const loadedIds = new Set(rows.map((row) => row.id));
  const { assignable, skipped } =
    categoryId === null
      ? {
          // Even clearing skips a split parent: its null envelope is the split, not an
          // absence, and letting the bulk write touch it would be a silent no-op reported
          // as a success.
          assignable: unique.filter(
            (id) => loadedIds.has(id) && !rows.find((row) => row.id === id)?.isParent,
          ),
          skipped: [],
        }
      : partitionCategoryTargets(
          unique,
          rows.map((row) => ({
            id: row.id,
            accountOffBudget: row.accountOffBudget,
            categoryAssignable: assignableSet.has(row.id),
            isSplitParent: row.isParent,
          })),
        );

  if (assignable.length > 0) {
    const affected = rows.filter((row) => assignable.includes(row.id));
    await db.transaction(async (tx) => {
      const envelopeIds = [
        ...new Set(
          [categoryId, ...affected.map((row) => row.budgetCategoryId)].filter(
            (id): id is string => id !== null,
          ),
        ),
      ];
      const scope = {
        accountIds: [...new Set(affected.map((row) => row.accountId))],
        budgetMonths: [
          ...new Set(affected.map((row) => monthKeyOf(row.transactionDate))),
        ],
        ...(envelopeIds.length === 0 ? {} : { envelopeIds }),
      };
      const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
      await tx
        .update(financeTransactions)
        .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, assignable),
          ),
        );
      const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
      await writeFinanceAuditEvent(tx, userId, {
        kind: "transaction_change",
        origin: options.auditOrigin ?? "Budget filing",
        summary: `${categoryId === null ? "Unfiled" : "Filed"} ${assignable.length} transaction${assignable.length === 1 ? "" : "s"}.`,
        scope,
        beforeCheckpoint,
        afterCheckpoint,
        changes: affected.map((row) => ({
          entityType: "transaction",
          entityIdentity: row.id,
          before: { budgetCategoryId: row.budgetCategoryId },
          after: { budgetCategoryId: categoryId },
        })),
      });
    });
  }

  if (categoryId !== null) {
    const latestByPayee = new Map<string, string>();
    for (const id of assignable) {
      const payeeId = rows.find((row) => row.id === id)?.payeeId;
      if (payeeId) latestByPayee.set(payeeId, id);
    }
    for (const [payeeId, editedId] of latestByPayee) {
      await learnCategoryForPayee(userId, editedId, payeeId);
    }
  }

  return { updated: assignable, skipped };
}

/**
 * File every waiting charge of one payee into an envelope.
 *
 * The offer D5 makes when a default is set or confirmed: a payee whose destination is known
 * usually has a backlog behind it — 372 `AMAZON MKTPL` charges, 286 Apple ones — and filing
 * them by hand is the work the app exists to remove. It is never silent: the caller states
 * the count first and this runs only on a yes.
 *
 * Only rows with no Category at all are touched, so a Category someone chose by hand is
 * never overwritten; ineligible rows are skipped by the bulk write as everywhere else.
 */
export async function fileWaitingChargesForPayee(
  userId: string,
  payeeId: string,
  categoryId: string,
): Promise<{ filed: number }> {
  await requireCategory(userId, categoryId);
  await requireOwnedRow(
    db,
    financePayees,
    payeeId,
    userId,
    "That payee does not exist.",
  );

  const waiting = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.payeeId, payeeId),
        // Leaves: a split parent's null envelope is not a charge waiting to be filed.
        moneyRows,
        isNull(financeTransactions.budgetCategoryId),
      ),
    );
  if (waiting.length === 0) return { filed: 0 };

  const result = await setTransactionBudgetCategories(
    userId,
    waiting.map((row) => row.id),
    categoryId,
  );
  return { filed: result.updated.length };
}

/** Put one transaction in a Category, or make it Uncategorized. */
export async function setTransactionBudgetCategory(
  userId: string,
  transactionId: string,
  categoryId: string | null,
): Promise<string | void> {
  const result = await setTransactionBudgetCategories(
    userId,
    [transactionId],
    categoryId,
  );
  if (result.updated.includes(transactionId)) return;
  const skip = result.skipped[0];
  if (skip) throw new Error(skip.reason);
  throw new Error("That transaction does not exist.");
}
