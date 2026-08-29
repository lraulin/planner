import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  financeAccounts,
  financePaymentResolutions,
  financePayeeAliases,
  financePayees,
  financeTransactions,
} from "@/db/schema";
import { localDateKey } from "@/lib/schedule/geometry";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import type { FinanceAuditChange, FinanceMoneyCheckpoint } from "./audit/types";
import { writeFinanceAuditEvent } from "./audit/writes";
import { monthKeyOf } from "./budget/envelope";
import {
  parseBankBrowserSnapshot,
  type ParsedBankBrowserSnapshot,
  type ParsedBankSnapshotRow,
} from "./bankSnapshot";
import {
  planBankSnapshotReconciliation,
  type ExistingBankSnapshotRow,
} from "./bankSnapshotReconcile";
import { changedRows, planReclassify } from "./classify/reclassify";
import type { FinanceExecutor } from "./dbExecutor";
import { centsToNumericString, numericStringToCents } from "./money";
import type { PaypalResolution } from "./paypalMatch";
import {
  categoryForNewTransaction,
  type AutoCategoryMode,
} from "./payees/autoCategory";
import { payeeIndex } from "./payees/resolve";

export type BankSnapshotApplyResult = {
  accountId: string;
  accountName: string;
  source: ParsedBankBrowserSnapshot["source"];
  currentBalanceCents: number;
  posted: {
    received: number;
    inserted: number;
    transitioned: number;
    replaced: number;
    duplicates: number;
  };
  pending: {
    received: number;
    inserted: number;
    updated: number;
    removed: number;
  };
  warnings: string[];
  checkpointDelta: {
    workingBalanceCents: number;
    accountPoolCents: number;
    readyToAssignCents: number;
  };
  auditEventId: string;
  auditBatchId: string;
};

type AccountTarget = { id: string; name: string };

type NormalizedTransactionState = {
  accountId: string;
  transactionDate: string;
  postedDate: string | null;
  pending: boolean;
  amountCents: number;
  sourceCategory: string;
  derivedFlow: string | null;
  flowOverride: string | null;
  budgetCategoryId: string | null;
  transferGroupId: string | null;
  isParent: boolean;
  parentId: string | null;
  externalSource: string | null;
  externalId: string | null;
};

function snapshotScope(
  snapshot: ParsedBankBrowserSnapshot,
  account: AccountTarget,
): { accountIds: string[]; accountNames: string[]; budgetMonths: string[] } {
  const months = new Set([
    monthKeyOf(localDateKey(snapshot.capturedAt)),
    ...snapshot.posted.map((row) => monthKeyOf(row.transactionDate)),
    ...snapshot.pending.map((row) => monthKeyOf(row.transactionDate)),
  ]);
  return {
    accountIds: [account.id],
    accountNames: [account.name],
    budgetMonths: [...months].sort(),
  };
}

async function resolveCardByLast4(
  executor: FinanceExecutor,
  userId: string,
  last4: string,
): Promise<AccountTarget> {
  const rows = await executor
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      kind: financeAccounts.kind,
      externalKey: financeAccounts.externalKey,
      closedAt: financeAccounts.closedAt,
    })
    .from(financeAccounts)
    .where(eq(financeAccounts.userId, userId));
  const matches = rows.filter(
    (row) =>
      row.closedAt === null &&
      row.kind === "credit_card" &&
      row.externalKey.trim().endsWith(last4),
  );
  if (matches.length === 0) throw new Error(`No open credit card ending in ${last4}.`);
  if (matches.length > 1) {
    throw new Error(`More than one open credit card ends in ${last4}.`);
  }
  return { id: matches[0].id, name: matches[0].name };
}

function bankOwnedValues(
  snapshot: ParsedBankBrowserSnapshot,
  row: ParsedBankSnapshotRow,
  pending: boolean,
) {
  return {
    transactionDate: row.transactionDate,
    postedDate: pending ? null : row.postedDate,
    pending,
    description: row.description,
    amount: centsToNumericString(row.amountCents),
    sourceCategory: row.sourceCategory,
    balanceAfter: null,
    externalSource: snapshot.feed,
    externalId: row.externalId,
    updatedAt: snapshot.capturedAt,
  };
}

