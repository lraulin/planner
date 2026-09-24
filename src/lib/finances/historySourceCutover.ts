/**
 * Hand an account's history to one source (`agent-os/specs/2026-09-23-1316-one-history-source-per-account/`
 * D5). Capital One moves from SimpleFIN to the bank page; Chase stays on SimpleFIN and sheds the
 * page's leftover holds.
 *
 * Everything runs in one transaction, and a dry run is that same transaction rolled back, so
 * the receipt Lee reads is exactly what `--apply` will do.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  financeAccounts,
  financeAuditEvents,
  financeTransactions,
} from "@/db/schema";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import type { FinanceAuditChange } from "./audit/types";
import { writeFinanceAuditEvent } from "./audit/writes";
import {
  CAPITAL_ONE_SCRAPE_FEED,
  CHASE_SCRAPE_FEED,
  parseBankBrowserSnapshot,
  type ParsedBankBrowserSnapshot,
  type ParsedBankSnapshotRow,
} from "./bankSnapshot";
import {
  planBankSnapshotReconciliation,
  type ExistingBankSnapshotRow,
} from "./bankSnapshotReconcile";
import { insertSnapshotRow, reclassifyInsideTransaction } from "./bankSnapshotApply";
import type { FinanceExecutor } from "./dbExecutor";
import { retireRowsOntoOtherSources } from "./feedHandoverWrite";
import { numericStringToCents } from "./money";
import { recomputeAccountBalanceAuthority } from "./sourceStateWrite";

export type CutoverTarget = "bank_page" | "simplefin";

const SIMPLEFIN_FEED = "api:simplefin";

export type HeldRow = {
  id: string;
  transactionDate: string;
  description: string;
  amountCents: number;
  hasUserState: boolean;
};

export type HistorySourceCutoverReceipt = {
  accountId: string;
  accountName: string;
  from: string;
  to: CutoverTarget;
  /** New `history_source_since`; unchanged (and null) when the source does not change. */
  since: string | null;
  /** Holds of the losing source that paired and were deleted, state carried. */
  retired: number;
  carried: number;
  /** Holds of the losing source that paired with nothing; kept, for Lee to judge. */
  unpaired: HeldRow[];
  /** Posted rows on the latest capture, on or before `since`, that nothing stores. */
  missedByPreviousSource: ParsedBankSnapshotRow[];
  /** When the capture those came from was taken, or null when there is none. */
  latestCaptureAt: Date | null;
  /** How many of those were inserted as page rows (`insertMissed`). */
  insertedMissed: number;
  unlinked: number;
  warnings: string[];
};

class DryRunRollback extends Error {
  constructor(readonly receipt: HistorySourceCutoverReceipt) {
    super("dry run");
  }
}

/** The day SimpleFIN last posted a row on this account: its history ends there. */
async function lastSimpleFinPostingDay(
  tx: FinanceExecutor,
  userId: string,
  accountId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({
      day: sql<
        string | null
      >`max(coalesce(${financeTransactions.postedDate}, ${financeTransactions.transactionDate}))::text`,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        eq(financeTransactions.externalSource, SIMPLEFIN_FEED),
        eq(financeTransactions.pending, false),
      ),
    );
  return row?.day ?? null;
}

async function storedRows(
  tx: FinanceExecutor,
  userId: string,
  accountId: string,
): Promise<ExistingBankSnapshotRow[]> {
  const rows = await tx
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
        eq(financeTransactions.accountId, accountId),
        sql`${financeTransactions.parentId} is null`,
      ),
    );
  return rows.map((row) => ({
    ...row,
    amountCents: numericStringToCents(row.amount) ?? 0,
  }));
}

/**
 * The page rows SimpleFIN appears to have missed: what the latest stored capture would insert
 * that falls on or before the cutover day, where the page will never author it.
 */
async function missedByPreviousSource(
  tx: FinanceExecutor,
  userId: string,
  accountId: string,
  since: string,
): Promise<{
  rows: ParsedBankSnapshotRow[];
  snapshot: ParsedBankBrowserSnapshot | null;
}> {
  const [event] = await tx
    .select({ evidence: financeAuditEvents.sourceEvidence })
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        eq(financeAuditEvents.kind, "bank_snapshot"),
        sql`${financeAuditEvents.scope} -> 'accountIds' ? ${accountId}`,
      ),
    )
    .orderBy(desc(financeAuditEvents.occurredAt))
    .limit(1);
  const rawText = event?.evidence.rawText;
  if (typeof rawText !== "string") return { rows: [], snapshot: null };
  const parsed = parseBankBrowserSnapshot(rawText);
  if (!parsed.ok) return { rows: [], snapshot: null };
  const snapshot = parsed.snapshot;
  const plan = planBankSnapshotReconciliation(
    await storedRows(tx, userId, accountId),
    snapshot.posted,
    snapshot.pending,
    false,
    snapshot.recentPosted,
    since,
  );
  return { rows: plan.postedBeforeSourceStart, snapshot };
}

