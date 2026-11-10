/**
 * Alert holds yield to the history feed, or are flagged — never deleted by absence
 * (`agent-os/specs/2026-10-03-1500-card-holds-from-alert-emails/` D2, D3).
 *
 * Called inside the SimpleFIN sync's transaction (and after an alert lands), for the same
 * reason the browser handover is: a hold must stop existing in the commit that makes its
 * successor authoritative.
 */

import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { shiftDateKey } from "@/lib/schedule/geometry";
import { financeTransactions } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";
import { ALERT_FEEDS } from "./alertEmail";
import type { FinanceAuditChange } from "./audit/types";
import { SCRAPE_FEEDS } from "./bankSnapshot";
import type { FinanceExecutor } from "./dbExecutor";
import { carryableFields, type CarriedState } from "./feedHandover";
import { retireRowsOntoOtherSources } from "./feedHandoverWrite";
import { LOST_HOLD_TOLERANCE_DAYS, resolveLostHold } from "./feedPairing";
import { numericStringToCents } from "./money";
import { bankRows } from "./splitRows";

export type AlertHoldResult = {
  retired: number;
  carried: number;
  /** Holds with no successor after `LOST_HOLD_TOLERANCE_DAYS`, flagged for review. */
  flagged: number;
  warnings: string[];
  changes: FinanceAuditChange[];
};

/**
 * How old an alert hold must be before a row at a merely *near* amount may retire it.
 *
 * A bank page drops a hold when it resolves, and that absence is why a near-amount row can be
 * read as its successor at once. An alert hold is never seen to leave anything, and this
 * pass runs on every sync and every new alert — so for its first days the hold's own row
 * simply has not arrived, and whatever near-amount row is in the register is some other
 * purchase. Lee's holds post within three days (Friday's on Monday); the sync that brings
 * the row can be a day behind that.
 */
export const NEAR_AMOUNT_WAIT_DAYS = 4;

/**
 * Retire this account's alert holds onto the stored rows that succeeded them.
 *
 * First the ordinary pairing (exact amount, near date, overlapping wording). What it leaves
 * gets the lost-hold rule: an exact amount under any name at once, and — once the hold is
 * `NEAR_AMOUNT_WAIT_DAYS` old — the same merchant at a near amount or with a tip, because an
 * alert is an authorization and can post at whatever the merchant finally charged. A row the
 * first pass already used is not offered again. A hold still unpaired a week on is kept and
 * flagged.
 */