async function insertSnapshotRow(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
  snapshot: ParsedBankBrowserSnapshot,
  row: ParsedBankSnapshotRow,
  pending: boolean,
): Promise<string> {
  const [inserted] = await executor
    .insert(financeTransactions)
    .values({
      userId,
      accountId,
      ...bankOwnedValues(snapshot, row, pending),
    })
    .returning({ id: financeTransactions.id });
  return inserted.id;
}

async function reclassifyInsideTransaction(
  executor: FinanceExecutor,
  userId: string,
): Promise<void> {
  const [rows, accounts, storedResolutions, aliases] = await Promise.all([
    executor
      .select({
        id: financeTransactions.id,
        accountId: financeTransactions.accountId,
        transactionDate: financeTransactions.transactionDate,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        sourceCategory: financeTransactions.sourceCategory,
        transferGroupId: financeTransactions.transferGroupId,
        payeeId: financeTransactions.payeeId,
        derivedFlow: financeTransactions.derivedFlow,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId)),
    executor
      .select({ id: financeAccounts.id, externalKey: financeAccounts.externalKey })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId)),
    executor
      .select({
        externalId: financePaymentResolutions.externalId,
        transactionDate: financePaymentResolutions.transactionDate,
        amount: financePaymentResolutions.amount,
        counterparty: financePaymentResolutions.counterparty,
        direction: financePaymentResolutions.direction,
      })
      .from(financePaymentResolutions)
      .where(eq(financePaymentResolutions.userId, userId)),
    executor
      .select({
        alias: financePayeeAliases.alias,
        payeeId: financePayeeAliases.payeeId,
      })
      .from(financePayeeAliases)
      .where(eq(financePayeeAliases.userId, userId)),
  ]);
  const parsed = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    transferGroupId: row.transferGroupId,
    payeeId: row.payeeId,
    derivedFlow: row.derivedFlow,
  }));
  const resolutions: PaypalResolution[] = storedResolutions.flatMap((row) => {
    const amountCents = numericStringToCents(row.amount);
    if (amountCents === null || (row.direction !== "in" && row.direction !== "out")) {
      return [];
    }
    return [
      {
        externalId: row.externalId,
        date: row.transactionDate,
        amountCents,
        counterparty: row.counterparty,
        direction: row.direction,
      },
    ];
  });
  const plan = planReclassify(
    parsed,
    accounts,
    randomUUID,
    resolutions,
    payeeIndex(aliases),
  );
  for (const row of changedRows(parsed, plan)) {
    await executor
      .update(financeTransactions)
      .set({
        derivedFlow: row.derivedFlow,
        transferGroupId: row.transferGroupId,
        payeeId: row.payeeId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(financeTransactions.userId, userId), eq(financeTransactions.id, row.id)),
      );
  }
}

async function autoFileNewRows(
  executor: FinanceExecutor,
  userId: string,
  transactionIds: readonly string[],
): Promise<void> {
  if (transactionIds.length === 0) return;
  const rows = await executor
    .select({
      id: financeTransactions.id,
      claimedBudgetCategoryId: financePayees.claimedBudgetCategoryId,
      defaultBudgetCategoryId: financePayees.defaultBudgetCategoryId,
      autoCategoryMode: financePayees.autoCategoryMode,
    })
    .from(financeTransactions)
    .innerJoin(financePayees, eq(financePayees.id, financeTransactions.payeeId))
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financePayees.userId, userId),
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.offBudget, false),
        isNull(financeTransactions.budgetCategoryId),
        sql`${financeTransactions.derivedFlow} is distinct from 'internal_transfer'`,
        inArray(financeTransactions.id, [...transactionIds]),
      ),
    );
  for (const row of rows) {
    const categoryId = categoryForNewTransaction({
      claimedBudgetCategoryId: row.claimedBudgetCategoryId,
      defaultBudgetCategoryId: row.defaultBudgetCategoryId,
      autoCategoryMode: row.autoCategoryMode as AutoCategoryMode,
    });
    if (!categoryId) continue;
    await executor
      .update(financeTransactions)
      .set({ budgetCategoryId: categoryId, updatedAt: new Date() })
      .where(
        and(eq(financeTransactions.userId, userId), eq(financeTransactions.id, row.id)),
      );
  }
}

