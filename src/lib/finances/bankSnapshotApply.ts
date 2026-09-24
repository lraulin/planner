import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeCaptureCoverage,
  financeStatements,
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
  awaitingFeedPhrase,
  planBankSnapshotReconciliation,
  type ExistingBankSnapshotRow,
} from "./bankSnapshotReconcile";
import { capturedRanges, planCoverage } from "./captureCoverage";
import { recordSourceState } from "./sourceStateWrite";
import { changedRows, planReclassify } from "./classify/reclassify";
import type { FinanceExecutor } from "./dbExecutor";
import { centsToNumericString, numericStringToCents } from "./money";
import type { PaypalResolution } from "./paypalMatch";
import {
  categoryForNewTransaction,
  type AutoCategoryMode,
} from "./payees/autoCategory";
import { refusedBillClaims } from "./payees/billClaimGate";
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
    /** Rows a stored history-feed row already pairs with, so nothing new was inserted. */
    coveredByFeed: number;
    /**
     * D4: a feed-covered account's own hold, flagged as posted at the bank rather than
     * turned into page-authored posted history. Always 0 for an account with no history feed.
     */
    markedPostedAtBank: number;
    /**
     * Posted rows the page listed that fall on or before the account's `history_source_since`:
     * the previous source already holds that history, so nothing was inserted (D3, D5).
     */
    beforeSourceStart: number;
    /** D4: posted rows seen on the page and left for the feed; `awaitingFeedPhrase` names them. */
    awaitingFeed: Pick<ParsedBankSnapshotRow, "description" | "amountCents">[];
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

type AccountTarget = {
  id: string;
  name: string;
  historySource: string;
  historySourceSince: string | null;
};

const HISTORY_SOURCE_LABEL: Record<string, string> = {
  simplefin: "SimpleFIN",
  files: "file imports",
};

type NormalizedTransactionState = {
  accountId: string;
  transactionDate: string;
  postedDate: string | null;
  pending: boolean;
  postedAtBank: Date | null;
  unlistedAt: Date | null;
  /**
   * With `description`, `notes` and `payeeId`, what makes `before` a whole row rather than
   * a diff — the audit restore (D4 of holds-are-never-deleted-by-absence) re-inserts from it.
   */
  description: string;
  notes: string;
  payeeId: string | null;
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
      historySource: financeAccounts.historySource,
      historySourceSince: financeAccounts.historySourceSince,
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
  return {
    id: matches[0].id,
    name: matches[0].name,
    historySource: matches[0].historySource,
    historySourceSince: matches[0].historySourceSince,
  };
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
    // A hold the page lists is listed; the page speaking again clears the flag.
    unlistedAt: null,
    updatedAt: snapshot.capturedAt,
  };
}