export async function retireAlertHolds(
  executor: FinanceExecutor,
  userId: string,
  accountId: string,
  todayKey: string,
): Promise<AlertHoldResult> {
  const exact = await retireRowsOntoOtherSources(
    executor,
    userId,
    accountId,
    ALERT_FEEDS,
    { pendingOnly: true, successorsOnly: true },
  );
  const result: AlertHoldResult = {
    retired: exact.retired,
    carried: exact.carried,
    flagged: 0,
    warnings: [...exact.warnings],
    changes: [...exact.changes],
  };

  const holds = await executor
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      isParent: financeTransactions.isParent,
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
        bankRows,
        eq(financeTransactions.pending, true),
        inArray(financeTransactions.externalSource, [...ALERT_FEEDS]),
      ),
    );
  if (holds.length === 0) return result;

  const earliest = holds.reduce(
    (min, hold) => (hold.transactionDate < min ? hold.transactionDate : min),
    holds[0].transactionDate,
  );
  const posted = await executor
    .select({
      id: financeTransactions.id,
      transactionDate: financeTransactions.transactionDate,
      postedDate: financeTransactions.postedDate,
      description: financeTransactions.description,
      amount: financeTransactions.amount,
      budgetCategoryId: financeTransactions.budgetCategoryId,
      notes: financeTransactions.notes,
      flowOverride: financeTransactions.flowOverride,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        bankRows,
        eq(financeTransactions.pending, false),
        sql`${financeTransactions.externalSource} is not null`,
        notInArray(financeTransactions.externalSource, [
          ...ALERT_FEEDS,
          ...SCRAPE_FEEDS,
        ]),
        sql`coalesce(${financeTransactions.postedDate}, ${financeTransactions.transactionDate}) >= ${shiftDateKey(earliest, -LOST_HOLD_TOLERANCE_DAYS)}`,
      ),
    );

  const taken = new Set(exact.replacementIds);
  const stateById = new Map<string, CarriedState>(
    posted.map((row) => [
      row.id,
      {
        budgetCategoryId: row.budgetCategoryId,
        notes: row.notes,
        flowOverride: row.flowOverride,
      },
    ]),
  );
  const flagBefore = shiftDateKey(todayKey, -LOST_HOLD_TOLERANCE_DAYS);
  const nearAmountBefore = shiftDateKey(todayKey, -NEAR_AMOUNT_WAIT_DAYS);

  // Oldest hold first, so the same input always pairs the same way.
  for (const hold of [...holds].sort(
    (a, b) =>
      a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id),
  )) {
    const candidates = posted
      .filter((row) => !taken.has(row.id))
      .map((row) => ({
        id: row.id,
        transactionDate: row.transactionDate,
        postedDate: row.postedDate,
        description: row.description,
        amountCents: numericStringToCents(row.amount) ?? 0,
      }));
    const resolution = hold.isParent
      ? ({ outcome: "none" } as const)
      : resolveLostHold(
          {
            id: hold.id,
            transactionDate: hold.transactionDate,
            postedDate: hold.postedDate,
            description: hold.description,
            amountCents: numericStringToCents(hold.amount) ?? 0,
          },
          candidates,
          {
            successorsOnly: true,
            exactOnly: hold.transactionDate > nearAmountBefore,
          },
        );

    if (resolution.outcome === "carry") {
      taken.add(resolution.postedId);
      const successorState = stateById.get(resolution.postedId);
      if (!successorState) {
        throw new Error(
          `alert hold ${hold.id} paired with a row outside its candidates`,
        );
      }
      const carry = carryableFields(hold, successorState);
      if (Object.keys(carry).length > 0) {
        await executor
          .update(financeTransactions)
          .set({ ...carry, updatedAt: new Date() })
          .where(ownedRow(financeTransactions, resolution.postedId, userId));
        result.carried += 1;
        result.changes.push({
          entityType: "transaction",
          entityIdentity: resolution.postedId,
          before: { carriedFrom: null },
          after: { carriedFrom: hold.id, ...carry },
        });
      }
      await executor
        .delete(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeTransactions.id, hold.id),
            isNull(financeTransactions.parentId),
          ),
        );
      result.retired += 1;
      result.changes.push({
        entityType: "transaction",
        entityIdentity: hold.id,
        before: {
          transactionDate: hold.transactionDate,
          amountCents: numericStringToCents(hold.amount) ?? 0,
          pending: true,
        },
        after: null,
      });
      continue;
    }

    if (hold.transactionDate <= flagBefore && hold.unlistedAt === null) {
      await executor
        .update(financeTransactions)
        .set({ unlistedAt: new Date(), updatedAt: new Date() })
        .where(ownedRow(financeTransactions, hold.id, userId));
      result.flagged += 1;
      result.warnings.push(
        resolution.outcome === "ambiguous"
          ? `Kept alert hold "${hold.description}" (${hold.transactionDate}): several posted rows could be its successor.`
          : `Kept alert hold "${hold.description}" (${hold.transactionDate}): nothing posted for it within ${LOST_HOLD_TOLERANCE_DAYS} days; flagged for review.`,
      );
      result.changes.push({
        entityType: "transaction",
        entityIdentity: hold.id,
        before: { unlisted: false },
        after: { unlisted: true },
      });
    }
  }
  return result;
}
