import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeTransactions,
  type FinanceAccountKind,
  type FinanceFlowKind,
} from "@/db/schema";
import { changedRows, planReclassify } from "./classify/reclassify";
import { numericStringToCents } from "./money";

/**
 * Writes for the register.
 *
 * Every mutation takes `userId` first and scopes on it, and every one of them proves the row
 * was theirs before touching it — an update whose `where` matches nothing is indistinguishable
 * from a successful no-op unless you check, and that is exactly how a cross-user write slips
 * through unnoticed.
 *
 * Note what is *not* here: nothing edits a transaction's date, description or amount. Those
 * are what the bank said, and the fingerprint that dedups re-imports is built from them —
 * editing one would make the next import treat the row as new. Categorising and annotating
 * are the user's half; the bank's half stays as the bank wrote it.
 */

async function requireTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Transaction not found.");
}

async function requireAccount(userId: string, accountId: string): Promise<void> {
  const [row] = await db
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Account not found.");
}

export type TransactionEdit = {
  /** Null clears it back to uncategorised. */
  category?: string | null;
  notes?: string;
  /** Null defers to the classifier again. */
  flowOverride?: FinanceFlowKind | null;
  excludeFromBaseline?: boolean;
  eventLabel?: string;
};

/**
 * Edit the user-owned half of a transaction.
 *
 * Everything settable here survives a reclassify — that is the point of the derived/override
 * split. `flowOverride` sits beside `derivedFlow` rather than replacing it so pressing
 * Reclassify twice cannot quietly undo a correction someone made by hand.
 */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  edit: TransactionEdit,
): Promise<void> {
  await requireTransaction(userId, transactionId);

  const values: {
    category?: string | null;
    notes?: string;
    flowOverride?: FinanceFlowKind | null;
    excludeFromBaseline?: boolean;
    eventLabel?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (edit.category !== undefined) {
    // A blank string and "uncategorised" are the same thing to a person, so store one of
    // them. Null is the uncategorised value, matching the nullable column.
    const trimmed = edit.category === null ? null : edit.category.trim();
    values.category = trimmed === "" ? null : trimmed;
  }
  if (edit.notes !== undefined) values.notes = edit.notes;
  if (edit.flowOverride !== undefined) values.flowOverride = edit.flowOverride;
  if (edit.excludeFromBaseline !== undefined) {
    values.excludeFromBaseline = edit.excludeFromBaseline;
  }
  if (edit.eventLabel !== undefined) values.eventLabel = edit.eventLabel.trim();

  await db
    .update(financeTransactions)
    .set(values)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    );
}

/**
 * Delete one transaction.
 *
 * The row will come back on the next import of a file that contains it — the fingerprint it
 * was stored under is derived from the file's content, not remembered here. That is the
 * right behaviour for the case this exists for (a pending-then-posted amount change left a
 * stale twin) and worth knowing about for any other use.
 */
export async function deleteTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  await requireTransaction(userId, transactionId);
  await db
    .delete(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    );
}

export type AccountEdit = {
  name?: string;
  kind?: FinanceAccountKind;
  institution?: string;
};

/**
 * Rename or reclassify an account.
 *
 * Safe to do freely: the importer matches on `(externalSource, externalKey)`, never the
 * name, so renaming "Chase •••9910" to "Sapphire" does not orphan its history or cause the
 * next import to create a second account.
 */
export async function updateAccount(
  userId: string,
  accountId: string,
  edit: AccountEdit,
): Promise<void> {
  await requireAccount(userId, accountId);

  const values: {
    name?: string;
    kind?: FinanceAccountKind;
    institution?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (edit.name !== undefined) {
    const trimmed = edit.name.trim();
    if (trimmed === "") throw new Error("An account needs a name.");
    values.name = trimmed;
  }
  if (edit.kind !== undefined) values.kind = edit.kind;
  if (edit.institution !== undefined) values.institution = edit.institution.trim();

  await db
    .update(financeAccounts)
    .set(values)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)));
}

/**
 * How many rows one `update ... from (values ...)` carries.
 *
 * The first reclassify of a three-year history rewrites a few thousand rows; sending them
 * one statement each is thousands of round trips for a button press. Every run after that
 * writes only what changed, which is usually nothing.
 */
const RECLASSIFY_CHUNK = 250;

export type ReclassifySummary = {
  scanned: number;
  /** Rows whose derived values actually moved. Zero on a second run — see the test. */
  updated: number;
  paydayCount: number;
  medianPaycheckCents: number;
  normalizedMonthlyIncomeCents: number;
};