export async function insertSnapshotRow(
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

export async function reclassifyInsideTransaction(
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
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
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
  const refused = await refusedBillClaims(
    executor,
    userId,
    rows.flatMap((row) =>
      row.claimedBudgetCategoryId
        ? [
            {
              id: row.id,
              transactionDate: row.transactionDate,
              amountCents: numericStringToCents(row.amount) ?? 0,
              claimedBudgetCategoryId: row.claimedBudgetCategoryId,
            },
          ]
        : [],
    ),
  );
  for (const row of rows) {
    const categoryId = categoryForNewTransaction(
      {
        claimedBudgetCategoryId: row.claimedBudgetCategoryId,
        defaultBudgetCategoryId: row.defaultBudgetCategoryId,
        autoCategoryMode: row.autoCategoryMode as AutoCategoryMode,
      },
      { claimApplies: !refused.has(row.id) },
    );
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
      postedAtBank: financeTransactions.postedAtBank,
      unlistedAt: financeTransactions.unlistedAt,
      description: financeTransactions.description,
      notes: financeTransactions.notes,
      payeeId: financeTransactions.payeeId,
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
        postedAtBank: row.postedAtBank,
        unlistedAt: row.unlistedAt,
        description: row.description,
        notes: row.notes,
        payeeId: row.payeeId,
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

/**
 * Record the days this paste read completely (D7), extending a cycle a previous paste already
 * covered rather than adding a row per paste.
 */
async function recordCoverage(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
  snapshot: ParsedBankBrowserSnapshot,
  auditEventId: string,
): Promise<void> {
  let storedClosedStart: string | null = null;
  if (snapshot.recentStatementClosedOn !== null) {
    const [statement] = await executor
      .select({ periodStart: financeStatements.periodStart })
      .from(financeStatements)
      .where(
        and(
          eq(financeStatements.userId, userId),
          eq(financeStatements.accountId, accountId),
          eq(financeStatements.periodEnd, snapshot.recentStatementClosedOn),
        ),
      )
      .limit(1);
    storedClosedStart = statement?.periodStart ?? null;
  }
  const stored = await executor
    .select({
      id: financeCaptureCoverage.id,
      fromDay: financeCaptureCoverage.fromDay,
      throughDay: financeCaptureCoverage.throughDay,
    })
    .from(financeCaptureCoverage)
    .where(
      and(
        eq(financeCaptureCoverage.userId, userId),
        eq(financeCaptureCoverage.accountId, accountId),
      ),
    );
  const plan = planCoverage(stored, capturedRanges(snapshot, storedClosedStart));
  if (plan.removeIds.length > 0) {
    await executor
      .delete(financeCaptureCoverage)
      .where(
        and(
          eq(financeCaptureCoverage.userId, userId),
          eq(financeCaptureCoverage.accountId, accountId),
          inArray(financeCaptureCoverage.id, plan.removeIds),
        ),
      );
  }
  if (plan.insert.length > 0) {
    await executor
      .insert(financeCaptureCoverage)
      .values(
        plan.insert.map((range) => ({ userId, accountId, auditEventId, ...range })),
      );
  }
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
    // One source authors each account's history (D1). A paste writes rows only for an
    // account that has chosen the bank page; for any other it would be a second author.
    if (account.historySource !== "bank_page") {
      throw new Error(
        `${account.name} takes its history from ${
          HISTORY_SOURCE_LABEL[account.historySource] ?? account.historySource
        }, so a paste from the bank page is not accepted.`,
      );
    }
    // Always false past the refusal above: the feed-covered branches of the planner belong to
    // accounts whose history another source writes, which a paste no longer reaches.
    const feedCovered = false;

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
        postedAtBank: financeTransactions.postedAtBank,
        unlistedAt: financeTransactions.unlistedAt,
        budgetCategoryId: financeTransactions.budgetCategoryId,
        notes: financeTransactions.notes,
        flowOverride: financeTransactions.flowOverride,
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
      feedCovered,
      snapshot.recentPosted,
      account.historySourceSince,
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
    // D4: the page confirms one of its own holds posted, but never authors posted history
    // for a feed-covered account — flagged, still pending, envelope untouched. Only the
    // first capture to notice writes the stamp: a later paste that notices the same hold
    // again is then a true no-op, not a moving timestamp with nothing else to show for it.
    if (plan.postedAtBankMarks.length > 0) {
      await tx
        .update(financeTransactions)
        .set({ postedAtBank: snapshot.capturedAt, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.pending, true),
            isNull(financeTransactions.postedAtBank),
            inArray(financeTransactions.id, plan.postedAtBankMarks),
          ),
        );
    }
    // D3: kept and flagged, never deleted for being absent. Only the first capture to notice
    // stamps it, so the flag says when the page first went quiet, not when it last did.
    if (plan.unlistedMarks.length > 0) {
      await tx
        .update(financeTransactions)
        .set({ unlistedAt: snapshot.capturedAt, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.pending, true),
            isNull(financeTransactions.unlistedAt),
            inArray(financeTransactions.id, plan.unlistedMarks),
          ),
        );
    }
    // Carry a retiring pending row's envelope, notes and flow onto its posted successor
    // before that pending row is deleted below.
    for (const carry of plan.pendingCarries) {
      if (Object.keys(carry.carry).length === 0) continue;
      await tx
        .update(financeTransactions)
        .set({ ...carry.carry, updatedAt: new Date() })
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.accountId, account.id),
            eq(financeTransactions.id, carry.targetId),
          ),
        );
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

    // The capture writes its own stamp only. Re-pasting a clipboard captured before the
    // last sync therefore still imports its rows (identity-paired ones are simply already
    // held by the feed) and leaves the headline and the pending set exactly where they were.
    const authority = await recordSourceState(tx, userId, account.id, {
      source: "browser",
      balanceCents: snapshot.currentBalanceCents,
      availableCents: null,
      asOf: snapshot.capturedAt,
      asOfDay: null,
    });

    await reclassifyInsideTransaction(tx, userId);
    await autoFileNewRows(tx, userId, newIds);

    const afterRows = await loadNormalizedTransactionState(tx, userId);
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(
      userId,
      scope,
      tx,
      snapshot.capturedAt,
    );
    const changes = [...auditChanges(beforeRows, afterRows), ...authority.changes];
    const summary =
      `Applied ${snapshot.source === "chase" ? "Chase" : "Capital One"} bank snapshot for ${account.name}: ` +
      `${plan.postedTransitions.length + plan.postedReplacements.length} posted transition${plan.postedTransitions.length + plan.postedReplacements.length === 1 ? "" : "s"}, ` +
      `${plan.postedInserts.length} new posted, ${snapshot.pending.length} pending` +
      (plan.postedCoveredByFeed > 0
        ? `; ${plan.postedCoveredByFeed} already held by the bank feed`
        : "") +
      (plan.postedAtBankMarks.length > 0
        ? `; ${plan.postedAtBankMarks.length} marked posted at the bank, awaiting the feed`
        : "") +
      (plan.postedAwaitingFeed.length > 0
        ? `; ${awaitingFeedPhrase(plan.postedAwaitingFeed)}`
        : "") +
      (plan.postedBeforeSourceStart.length > 0
        ? `; ${plan.postedBeforeSourceStart.length} posted on or before ${account.historySourceSince}, already held by the previous source`
        : "") +
      (plan.unlistedMarks.length > 0
        ? `; ${plan.unlistedMarks.length} hold${plan.unlistedMarks.length === 1 ? "" : "s"} no longer listed, kept for review`
        : "") +
      "." +
      (authority.headlineMoved
        ? ""
        : " A more current figure is already in force, so the headline was left alone.");
    const audit = await writeFinanceAuditEvent(tx, userId, {
      kind: "bank_snapshot",
      origin: snapshot.source === "chase" ? "Chase browser" : "Capital One browser",
      occurredAt: snapshot.capturedAt,
      summary,
      scope,
      warnings: authority.headlineMoved
        ? plan.warnings
        : [
            ...plan.warnings,
            "This capture predates a more current source, so its rows were applied but the balance and pending set were not.",
          ],
      sourceEvidence: {
        format: "planner-bank-snapshot-v1",
        rawText: snapshot.rawText,
      },
      beforeCheckpoint,
      afterCheckpoint,
      changes,
      batchId: options.auditBatchId,
    });

    await recordCoverage(tx, userId, account.id, snapshot, audit.eventId);

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
        coveredByFeed: plan.postedCoveredByFeed,
        markedPostedAtBank: plan.postedAtBankMarks.length,
        beforeSourceStart: plan.postedBeforeSourceStart.length,
        awaitingFeed: plan.postedAwaitingFeed.map(({ description, amountCents }) => ({
          description,
          amountCents,
        })),
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
