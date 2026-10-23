/**
 * The one-time cutover from the single recorded opening (`settings.openingCents`) to
 * per-account openings (`finance_accounts.budget_opening_cents`)
 * (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D2, Task 8).
 *
 * Every on-budget account without a recorded opening is seeded from its statement
 * (`openingSeed.ts`), or from today's live recomputation where no statement exists. Once all
 * are seeded `effectiveOpeningCents` stops reading the legacy total, so Ready to Assign moves
 * by exactly `Σ openings − legacy total` — the one change this makes, and the one D5 says to
 * show rather than hide.
 *
 * Everything runs in one transaction, and a dry run is that same transaction rolled back, so
 * the receipt Lee reads is exactly what `--apply` will do. Idempotent: an account that already
 * has an opening keeps it, so a second run seeds nothing.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeStatements,
  financeTransactions,
  type FinanceAccountKind,
} from "@/db/schema";
import { captureFinanceMoneyCheckpoint } from "../audit/checkpoints";
import type { FinanceExecutor } from "../dbExecutor";
import { writeFinanceAuditEvent } from "../audit/writes";
import { numericStringToCents } from "../money";
import { moneyRows } from "../splitRows";
import { monthEndKey, shiftMonthKey } from "./envelope";
import {
  assertLedgerIdentity,
  snapshotOf,
  writeOpeningCents,
  type LedgerSnapshot,
} from "./membership";
import {
  anchorStatement,
  crossingSign,
  openingSeedLabel,
  seedAccountOpening,
  type OpeningSeed,
  type SeedRow,
  type SeedStatement,
} from "./openingSeed";
import { loadBudget, openingPositionFor } from "./queries";

export type CrossingRow = SeedRow & { description: string; sign: 1 | -1 };

export type OpeningCutoverAccount = {
  accountId: string;
  name: string;
  kind: FinanceAccountKind;
  /** The opening this account already carried, kept as it was; null when the cutover seeds it. */
  recordedCents: number | null;
  /** How the cutover seeded it; null when it already had one. */
  seed: OpeningSeed | null;
  /** The anchor statement's period, when the seed came from one. */
  statementPeriod: { start: string; end: string } | null;
  /** The rows carried across the statement's close (`crossingSign`), for the receipt. */
  crossingRows: CrossingRow[];
  /** What the account carries after the cutover. */
  openingCents: number;
  /** Today's live recomputation of the same position: working balance − rows since start. */
  registerImpliedCents: number;
  /** D3's per-account mismatch once seeded: `registerImplied − opening`. */
  mismatchCents: number;
};

export type OpeningCutoverReceipt = {
  startMonth: string;
  /** The day the openings stand on: the last day before the start month. */
  dayKey: string;
  legacyOpeningCents: number;
  accounts: OpeningCutoverAccount[];
  seededCount: number;
  /** Σ on-budget working balances — the bank's side, which the cutover does not change. */
  accountPoolCents: number;
  unmatchedTransferCents: number;
  before: LedgerSnapshot;
  after: LedgerSnapshot;
};

class DryRunRollback extends Error {
  constructor(public receipt: OpeningCutoverReceipt) {
    super("dry run");
  }
}

async function statementsOf(
  tx: FinanceExecutor,
  userId: string,
  accountId: string,
): Promise<SeedStatement[]> {
  const rows = await tx
    .select({
      periodStart: financeStatements.periodStart,
      periodEnd: financeStatements.periodEnd,
      closingBalance: financeStatements.closingBalance,
    })
    .from(financeStatements)
    .where(
      and(
        eq(financeStatements.userId, userId),
        eq(financeStatements.accountId, accountId),
      ),
    );
  return rows.map((row) => ({
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    closingCents: numericStringToCents(row.closingBalance) ?? 0,
  }));
}

/**
 * Posted rows that could cross between `closeKey` and `dayKey`. Every row `crossingSign`
 * picks is dated by the later of the two days and posted after the earlier, so that bound is
 * the whole query; the exact rule stays in the pure function.
 */