/**
 * Recompute every derived classification for one user, from scratch.
 *
 * **This must never change an account balance.** A balance is `sum(amount)` and nothing here
 * touches `amount`, so a reclassify that moves one is a bug by construction — which makes it
 * the sharpest test available for this whole layer, and it is written down as one.
 *
 * Only `derived_*` and `transfer_group_id` are written. `category`, `flow_override`,
 * `exclude_from_baseline` and `event_label` belong to the user and are not in the update
 * statement at all, so no amount of re-running can erase a correction.
 */
export async function reclassifyTransactions(
  userId: string,
): Promise<ReclassifySummary> {
  const [rows, accounts] = await Promise.all([
    db
      .select({
        id: financeTransactions.id,
        accountId: financeTransactions.accountId,
        transactionDate: financeTransactions.transactionDate,
        description: financeTransactions.description,
        amount: financeTransactions.amount,
        sourceCategory: financeTransactions.sourceCategory,
        transferGroupId: financeTransactions.transferGroupId,
        derivedCategory: financeTransactions.derivedCategory,
        derivedFlow: financeTransactions.derivedFlow,
      })
      .from(financeTransactions)
      .where(eq(financeTransactions.userId, userId)),
    db
      .select({
        id: financeAccounts.id,
        externalKey: financeAccounts.externalKey,
      })
      .from(financeAccounts)
      .where(eq(financeAccounts.userId, userId)),
  ]);

  const parsed = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    description: row.description,
    amountCents: numericStringToCents(row.amount) ?? 0,
    sourceCategory: row.sourceCategory,
    transferGroupId: row.transferGroupId,
    derivedCategory: row.derivedCategory,
    derivedFlow: row.derivedFlow,
  }));

  const plan = planReclassify(parsed, accounts, randomUUID);
  const changed = changedRows(parsed, plan);

  if (changed.length > 0) {
    await db.transaction(async (tx) => {
      for (let start = 0; start < changed.length; start += RECLASSIFY_CHUNK) {
        const chunk = changed.slice(start, start + RECLASSIFY_CHUNK);
        const values = sql.join(
          chunk.map(
            (row) =>
              sql`(${row.id}::uuid, ${row.derivedCategory}::text, ${row.derivedFlow}::finance_flow_kind, ${row.transferGroupId}::uuid)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          update ${financeTransactions} as t
          set derived_category = v.derived_category,
              derived_flow = v.derived_flow,
              transfer_group_id = v.transfer_group_id,
              updated_at = now()
          from (values ${values}) as v(id, derived_category, derived_flow, transfer_group_id)
          where t.id = v.id and t.user_id = ${userId}::uuid
        `);
      }
    });
  }

  return {
    scanned: rows.length,
    updated: changed.length,
    paydayCount: plan.paydays.length,
    medianPaycheckCents: plan.medianPaycheckCents,
    normalizedMonthlyIncomeCents: plan.normalizedMonthlyIncomeCents,
  };
}

/**
 * Flag or unflag a set of transactions as one-off spending, optionally naming the event.
 *
 * Bulk, because the review flow confirms a screen of suggestions at once — and never
 * automatic: an annual insurance premium looks exactly like a one-off to any statistic, and
 * excluding it every year would quietly understate what a year costs.
 */
export async function setOneOff(
  userId: string,
  transactionIds: readonly string[],
  edit: { excludeFromBaseline: boolean; eventLabel?: string },
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const owned = await db
    .select({ id: financeTransactions.id })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.id, [...transactionIds]),
      ),
    );
  if (owned.length !== transactionIds.length) throw new Error("Transaction not found.");

  const values: {
    excludeFromBaseline: boolean;
    eventLabel?: string;
    updatedAt: Date;
  } = { excludeFromBaseline: edit.excludeFromBaseline, updatedAt: new Date() };
  // Clearing the flag clears the label with it: an event name on a row that is back in the
  // baseline would show up in the events breakdown with nothing behind it.
  if (edit.eventLabel !== undefined) values.eventLabel = edit.eventLabel.trim();
  else if (!edit.excludeFromBaseline) values.eventLabel = "";

  await db
    .update(financeTransactions)
    .set(values)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.id, [...transactionIds]),
      ),
    );

  return owned.length;
}

/** Delete an account and, by cascade, every transaction on it. */
export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  await requireAccount(userId, accountId);
  await db
    .delete(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)));
}