async function loadNormalizedTransactionState(
  executor: FinanceExecutor,
  userId: string,
): Promise<Map<string, NormalizedTransactionState>> {
  const rows = await executor
    .select({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      pending: financeTransactions.pending,
      amount: financeTransactions.amount,
      sourceCategory: financeTransactions.sourceCategory,
      derivedFlow: financeTransactions.derivedFlow,
      flowOverride: financeTransactions.flowOverride,
      budgetCategoryId: financeTransactions.budgetCategoryId,
      transferGroupId: financeTransactions.transferGroupId,
      isParent: financeTransactions.isParent,
      parentId: financeTransactions.parentId,
      externalSource: financeTransactions.externalSource,
      externalId: financeTransactions.externalId,
    })
    .from(financeTransactions)
    .where(eq(financeTransactions.userId, userId));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        accountId: row.accountId,
        transactionDate: row.transactionDate,
        postedDate: row.postedDate,
        pending: row.pending,
        amountCents: numericStringToCents(row.amount) ?? 0,
        sourceCategory: row.sourceCategory,
        derivedFlow: row.derivedFlow,
        flowOverride: row.flowOverride,
        budgetCategoryId: row.budgetCategoryId,
        transferGroupId: row.transferGroupId,
        isParent: row.isParent,
        parentId: row.parentId,
        externalSource: row.externalSource,
        externalId: row.externalId,
      },
    ]),
  );
}

function auditChanges(
  before: ReadonlyMap<string, NormalizedTransactionState>,
  after: ReadonlyMap<string, NormalizedTransactionState>,
): FinanceAuditChange[] {
  const ids = new Set([...before.keys(), ...after.keys()]);
  return [...ids].sort().flatMap((id) => {
    const oldValue = before.get(id) ?? null;
    const newValue = after.get(id) ?? null;
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return [];
    return [
      {
        entityType: "transaction",
        entityIdentity: id,
        before: oldValue,
        after: newValue,
      },
    ];
  });
}

function accountWorking(checkpoint: FinanceMoneyCheckpoint, accountId: string): number {
  return (
    checkpoint.accounts.find((account) => account.accountId === accountId)
      ?.workingCents ?? 0
  );
}

function readyToAssign(checkpoint: FinanceMoneyCheckpoint): number {
  return checkpoint.budgets[0]?.readyToAssignCents ?? 0;
}