async function rowsNearClose(
  tx: FinanceExecutor,
  userId: string,
  accountId: string,
  closeKey: string,
  dayKey: string,
): Promise<(SeedRow & { description: string })[]> {
  const [earlier, later] = closeKey < dayKey ? [closeKey, dayKey] : [dayKey, closeKey];
  const rows = await tx
    .select({
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      amount: financeTransactions.amount,
      description: financeTransactions.description,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        moneyRows,
        eq(financeTransactions.pending, false),
        sql`${financeTransactions.transactionDate} <= ${later}`,
        sql`coalesce(${financeTransactions.postedDate}, ${financeTransactions.transactionDate}) > ${earlier}`,
      ),
    );
  return rows.map((row) => ({
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    description: row.description,
  }));
}

/**
 * Seed every on-budget account that has no recorded opening, then prove the fold moved by
 * exactly the change in opening and nothing else.
 */
export async function applyLedgerOpeningCutover(
  userId: string,
  options: { dryRun?: boolean; todayKey?: string } = {},
): Promise<OpeningCutoverReceipt> {
  const load = (tx: FinanceExecutor) =>
    loadBudget(userId, null, tx, {
      includeMovementEvents: false,
      ...(options.todayKey ? { todayKey: options.todayKey } : {}),
    });
  try {
    return await db.transaction(async (tx) => {
      const beforeData = await load(tx);
      const startMonth = beforeData.settings.startMonth;
      if (!beforeData.configured || !startMonth) {
        throw new Error("The budget is not set up; there is no opening to seed.");
      }
      const before = snapshotOf(beforeData);
      assertLedgerIdentity(before);
      const dayKey = monthEndKey(shiftMonthKey(startMonth, -1));

      const onBudget = await tx
        .select({
          id: financeAccounts.id,
          name: financeAccounts.name,
          kind: financeAccounts.kind,
          budgetOpeningCents: financeAccounts.budgetOpeningCents,
        })
        .from(financeAccounts)
        .where(
          and(eq(financeAccounts.userId, userId), eq(financeAccounts.offBudget, false)),
        )
        .orderBy(financeAccounts.name);

      const accounts: OpeningCutoverAccount[] = [];
      for (const account of onBudget) {
        const registerImpliedCents = await openingPositionFor(
          userId,
          startMonth,
          [account.id],
          tx,
        );
        if (account.budgetOpeningCents !== null) {
          accounts.push({
            accountId: account.id,
            name: account.name,
            kind: account.kind,
            recordedCents: account.budgetOpeningCents,
            seed: null,
            statementPeriod: null,
            crossingRows: [],
            openingCents: account.budgetOpeningCents,
            registerImpliedCents,
            mismatchCents: registerImpliedCents - account.budgetOpeningCents,
          });
          continue;
        }
        const statement = anchorStatement(
          await statementsOf(tx, userId, account.id),
          dayKey,
        );
        const rows = statement
          ? await rowsNearClose(tx, userId, account.id, statement.periodEnd, dayKey)
          : [];
        const seed = seedAccountOpening(
          statement ? { statement, rows } : null,
          dayKey,
          registerImpliedCents,
        );
        accounts.push({
          accountId: account.id,
          name: account.name,
          kind: account.kind,
          recordedCents: null,
          seed,
          statementPeriod: statement
            ? { start: statement.periodStart, end: statement.periodEnd }
            : null,
          crossingRows: statement
            ? rows.flatMap((row): CrossingRow[] => {
                const sign = crossingSign(row, statement.periodEnd, dayKey);
                return sign === 0 ? [] : [{ ...row, sign }];
              })
            : [],
          openingCents: seed.openingCents,
          registerImpliedCents,
          mismatchCents: registerImpliedCents - seed.openingCents,
        });
      }

      const seeded = accounts.filter((account) => account.seed !== null);
      if (seeded.length === 0) {
        const receipt: OpeningCutoverReceipt = {
          startMonth,
          dayKey,
          legacyOpeningCents: beforeData.settings.openingCents,
          accounts,
          seededCount: 0,
          accountPoolCents: beforeData.accountPoolCents,
          unmatchedTransferCents: beforeData.mismatch.unmatchedTransferCents,
          before,
          after: before,
        };
        if (options.dryRun) throw new DryRunRollback(receipt);
        return receipt;
      }

      const auditScope = {
        accountIds: seeded.map((account) => account.accountId),
        accountNames: seeded.map((account) => account.name),
        budgetMonths: [startMonth],
      };
      const beforeCheckpoint = await captureFinanceMoneyCheckpoint(
        userId,
        auditScope,
        tx,
      );

      for (const account of seeded) {
        // `is null` in the predicate as well: a concurrent membership change that seeded the
        // account first wins, and this run fails loudly instead of overwriting it.
        const [updated] = await tx
          .update(financeAccounts)
          .set({ budgetOpeningCents: account.openingCents, updatedAt: new Date() })
          .where(
            and(
              eq(financeAccounts.id, account.accountId),
              eq(financeAccounts.userId, userId),
              isNull(financeAccounts.budgetOpeningCents),
            ),
          )
          .returning({ id: financeAccounts.id });
        if (!updated)
          throw new Error(`${account.name} was seeded while the cutover ran.`);
      }
      const openingTotal = accounts.reduce(
        (sum, account) => sum + account.openingCents,
        0,
      );
      // The legacy total is no longer read once every account is seeded; writing the sum keeps
      // it from contradicting the openings it was a stand-in for.
      await writeOpeningCents(tx, userId, startMonth, openingTotal);

      const afterData = await load(tx);
      const after = snapshotOf(afterData);
      assertLedgerIdentity(after);
      if (after.openingCents !== openingTotal) {
        throw new Error(
          `Cutover aborted: the fold opened at ${after.openingCents}, not the seeded total ${openingTotal}.`,
        );
      }
      const openingDelta = after.openingCents - before.openingCents;
      if (after.readyToAssignCents - before.readyToAssignCents !== openingDelta) {
        throw new Error(
          `Cutover aborted: Ready to Assign moved ${after.readyToAssignCents - before.readyToAssignCents}, but the opening moved ${openingDelta}.`,
        );
      }
      const shownMismatch = new Map(
        afterData.mismatch.accounts.map((row) => [row.accountId, row.mismatchCents]),
      );
      for (const account of accounts) {
        if (shownMismatch.get(account.accountId) !== account.mismatchCents) {
          throw new Error(
            `Cutover aborted: ${account.name}'s mismatch reads ${shownMismatch.get(account.accountId)} on the Budget card, not ${account.mismatchCents}.`,
          );
        }
      }

      const afterCheckpoint = await captureFinanceMoneyCheckpoint(
        userId,
        auditScope,
        tx,
      );
      await writeFinanceAuditEvent(tx, userId, {
        kind: "budget_opening_cutover",
        origin: "Ledger opening cutover",
        summary: `Seeded ${seeded.length} account opening${seeded.length === 1 ? "" : "s"}; opening ${before.openingCents} → ${after.openingCents}.`,
        scope: auditScope,
        beforeCheckpoint,
        afterCheckpoint,
        changes: seeded.map((account) => ({
          entityType: "account",
          entityIdentity: account.accountId,
          before: { budgetOpeningCents: null },
          after: {
            budgetOpeningCents: account.openingCents,
            seededFrom: account.seed ? openingSeedLabel(account.seed) : null,
            registerImpliedCents: account.registerImpliedCents,
          },
        })),
      });

      const receipt: OpeningCutoverReceipt = {
        startMonth,
        dayKey,
        legacyOpeningCents: beforeData.settings.openingCents,
        accounts,
        seededCount: seeded.length,
        accountPoolCents: afterData.accountPoolCents,
        unmatchedTransferCents: afterData.mismatch.unmatchedTransferCents,
        before,
        after,
      };
      if (options.dryRun) throw new DryRunRollback(receipt);
      return receipt;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.receipt;
    throw error;
  }
}
