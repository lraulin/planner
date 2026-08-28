/**
 * One-time cutover from the three parallel commitment tables to bill envelopes.
 *
 * `agent-os/specs/2026-08-23-2313-one-budget/` collapses `finance_recurring_bills`,
 * `finance_recurring_spend` and `finance_schedules` into `finance_budget_categories` — a bill
 * is an envelope with `kind = 'bill'`. This module is the guarded, previewed, re-runnable
 * write that gets a real user's data from the old shape to the new one before those tables are
 * dropped, following the same audit → apply → audit shape as `rules/cutover.ts`.
 *
 * **The three old tables are read with raw `sql`, not Drizzle's typed query builder.** They
 * are already gone from `schema.ts` — this script runs once, against a database that still has
 * them, and then they are dropped. Adding them back to the schema just for this file would be
 * exactly the kind of dead weight `clean-code.md` warns against.
 *
 * **What this does not invent.** A pre-existing generic "Bills" envelope with money already
 * assigned to it is renamed and stripped of its now-invalid schedule templates, but its
 * Assigned figure is left alone — there is no way to know how a lump sum was meant to split
 * across the individual bills that are about to exist, and guessing would be worse than asking.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeBudgetCategories,
  financePayees,
  type EnvelopeStatus,
} from "@/db/schema";
import * as sortKeyLib from "@/lib/tree/sortKey";
import type { Target } from "./targets/types";

type OldBillRow = {
  id: string;
  name: string;
  status: string;
  cancelledOn: string | null;
  url: string;
  cadenceMonths: number;
  cadenceDays: number | null;
  expectedCents: number | null;
  anchorDate: string | null;
  scheduled: boolean;
  dueDay: number | null;
  notes: string;
};

type OldSpendRow = {
  id: string;
  name: string;
  period: string;
  amountSource: string;
  expectedCents: number | null;
  active: boolean;
  notes: string;
};

type OldPayeeClaim = { payeeId: string; billId: string | null; spendId: string | null };

async function loadOldBills(userId: string): Promise<OldBillRow[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    status: string;
    cancelled_on: string | null;
    url: string;
    cadence_months: number;
    cadence_days: number | null;
    expected_cents: number | null;
    anchor_date: string | null;
    scheduled: boolean;
    due_day: number | null;
    notes: string;
  }>(sql`
    select id, name, status, cancelled_on, url, cadence_months, cadence_days,
           expected_cents, anchor_date, scheduled, due_day, notes
      from finance_recurring_bills
     where user_id = ${userId}
     order by name
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    cancelledOn: row.cancelled_on,
    url: row.url,
    cadenceMonths: row.cadence_months,
    cadenceDays: row.cadence_days,
    expectedCents: row.expected_cents,
    anchorDate: row.anchor_date,
    scheduled: row.scheduled,
    dueDay: row.due_day,
    notes: row.notes,
  }));
}

async function loadOldSpend(userId: string): Promise<OldSpendRow[]> {
  const rows = await db.execute<{
    id: string;
    name: string;
    period: string;
    amount_source: string;
    expected_cents: number | null;
    active: boolean;
    notes: string;
  }>(sql`
    select id, name, period, amount_source, expected_cents, active, notes
      from finance_recurring_spend
     where user_id = ${userId}
     order by name
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    period: row.period,
    amountSource: row.amount_source,
    expectedCents: row.expected_cents,
    active: row.active,
    notes: row.notes,
  }));
}

async function loadOldClaims(userId: string): Promise<OldPayeeClaim[]> {
  const rows = await db.execute<{
    payee_id: string;
    commitment_bill_id: string | null;
    commitment_spend_id: string | null;
  }>(sql`
    select id as payee_id, commitment_bill_id, commitment_spend_id
      from finance_payees
     where user_id = ${userId}
       and (commitment_bill_id is not null or commitment_spend_id is not null)
  `);
  return rows.map((row) => ({
    payeeId: row.payee_id,
    billId: row.commitment_bill_id,
    spendId: row.commitment_spend_id,
  }));
}

/**
 * Median weekly total, empty weeks counting as zero — the same rule the retired
 * `recurringSpendRate` used, over the whole history on file rather than a lookback window,
 * since this runs once and there is no live "current period" to exclude.
 */