/** Apply a complete browser snapshot and its explanatory evidence as one database commit. */
export async function applyBankBrowserSnapshot(
  userId: string,
  text: string,
  options: { auditBatchId?: string } = {},
): Promise<BankSnapshotApplyResult> {
  const parsed = parseBankBrowserSnapshot(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const snapshot = parsed.snapshot;

  return db.transaction(async (tx) => {
    const account = await resolveCardByLast4(tx, userId, snapshot.accountLast4);
    const [link] = await tx
      .select({ id: bankAccountLinks.id })
      .from(bankAccountLinks)
      .where(
        and(
          eq(bankAccountLinks.userId, userId),
          eq(bankAccountLinks.accountId, account.id),
        ),
      )
      .limit(1);
    if (!link) {
      throw new Error(`${account.name} has no bank balance link to update.`);
    }

    const scope = snapshotScope(snapshot, account);
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(
      userId,
      scope,
      tx,
      snapshot.capturedAt,
    );
    const beforeRows = await loadNormalizedTransactionState(tx, userId);
    const stored = await tx
      .select({
        id: financeTransactions.id,
        transactionDate: financeTransactions.transactionDate,
        postedDate: financeTransactions.postedDate,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        pending: financeTransactions.pending,
        externalSource: financeTransactions.externalSource,
        externalId: financeTransactions.externalId,
        isParent: financeTransactions.isParent,
      })
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.accountId, account.id),
          isNull(financeTransactions.parentId),
        ),
      );
    const existing: ExistingBankSnapshotRow[] = stored.map((row) => ({
      ...row,
      amountCents: numericStringToCents(row.amount) ?? 0,
    }));
    const plan = planBankSnapshotReconciliation(
      existing,
      snapshot.posted,
      snapshot.pending,
    );
    const newIds: string[] = [];

    for (const transition of plan.postedTransitions) {
      await tx
        .update(financeTransactions)
        .set(bankOwnedValues(snapshot, transition.incoming, false))
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.id, transition.existingId),
            eq(financeTransactions.pending, true),
          ),
        );
    }
    for (const replacement of plan.postedReplacements) {
      await tx
        .delete(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.id, replacement.existingId),
            eq(financeTransactions.pending, true),
          ),
        );
      newIds.push(
        await insertSnapshotRow(
          tx,
          userId,
          account.id,
          snapshot,
          replacement.incoming,
          false,
        ),
      );
    }
    for (const row of plan.postedInserts) {
      newIds.push(
        await insertSnapshotRow(tx, userId, account.id, snapshot, row, false),
      );
    }
    for (const update of plan.pendingUpdates) {
      await tx
        .update(financeTransactions)
        .set(bankOwnedValues(snapshot, update.incoming, true))
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.id, update.existingId),
            eq(financeTransactions.pending, true),
          ),
        );
    }
    for (const row of plan.pendingInserts) {
      newIds.push(await insertSnapshotRow(tx, userId, account.id, snapshot, row, true));
    }
    if (plan.pendingDeletes.length > 0) {
      await tx
        .delete(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.pending, true),
            inArray(financeTransactions.id, plan.pendingDeletes),
          ),
        );
    }

    await tx
      .update(bankAccountLinks)
      .set({
        balanceCents: snapshot.currentBalanceCents,
        balanceAsOf: snapshot.capturedAt,
        scrapeBalanceAsOf: snapshot.capturedAt,
        updatedAt: snapshot.capturedAt,
      })
      .where(
        and(
          eq(bankAccountLinks.userId, userId),
          eq(bankAccountLinks.accountId, account.id),
          eq(bankAccountLinks.id, link.id),
        ),
      );

    await reclassifyInsideTransaction(tx, userId);
    await autoFileNewRows(tx, userId, newIds);

    const afterRows = await loadNormalizedTransactionState(tx, userId);
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(
      userId,
      scope,
      tx,
      snapshot.capturedAt,
    );
    const changes = auditChanges(beforeRows, afterRows);
    const summary =
      `Applied ${snapshot.source === "chase" ? "Chase" : "Capital One"} bank snapshot for ${account.name}: ` +
      `${plan.postedTransitions.length + plan.postedReplacements.length} posted transition${plan.postedTransitions.length + plan.postedReplacements.length === 1 ? "" : "s"}, ` +
      `${plan.postedInserts.length} new posted, ${snapshot.pending.length} pending.`;
    const audit = await writeFinanceAuditEvent(tx, userId, {
      kind: "bank_snapshot",
      origin: snapshot.source === "chase" ? "Chase browser" : "Capital One browser",
      occurredAt: snapshot.capturedAt,
      summary,
      scope,
      warnings: plan.warnings,
      sourceEvidence: {
        format: "planner-bank-snapshot-v1",
        rawText: snapshot.rawText,
      },
      beforeCheckpoint,
      afterCheckpoint,
      changes,
      batchId: options.auditBatchId,
    });

    return {
      accountId: account.id,
      accountName: account.name,
      source: snapshot.source,
      currentBalanceCents: snapshot.currentBalanceCents,
      posted: {
        received: snapshot.posted.length,
        inserted: plan.postedInserts.length,
        transitioned: plan.postedTransitions.length,
        replaced: plan.postedReplacements.length,
        duplicates: plan.postedDuplicates.length,
      },
      pending: {
        received: snapshot.pending.length,
        inserted: plan.pendingInserts.length,
        updated: plan.pendingUpdates.length,
        removed: plan.pendingDeletes.length,
      },
      warnings: plan.warnings,
      checkpointDelta: {
        workingBalanceCents:
          accountWorking(afterCheckpoint, account.id) -
          accountWorking(beforeCheckpoint, account.id),
        accountPoolCents:
          afterCheckpoint.accountPoolCents - beforeCheckpoint.accountPoolCents,
        readyToAssignCents:
          readyToAssign(afterCheckpoint) - readyToAssign(beforeCheckpoint),
      },
      auditEventId: audit.eventId,
      auditBatchId: audit.batchId,
    };
  });
}
