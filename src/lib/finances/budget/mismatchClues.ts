import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeAuditEvents, financeTransactions } from "@/db/schema";
import type { FinanceExecutor } from "../dbExecutor";
import { centsToNumericString, numericStringToCents } from "../money";
import { moneyRows } from "../splitRows";
import {
  notSupersededPending,
  type AccountMismatch,
  type BudgetMismatch,
} from "./accountDrift";
import type { MonthKey } from "./envelope";
import { candidateReading, type CandidateReading } from "./mismatchCandidate";

/**
 * Evidence for *why* an account disagrees with the bank, for the Accounts drawer the Budget
 * warning's Review button opens. `loadBudgetMismatch` says how far off an account is; this
 * says where to look.
 *
 * Two kinds of evidence, both cheap and both exact:
 *
 * - **Rows whose amount alone accounts for the whole gap.** A mismatch is
 *   `working − opening − rows since start`, so one row can explain it in two ways (see
 *   `candidateReading`). Most real mismatches are one row, so an exact-amount match is
 *   usually the answer; a near miss (a hold that posted with a tip) is not guessed at.
 * - **The last audited write that moved the mismatch total.** Every finance write records
 *   the total before and after (`captureFinanceMoneyCheckpoint`), so the write that made the
 *   gap appear — a sync, an import, a delete — is already on file.
 */

export type MismatchCandidate = {
  transactionId: string;
  transactionDate: string;
  description: string;
  amountCents: number;
  pending: boolean;
  reading: CandidateReading;
};

export type MismatchChange = {
  eventId: string;
  summary: string;
  occurredAt: Date;
  beforeCents: number;
  afterCents: number;
};

export type MismatchClues = {
  startMonth: MonthKey;
  /** Keyed by account id; only accounts whose mismatch is non-zero appear. */
  candidatesByAccount: Readonly<Record<string, readonly MismatchCandidate[]>>;
  /** Whole-budget, like the checkpoint it reads: per-account mismatch is not recorded. */
  lastChange: MismatchChange | null;
};

/** Enough to pick from without turning the drawer into a second Register. */
const CANDIDATES_PER_ACCOUNT = 5;

export async function loadMismatchClues(
  userId: string,
  startMonth: MonthKey | null,
  mismatch: BudgetMismatch,
  supersededTransactionIds: readonly string[],
  executor: FinanceExecutor = db,
): Promise<MismatchClues | null> {
  const off = mismatch.accounts.filter((account) => account.mismatchCents !== 0);
  if (!startMonth || off.length === 0) return null;

  const [rows, lastChange] = await Promise.all([
    sameSizeRows(userId, off, supersededTransactionIds, executor),
    lastMismatchChange(userId, executor),
  ]);

  const candidatesByAccount: Record<string, MismatchCandidate[]> = {};
  for (const account of off) {
    candidatesByAccount[account.accountId] = rows
      .filter((row) => row.accountId === account.accountId)
      .flatMap((row): MismatchCandidate[] => {
        const reading = candidateReading(account.mismatchCents, startMonth, row);
        return reading ? [{ ...row, reading }] : [];
      })
      .slice(0, CANDIDATES_PER_ACCOUNT);
  }
  return { startMonth, candidatesByAccount, lastChange };
}

/** Money rows on each off account whose size equals that account's gap, newest first. */
async function sameSizeRows(
  userId: string,
  accounts: readonly AccountMismatch[],
  supersededTransactionIds: readonly string[],
  executor: FinanceExecutor,
) {
  const rows = await executor
    .select({
      transactionId: financeTransactions.id,
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      description: financeTransactions.description,
      bankDisplayName: financeTransactions.bankDisplayName,
      amount: financeTransactions.amount,
      pending: financeTransactions.pending,
    })
    .from(financeTransactions)
    .innerJoin(financeAccounts, eq(financeAccounts.id, financeTransactions.accountId))
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeAccounts.userId, userId),
        moneyRows,
        notSupersededPending(supersededTransactionIds),
        or(
          ...accounts.map((account) =>
            and(
              eq(financeTransactions.accountId, account.accountId),
              inArray(financeTransactions.amount, [
                centsToNumericString(account.mismatchCents),
                centsToNumericString(-account.mismatchCents),
              ]),
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(financeTransactions.transactionDate))
    .limit(CANDIDATES_PER_ACCOUNT * 4 * accounts.length);

  return rows.map((row) => {
    const amountCents = numericStringToCents(row.amount);
    if (amountCents === null) {
      throw new Error(`Transaction ${row.transactionId} has a non-numeric amount`);
    }
    return {
      transactionId: row.transactionId,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      description: row.bankDisplayName ?? row.description,
      amountCents,
      pending: row.pending,
    };
  });
}

const MISMATCH_PATH = "{budgets,0,mismatchTotalCents}";

/**
 * The newest audited write whose before and after checkpoints disagree on the mismatch
 * total. Both sides must carry the figure: events from before checkpoints recorded it have
 * none, and null → number is not a change anyone made.
 */
async function lastMismatchChange(
  userId: string,
  executor: FinanceExecutor,
): Promise<MismatchChange | null> {
  const before = sql<
    string | null
  >`${financeAuditEvents.beforeCheckpoint} #>> ${MISMATCH_PATH}`;
  const after = sql<
    string | null
  >`${financeAuditEvents.afterCheckpoint} #>> ${MISMATCH_PATH}`;
  const [row] = await executor
    .select({
      eventId: financeAuditEvents.id,
      summary: financeAuditEvents.summary,
      occurredAt: financeAuditEvents.occurredAt,
      beforeCents: before,
      afterCents: after,
    })
    .from(financeAuditEvents)
    .where(
      and(
        eq(financeAuditEvents.userId, userId),
        isNotNull(before),
        isNotNull(after),
        sql`(${before})::numeric <> (${after})::numeric`,
      ),
    )
    .orderBy(desc(financeAuditEvents.occurredAt), desc(financeAuditEvents.id))
    .limit(1);
  if (!row) return null;
  return {
    eventId: row.eventId,
    summary: row.summary,
    occurredAt: row.occurredAt,
    beforeCents: Number(row.beforeCents),
    afterCents: Number(row.afterCents),
  };
}