async function cutover(
  tx: FinanceExecutor,
  userId: string,
  accountId: string,
  to: CutoverTarget,
  insertMissed: boolean,
): Promise<HistorySourceCutoverReceipt> {
  const [account] = await tx
    .select({
      id: financeAccounts.id,
      name: financeAccounts.name,
      historySource: financeAccounts.historySource,
      historySourceSince: financeAccounts.historySourceSince,
    })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.userId, userId), eq(financeAccounts.id, accountId)));
  if (!account) throw new Error("Account not found.");

  const scope = { accountIds: [account.id], accountNames: [account.name] };
  const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
  const warnings: string[] = [];

  let since = account.historySourceSince;
  let missed: ParsedBankSnapshotRow[] = [];
  let latestCaptureAt: Date | null = null;
  let insertedMissed = 0;
  const insertedChanges: FinanceAuditChange[] = [];
  let unlinked = 0;
  if (to === "bank_page" && account.historySource !== "bank_page") {
    since = await lastSimpleFinPostingDay(tx, userId, account.id);
    if (since === null)
      warnings.push("SimpleFIN posted nothing here, so the page authors all history.");
    else {
      const found = await missedByPreviousSource(tx, userId, account.id, since);
      missed = found.rows;
      latestCaptureAt = found.snapshot?.capturedAt ?? null;
      // The last day SimpleFIN posted is often a day it had not finished delivering (the
      // YouTube case). Lee reads the receipt, then these become page rows exactly as a paste
      // would write them.
      if (insertMissed && found.snapshot) {
        for (const row of missed) {
          const id = await insertSnapshotRow(
            tx,
            userId,
            account.id,
            found.snapshot,
            row,
            false,
          );
          insertedChanges.push({
            entityType: "transaction",
            entityIdentity: id,
            before: null,
            after: {
              accountId: account.id,
              transactionDate: row.transactionDate,
              postedDate: row.postedDate,
              amountCents: row.amountCents,
              pending: false,
              externalSource: found.snapshot.feed,
              externalId: row.externalId,
            },
          });
        }
        insertedMissed = insertedChanges.length;
        if (insertedMissed > 0) await reclassifyInsideTransaction(tx, userId);
      }
    }
    await tx
      .update(financeAccounts)
      .set({
        historySource: "bank_page",
        historySourceSince: since,
        updatedAt: new Date(),
      })
      .where(
        and(eq(financeAccounts.userId, userId), eq(financeAccounts.id, account.id)),
      );
    const links = await tx
      .delete(bankAccountLinks)
      .where(
        and(
          eq(bankAccountLinks.userId, userId),
          eq(bankAccountLinks.accountId, account.id),
        ),
      )
      .returning({ id: bankAccountLinks.id });
    unlinked = links.length;
  } else if (to === "simplefin" && account.historySource !== "simplefin") {
    throw new Error(
      `${account.name} takes its history from ${account.historySource}; link it to SimpleFIN instead.`,
    );
  }

  // The losing source's holds yield to the winner's rows: SimpleFIN's to the page's on a
  // bank-page account, the page's leftovers to SimpleFIN's on a feed account.
  const losing =
    to === "bank_page"
      ? [SIMPLEFIN_FEED]
      : [CAPITAL_ONE_SCRAPE_FEED, CHASE_SCRAPE_FEED];
  const handover = await retireRowsOntoOtherSources(tx, userId, account.id, losing, {
    pendingOnly: true,
  });
  warnings.push(...handover.warnings);

  const unpaired = (await storedRows(tx, userId, account.id))
    .filter(
      (row) =>
        row.pending &&
        row.externalSource !== null &&
        losing.includes(row.externalSource),
    )
    .map((row) => ({
      id: row.id,
      transactionDate: row.transactionDate,
      description: row.description,
      amountCents: row.amountCents,
      hasUserState:
        row.budgetCategoryId !== null ||
        row.notes.trim() !== "" ||
        row.flowOverride !== null,
    }));

  const authority = await recomputeAccountBalanceAuthority(tx, userId, account.id);
  const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
  await writeFinanceAuditEvent(tx, userId, {
    kind: "history_source_cutover",
    origin: "History source cutover",
    summary:
      `${account.name}: ${account.historySource} → ${to}` +
      (since ? ` from ${since}` : "") +
      `; retired ${handover.retired} hold${handover.retired === 1 ? "" : "s"}, ` +
      `${unpaired.length} unpaired, ${missed.length} page row${missed.length === 1 ? "" : "s"} the previous source missed (${insertedMissed} inserted), ` +
      `${unlinked} link${unlinked === 1 ? "" : "s"} removed.`,
    scope,
    warnings,
    beforeCheckpoint,
    afterCheckpoint,
    changes: [
      {
        entityType: "account",
        entityIdentity: account.id,
        before: {
          historySource: account.historySource,
          historySourceSince: account.historySourceSince,
        },
        after: {
          historySource: to,
          historySourceSince: since,
          headline: authority.headlineSource,
        },
      },
      ...insertedChanges,
      ...handover.changes,
      ...authority.changes,
    ],
  });

  return {
    accountId: account.id,
    accountName: account.name,
    from: account.historySource,
    to,
    since,
    retired: handover.retired,
    carried: handover.carried,
    unpaired,
    missedByPreviousSource: missed,
    latestCaptureAt,
    insertedMissed,
    unlinked,
    warnings,
  };
}

/** Run the cutover; with `dryRun`, roll everything back and only report. */
export async function applyHistorySourceCutover(
  userId: string,
  accountId: string,
  to: CutoverTarget,
  options: { dryRun: boolean; insertMissed?: boolean },
): Promise<HistorySourceCutoverReceipt> {
  try {
    return await db.transaction(async (tx) => {
      const receipt = await cutover(
        tx,
        userId,
        accountId,
        to,
        options.insertMissed ?? false,
      );
      if (options.dryRun) throw new DryRunRollback(receipt);
      return receipt;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.receipt;
    throw error;
  }
}