async function medianWeeklyRateCents(
  userId: string,
  payeeIds: readonly string[],
): Promise<number> {
  if (payeeIds.length === 0) return 0;
  const rows = await db.execute<{ transaction_date: string; amount: string }>(sql`
    select transaction_date, amount
      from finance_transactions
     where user_id = ${userId}
       and payee_id in (${sql.join(
         payeeIds.map((id) => sql`${id}`),
         sql`, `,
       )})
  `);
  if (rows.length === 0) return 0;

  const EPOCH = "2024-01-01";
  const weekIndexOf = (dateKey: string): number => {
    const ms = Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`);
    return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
  };

  const totals = new Map<number, number>();
  let minWeek = Infinity;
  let maxWeek = -Infinity;
  for (const row of rows) {
    const dateKey = row.transaction_date.slice(0, 10);
    const week = weekIndexOf(dateKey);
    minWeek = Math.min(minWeek, week);
    maxWeek = Math.max(maxWeek, week);
    const cents = -Math.round(Number(row.amount) * 100);
    if (cents <= 0) continue;
    totals.set(week, (totals.get(week) ?? 0) + cents);
  }
  for (let week = minWeek; week <= maxWeek; week++) {
    if (!totals.has(week)) totals.set(week, 0);
  }
  const values = [...totals.values()].sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : Math.round((values[middle - 1] + values[middle]) / 2);
}

export type CutoverReceipt = {
  billsMigrated: { name: string; envelopeId: string; cadenceMonths: number }[];
  spendMigrated: { name: string; envelopeId: string; monthlyCents: number }[];
  claimsRewritten: number;
  renamedCatchAll: { from: string; to: string } | null;
};

/**
 * Last sort key at the spending section root.
 *
 * The cutover used to land everything in the seeded "Spending" group. Groups now state their
 * own section (`agent-os/specs/2026-08-28-1613-group-kind/`) and that chrome group is gone, so
 * the envelopes this creates sit at the section root — where a fresh budget puts them too.
 */
async function lastSortKey(userId: string): Promise<string | null> {
  const rows = await db
    .select({ sortKey: financeBudgetCategories.sortKey })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        isNull(financeBudgetCategories.groupId),
      ),
    );
  return (
    rows
      .map((row) => row.sortKey)
      .sort((left, right) => sortKeyLib.compare(right, left))[0] ?? null
  );
}

class DryRunRollback extends Error {
  constructor(public receipt: CutoverReceipt) {
    super("dry run");
  }
}

/**
 * Move the old commitment tables' data onto bill envelopes, in one transaction.
 *
 * Re-runnable: a bill or spend group whose name already has a `kind = 'bill'` (or matching
 * ordinary) envelope in the target group is skipped rather than duplicated, so a second run
 * after a partial failure does not double every row.
 *
 * `dryRun` runs the exact same transaction — the same reads, the same inserts and updates,
 * the same computed rates — and then throws to roll every write back before it commits. A
 * hand-written preview that re-implements the plan in a second function is the thing that
 * drifts from what apply actually does; rolling back the real transaction cannot drift.
 */
export async function applyCommitmentsCutover(
  userId: string,
  options: { dryRun?: boolean } = {},
): Promise<CutoverReceipt> {
  try {
    return await db.transaction(async (tx) => {
      const [bills, spend, claims] = await Promise.all([
        loadOldBills(userId),
        loadOldSpend(userId),
        loadOldClaims(userId),
      ]);

      let cursor = await lastSortKey(userId);
      const nextSortKey = () => {
        cursor = cursor === null ? sortKeyLib.first() : sortKeyLib.after(cursor);
        return cursor;
      };

      const billEnvelopeIdByOldId = new Map<string, string>();
      const billsMigrated: CutoverReceipt["billsMigrated"] = [];

      for (const bill of bills) {
        const [existing] = await tx
          .select({ id: financeBudgetCategories.id })
          .from(financeBudgetCategories)
          .where(
            and(
              eq(financeBudgetCategories.userId, userId),
              isNull(financeBudgetCategories.groupId),
              eq(financeBudgetCategories.name, bill.name),
              eq(financeBudgetCategories.kind, "bill"),
            ),
          )
          .limit(1);
        if (existing) {
          billEnvelopeIdByOldId.set(bill.id, existing.id);
          continue;
        }

        const [created] = await tx
          .insert(financeBudgetCategories)
          .values({
            userId,
            groupId: null,
            name: bill.name,
            sortKey: nextSortKey(),
            kind: "bill",
            status: bill.status as EnvelopeStatus,
            cancelledOn: bill.cancelledOn,
            url: bill.url,
            cadenceMonths: bill.cadenceMonths,
            cadenceDays: bill.cadenceDays,
            dueDay: bill.dueDay,
            anchorDate: bill.anchorDate,
            scheduled: bill.scheduled,
            expectedCents: bill.expectedCents,
            notes: bill.notes,
          })
          .returning({ id: financeBudgetCategories.id });
        if (!created)
          throw new Error(`Could not create the bill envelope for "${bill.name}".`);
        billEnvelopeIdByOldId.set(bill.id, created.id);
        billsMigrated.push({
          name: bill.name,
          envelopeId: created.id,
          cadenceMonths: bill.cadenceMonths,
        });
      }

      const spendEnvelopeIdByOldId = new Map<string, string>();
      const spendMigrated: CutoverReceipt["spendMigrated"] = [];

      for (const entry of spend) {
        const [existing] = await tx
          .select({
            id: financeBudgetCategories.id,
            target: financeBudgetCategories.target,
          })
          .from(financeBudgetCategories)
          .where(
            and(
              eq(financeBudgetCategories.userId, userId),
              isNull(financeBudgetCategories.groupId),
              eq(financeBudgetCategories.name, entry.name),
              eq(financeBudgetCategories.kind, "spending"),
            ),
          )
          .limit(1);

        const claimedPayeeIds = claims
          .filter((claim) => claim.spendId === entry.id)
          .map((claim) => claim.payeeId);
        const rateCents =
          entry.amountSource === "pinned" && entry.expectedCents !== null
            ? entry.expectedCents
            : await medianWeeklyRateCents(userId, claimedPayeeIds);
        const monthlyCents =
          entry.period === "week" ? Math.round((rateCents * 52) / 12) : rateCents;

        let envelopeId: string;
        if (existing) {
          envelopeId = existing.id;
          if (existing.target == null && monthlyCents > 0) {
            const target: Target = {
              behavior: "add",
              cadence: { unit: "month", day: 31 },
              amountCents: monthlyCents,
            };
            await tx
              .update(financeBudgetCategories)
              .set({
                target,
                updatedAt: new Date(),
              })
              .where(eq(financeBudgetCategories.id, envelopeId));
          }
        } else {
          const target: Target | null =
            monthlyCents > 0
              ? {
                  behavior: "add",
                  cadence: { unit: "month", day: 31 },
                  amountCents: monthlyCents,
                }
              : null;
          const [created] = await tx
            .insert(financeBudgetCategories)
            .values({
              userId,
              groupId: null,
              name: entry.name,
              sortKey: nextSortKey(),
              kind: "spending",
              notes: entry.notes,
              target,
            })
            .returning({ id: financeBudgetCategories.id });
          if (!created) {
            throw new Error(`Could not create the envelope for "${entry.name}".`);
          }
          envelopeId = created.id;
        }
        spendEnvelopeIdByOldId.set(entry.id, envelopeId);
        spendMigrated.push({ name: entry.name, envelopeId, monthlyCents });
      }

      let claimsRewritten = 0;
      for (const claim of claims) {
        const newEnvelopeId = claim.billId
          ? billEnvelopeIdByOldId.get(claim.billId)
          : claim.spendId
            ? spendEnvelopeIdByOldId.get(claim.spendId)
            : undefined;
        if (!newEnvelopeId) continue;
        await tx
          .update(financePayees)
          .set({ claimedBudgetCategoryId: newEnvelopeId, updatedAt: new Date() })
          .where(
            and(eq(financePayees.id, claim.payeeId), eq(financePayees.userId, userId)),
          );
        claimsRewritten++;
      }

      // The pre-existing catch-all "Bills" envelope (if any) held stacked
      // `{type: "schedule"}` template lines pointing at schedules that are about to be
      // dropped. Renamed and stripped rather than deleted, because its Assigned figure for
      // the current month is real money the fold already counted, and there is no rule that
      // says how a lump sum should split across the bills that now exist separately.
      let renamedCatchAll: CutoverReceipt["renamedCatchAll"] = null;
      const [catchAll] = await tx
        .select({
          id: financeBudgetCategories.id,
          target: financeBudgetCategories.target,
        })
        .from(financeBudgetCategories)
        .where(
          and(
            eq(financeBudgetCategories.userId, userId),
            isNull(financeBudgetCategories.groupId),
            eq(financeBudgetCategories.name, "Bills"),
            eq(financeBudgetCategories.kind, "spending"),
          ),
        )
        .limit(1);
      if (catchAll) {
        // Not `parseTemplates`: it no longer recognises `"schedule"` (D4 retired the type),
        // so it would reject the whole array and silently report zero schedule lines here —
        // exactly the case this check exists to catch. Inspect the raw JSON instead.
        const hadScheduleTemplates =
          catchAll.target !== null &&
          typeof catchAll.target === "object" &&
          !Array.isArray(catchAll.target) &&
          (catchAll.target as { cadence?: { unit?: unknown } }).cadence?.unit ===
            "schedule";
        if (hadScheduleTemplates) {
          await tx
            .update(financeBudgetCategories)
            .set({ name: "Other bills", target: null, updatedAt: new Date() })
            .where(eq(financeBudgetCategories.id, catchAll.id));
          renamedCatchAll = { from: "Bills", to: "Other bills" };
        }
      }

      const receipt = {
        billsMigrated,
        spendMigrated,
        claimsRewritten,
        renamedCatchAll,
      };
      if (options.dryRun) throw new DryRunRollback(receipt);
      return receipt;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.receipt;
    throw error;
  }
}
