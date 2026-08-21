import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financePaymentResolutions,
  financeRecurringBills,
  financeRecurringSpend,
  financeTransactions,
  type CommitmentStatus,
  type FinanceAccountKind,
  type FinanceFlowKind,
  type RecurringSpendAmountSource,
  type RecurringSpendPeriod,
} from "@/db/schema";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { parseAccountUrl } from "./accountUrl";
import { changedRows, planReclassify } from "./classify/reclassify";
import { MatcherConflictError } from "./commitments";
import { cadenceColumns, cadenceOf, type Cadence } from "./recurringBills";
import { numericStringToCents } from "./money";
import type { PaypalResolution } from "./paypalMatch";

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

function closedAtFromKey(key: string | null): Date | null {
  if (key === null) return null;
  const trimmed = key.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Closed date must be YYYY-MM-DD.");
  }
  const date = fromDateKey(trimmed);
  if (toDateKey(date) !== trimmed) {
    throw new Error("Closed date must be YYYY-MM-DD.");
  }
  return date;
}

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
  /** Declares a savings withdrawal to be what the money was saved for. */
  plannedWithdrawal?: boolean;
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
    plannedWithdrawal?: boolean;
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
  if (edit.plannedWithdrawal !== undefined) {
    values.plannedWithdrawal = edit.plannedWithdrawal;
  }

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

async function requirePaymentResolution(
  userId: string,
  resolutionId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: financePaymentResolutions.id })
    .from(financePaymentResolutions)
    .where(
      and(
        eq(financePaymentResolutions.id, resolutionId),
        eq(financePaymentResolutions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Payment resolution not found.");
}

/**
 * Correct the counterparty a statement named. Date and amount stay as PayPal wrote them
 * — those are the match key, and rewriting them would silently remarry the row.
 */
export async function updatePaymentResolution(
  userId: string,
  resolutionId: string,
  edit: { counterparty: string },
): Promise<void> {
  await requirePaymentResolution(userId, resolutionId);
  await db
    .update(financePaymentResolutions)
    .set({ counterparty: edit.counterparty.trim(), updatedAt: new Date() })
    .where(
      and(
        eq(financePaymentResolutions.id, resolutionId),
        eq(financePaymentResolutions.userId, userId),
      ),
    );
}

export async function deletePaymentResolution(
  userId: string,
  resolutionId: string,
): Promise<void> {
  await requirePaymentResolution(userId, resolutionId);
  await db
    .delete(financePaymentResolutions)
    .where(
      and(
        eq(financePaymentResolutions.id, resolutionId),
        eq(financePaymentResolutions.userId, userId),
      ),
    );
}

export type AccountEdit = {
  name?: string;
  kind?: FinanceAccountKind;
  institution?: string;
  url?: string;
  /**
   * Calendar day the account closed (`YYYY-MM-DD`), or `null` to reopen.
   * Import still never un-closes; this is the user-owned write.
   */
  closedOn?: string | null;
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
    url?: string;
    closedAt?: Date | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (edit.name !== undefined) {
    const trimmed = edit.name.trim();
    if (trimmed === "") throw new Error("An account needs a name.");
    values.name = trimmed;
  }
  if (edit.kind !== undefined) values.kind = edit.kind;
  if (edit.institution !== undefined) values.institution = edit.institution.trim();
  if (edit.url !== undefined) {
    const parsed = parseAccountUrl(edit.url);
    if (parsed === null) throw new Error("That is not an https URL.");
    values.url = parsed;
  }
  if (edit.closedOn !== undefined) {
    values.closedAt = closedAtFromKey(edit.closedOn);
  }

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
  const [rows, accounts, storedResolutions, billCategories, spendCategories] =
    await Promise.all([
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
      db
        .select({
          externalId: financePaymentResolutions.externalId,
          transactionDate: financePaymentResolutions.transactionDate,
          amount: financePaymentResolutions.amount,
          counterparty: financePaymentResolutions.counterparty,
          direction: financePaymentResolutions.direction,
        })
        .from(financePaymentResolutions)
        .where(eq(financePaymentResolutions.userId, userId)),
      db
        .select({
          matchers: financeRecurringBills.matchers,
          category: financeRecurringBills.category,
        })
        .from(financeRecurringBills)
        .where(eq(financeRecurringBills.userId, userId)),
      db
        .select({
          matchers: financeRecurringSpend.matchers,
          category: financeRecurringSpend.category,
        })
        .from(financeRecurringSpend)
        .where(eq(financeRecurringSpend.userId, userId)),
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

  const resolutions: PaypalResolution[] = storedResolutions.flatMap((row) => {
    const amountCents = numericStringToCents(row.amount);
    if (amountCents === null) return [];
    if (row.direction !== "in" && row.direction !== "out") return [];
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

  // A commitment's category outranks a `rules.ts` guess for every charge it matches, so the
  // whole map goes in and the plan decides per row. Both tiers, one map: the merchant strings
  // are exclusive across the two tables, so they cannot disagree.
  const commitmentCategories = new Map<string, string>();
  for (const row of [...billCategories, ...spendCategories]) {
    if (row.category === "") continue;
    for (const merchant of row.matchers)
      commitmentCategories.set(merchant, row.category);
  }

  const plan = planReclassify(
    parsed,
    accounts,
    randomUUID,
    resolutions,
    commitmentCategories,
  );
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

/**
 * Re-derive the categories on this user's history when a commitment changed what they are.
 *
 * A commitment's category outranks a `rules.ts` match for every charge it matches, so both
 * the category *and* the merchant list can move rows. `reclassifyTransactions` is a whole-
 * history pass, which sounds heavy for one edit and is not: `changedRows` diffs the plan
 * against what is stored, so an edit that moves nothing writes nothing.
 */
async function reclassifyIfCategoriesMoved(
  userId: string,
  before: { category: string; matchers: readonly string[] } | undefined,
  after: { category?: string; matchers?: readonly string[] },
): Promise<void> {
  const category = after.category?.trim() ?? before?.category ?? "";
  const categoryMoved =
    after.category !== undefined && after.category.trim() !== (before?.category ?? "");
  const matchersMoved =
    after.matchers !== undefined &&
    (before === undefined ||
      after.matchers.length !== before.matchers.length ||
      after.matchers.some((entry, index) => entry !== before.matchers[index]));

  if (!categoryMoved && !(matchersMoved && category !== "")) return;
  await reclassifyTransactions(userId);
}

export type RecurringBillEdit = {
  /** The user's name for the bill, and the upsert key. */
  name: string;
  /**
   * Bank merchant strings whose charges belong to this bill, as `effectiveMerchant()` produces
   * them. Omitted leaves the existing set alone — correcting a cadence must not silently
   * unclaim the merchants the declaration was built on.
   */
  matchers?: readonly string[];
  /** Whether it is still live. See `CommitmentStatus`. */
  status?: CommitmentStatus;
  /** When it was cancelled. Defaults to today when `status` becomes `cancelled`. */
  cancelledOn?: string | null;
  /** Where the bill is managed — account page, billing page, cancel page. */
  url?: string;
  /** How often it charges: whole months, or a fixed number of days. */
  cadence: Cadence;
  /**
   * A `FINANCE_CATEGORIES` value, or empty for none. Changing it recategorises the charges
   * this bill matches, so the caller reclassifies after writing.
   */
  category?: string;
  /** Null keeps the median of the charges on file as the amount. */
  expectedCents?: number | null;
  anchorDate?: string | null;
  notes?: string;
  /**
   * Whether the dates are predictable, as distinct from the cost. False for propane, whose
   * yearly figure is solid and whose delivery date is a tank sensor and the weather.
   */
  scheduled?: boolean;
  /** Day of the period the charge is expected, 1–31, or null to walk from the last charge. */
  dueDay?: number | null;
};

/**
 * Every merchant string this user has already claimed, and the commitment holding it.
 *
 * **The enforcement point for the one invariant Postgres cannot express.** A merchant may
 * belong to at most one commitment across `finance_recurring_bills` and
 * `finance_recurring_spend`; a unique index cannot span two tables, so it is checked here.
 * Letting a second claim through would not fail loudly — it would double-count that merchant's
 * charges in the rate, the accrual and everything built on either, and look plausible doing it.
 *
 * `exclude` is the row being edited, which must not collide with itself.
 */
async function claimedMatchers(
  userId: string,
  exclude: { table: "bill" | "spend"; id?: string } | null,
): Promise<Map<string, string>> {
  const [bills, spend] = await Promise.all([
    db
      .select({
        id: financeRecurringBills.id,
        name: financeRecurringBills.name,
        status: financeRecurringBills.status,
        matchers: financeRecurringBills.matchers,
      })
      .from(financeRecurringBills)
      .where(eq(financeRecurringBills.userId, userId)),
    db
      .select({
        id: financeRecurringSpend.id,
        name: financeRecurringSpend.name,
        matchers: financeRecurringSpend.matchers,
      })
      .from(financeRecurringSpend)
      .where(eq(financeRecurringSpend.userId, userId)),
  ]);

  const claimed = new Map<string, string>();
  for (const row of bills) {
    if (exclude?.table === "bill" && exclude.id === row.id) continue;
    // A dismissed row still holds its matchers — that is what keeps the merchant off the
    // review list — so it can refuse a merge, and the refusal has to say so. "CVS already
    // belongs to CVS" is a true sentence that explains nothing when the CVS in question is
    // a row the user dismissed weeks ago and cannot see.
    const held =
      row.status === "ignored" ? `${row.name}, which you dismissed` : row.name;
    for (const merchant of row.matchers) claimed.set(merchant, held);
  }
  for (const row of spend) {
    if (exclude?.table === "spend" && exclude.id === row.id) continue;
    for (const merchant of row.matchers) claimed.set(merchant, row.name);
  }
  return claimed;
}

/** Normalize, de-duplicate, and refuse matchers another commitment already holds. */
async function checkedMatchers(
  userId: string,
  matchers: readonly string[],
  exclude: { table: "bill" | "spend"; id?: string } | null,
): Promise<string[]> {
  const cleaned = [...new Set(matchers.map((entry) => entry.trim()).filter(Boolean))];
  if (cleaned.length === 0) return cleaned;

  const claimed = await claimedMatchers(userId, exclude);
  for (const merchant of cleaned) {
    const holder = claimed.get(merchant);
    if (holder !== undefined) {
      throw new MatcherConflictError(merchant, holder);
    }
  }
  return cleaned;
}

/**
 * Declare a bill, or change one already declared.
 *
 * Keyed on the **name** rather than an id, because the caller is often the one-off review row
 * and it knows what it is declaring, not whether a declaration already exists. That makes the
 * operation naturally idempotent: declaring Geico semi-annual twice is one declaration, and
 * correcting it to yearly is the same call with a different number.
 *
 * The cadence is checked here as well as by the column's CHECK — a constraint violation
 * surfaces as a database error the user cannot act on, and the offered list is a closed set.
 */
export async function upsertRecurringBill(
  userId: string,
  edit: RecurringBillEdit,
): Promise<void> {
  const name = edit.name.trim();
  if (name === "") throw new Error("A bill needs a name.");
  // The bounds are the CHECK constraints on both columns. Validated here as well so a bad
  // cadence fails with a sentence rather than as a constraint violation the caller cannot read.
  if (!Number.isInteger(edit.cadence.n)) {
    throw new Error("A cadence must be a whole number.");
  }
  if (edit.cadence.unit === "month" && (edit.cadence.n < 1 || edit.cadence.n > 24)) {
    throw new Error("A cadence in months must be from 1 to 24.");
  }
  if (edit.cadence.unit === "day" && (edit.cadence.n < 2 || edit.cadence.n > 200)) {
    throw new Error("A cadence in days must be from 2 to 200.");
  }
  // An unscheduled bill has no cadence to infer an amount from and no forecast to fall back
  // on, so the stated cost is the only thing it knows. Without it there is nothing to
  // declare — and a bill contributing zero to the baseline would be worse than none, because
  // it would also suppress its own charges from the one-off review list.
  if (edit.scheduled === false && !(Number(edit.expectedCents) > 0)) {
    throw new Error("A bill with no fixed schedule needs its cost for the period.");
  }
  if (
    edit.dueDay !== undefined &&
    edit.dueDay !== null &&
    (!Number.isInteger(edit.dueDay) || edit.dueDay < 1 || edit.dueDay > 31)
  ) {
    throw new Error("A due day must be a whole number from 1 to 31.");
  }
  const existing = await db
    .select({
      id: financeRecurringBills.id,
      category: financeRecurringBills.category,
      matchers: financeRecurringBills.matchers,
    })
    .from(financeRecurringBills)
    .where(
      and(
        eq(financeRecurringBills.userId, userId),
        eq(financeRecurringBills.name, name),
      ),
    )
    .limit(1);

  const matchers =
    edit.matchers === undefined
      ? undefined
      : await checkedMatchers(userId, edit.matchers, {
          table: "bill",
          id: existing[0]?.id,
        });

  // Only the fields supplied are written, the same rule `updateTransaction` follows. It
  // matters here because correcting a cadence from the recurring table sends the cadence and
  // nothing else, and a blanket write would silently clear the declared amount — after which
  // the bill's figure would quietly fall back to whatever the visible window's median was.
  const changes = {
    ...cadenceColumns(edit.cadence),
    ...(matchers !== undefined ? { matchers } : {}),
    ...(edit.category !== undefined ? { category: edit.category.trim() } : {}),
    ...(edit.expectedCents !== undefined ? { expectedCents: edit.expectedCents } : {}),
    ...(edit.anchorDate !== undefined ? { anchorDate: edit.anchorDate } : {}),
    ...(edit.notes !== undefined ? { notes: edit.notes.trim() } : {}),
    ...(edit.scheduled !== undefined ? { scheduled: edit.scheduled } : {}),
    ...(edit.dueDay !== undefined ? { dueDay: edit.dueDay } : {}),
    ...(edit.status !== undefined ? { status: edit.status } : {}),
    // Cancelling stamps the date and reactivating clears it, so the pair cannot disagree —
    // a `cancelledOn` left behind on an active bill would read as a fact about the future.
    ...(edit.status !== undefined
      ? {
          cancelledOn:
            edit.status === "cancelled" ? (edit.cancelledOn ?? todayInUtc()) : null,
        }
      : {}),
    ...(edit.url !== undefined ? { url: edit.url.trim() } : {}),
    updatedAt: new Date(),
  };

  await db
    .insert(financeRecurringBills)
    .values({
      userId,
      name,
      matchers: matchers ?? [name],
      ...cadenceColumns(edit.cadence),
      category: edit.category?.trim() ?? "",
      expectedCents: edit.expectedCents ?? null,
      anchorDate: edit.anchorDate ?? null,
      notes: edit.notes?.trim() ?? "",
      scheduled: edit.scheduled ?? true,
      dueDay: edit.dueDay ?? null,
      status: edit.status ?? "active",
      cancelledOn:
        edit.status === "cancelled" ? (edit.cancelledOn ?? todayInUtc()) : null,
      url: edit.url?.trim() ?? "",
    })
    // The unique index is on (user_id, name), so this can only ever collide with this user's
    // own row — another user's identical name is a different row entirely.
    .onConflictDoUpdate({
      target: [financeRecurringBills.userId, financeRecurringBills.name],
      set: changes,
    });

  await reclassifyIfCategoriesMoved(userId, existing[0], {
    category: edit.category,
    matchers,
  });
}

/**
 * Rename a bill in place. Insert-then-delete would trip the matcher exclusivity check —
 * the old row still holds the same bank strings — so the name column is updated directly.
 */
export async function renameRecurringBill(
  userId: string,
  from: string,
  to: string,
): Promise<void> {
  const next = to.trim();
  if (next === "") throw new Error("A bill needs a name.");
  const result = await db
    .update(financeRecurringBills)
    .set({ name: next, updatedAt: new Date() })
    .where(
      and(
        eq(financeRecurringBills.userId, userId),
        eq(financeRecurringBills.name, from),
      ),
    )
    .returning({ id: financeRecurringBills.id });
  if (result.length === 0) throw new Error("Bill not found.");
}

/** Undeclare a bill. Its charges return to the review list, which is the point of undoing. */
export async function deleteRecurringBill(userId: string, name: string): Promise<void> {
  await db
    .delete(financeRecurringBills)
    .where(
      and(
        eq(financeRecurringBills.userId, userId),
        eq(financeRecurringBills.name, name),
      ),
    );
}

export type RecurringSpendEdit = {
  /** The user's name for it — "Pizza". Also the upsert key. */
  name: string;
  /** Bank merchant strings whose charges count. Omitted leaves the existing set alone. */
  matchers?: readonly string[];
  period?: RecurringSpendPeriod;
  amountSource?: RecurringSpendAmountSource;
  /** The pinned rate per period. Ignored while `amountSource` is `auto`. */
  expectedCents?: number | null;
  active?: boolean;
  /** A `FINANCE_CATEGORIES` value, or empty for none. See `RecurringBillEdit.category`. */
  category?: string;
  notes?: string;
};

/**
 * Create or correct a recurring-spend entry — tier 2.
 *
 * A pinned amount is required when `amountSource` is `pinned`, for the same reason a set-aside
 * bill needs a stated cost: this figure is subtracted from money the user is about to spend
 * against, and "pinned to nothing" would silently deduct zero while claiming to be deliberate.
 * Under `auto` the amount is not stored at all — the rate is recomputed from history on read.
 */
export async function upsertRecurringSpend(
  userId: string,
  edit: RecurringSpendEdit,
): Promise<void> {
  const name = edit.name.trim();
  if (name === "") throw new Error("A recurring spend needs a name.");
  if (edit.amountSource === "pinned" && !(Number(edit.expectedCents) > 0)) {
    throw new Error("A pinned amount needs a figure above zero.");
  }
  if (
    edit.expectedCents !== undefined &&
    edit.expectedCents !== null &&
    (!Number.isInteger(edit.expectedCents) || edit.expectedCents < 0)
  ) {
    throw new Error("An amount must be a whole number of cents, zero or more.");
  }

  const existing = await db
    .select({
      id: financeRecurringSpend.id,
      category: financeRecurringSpend.category,
      matchers: financeRecurringSpend.matchers,
    })
    .from(financeRecurringSpend)
    .where(
      and(
        eq(financeRecurringSpend.userId, userId),
        eq(financeRecurringSpend.name, name),
      ),
    )
    .limit(1);

  const matchers =
    edit.matchers === undefined
      ? undefined
      : await checkedMatchers(userId, edit.matchers, {
          table: "spend",
          id: existing[0]?.id,
        });

  const changes = {
    ...(matchers !== undefined ? { matchers } : {}),
    ...(edit.period !== undefined ? { period: edit.period } : {}),
    ...(edit.amountSource !== undefined ? { amountSource: edit.amountSource } : {}),
    ...(edit.expectedCents !== undefined ? { expectedCents: edit.expectedCents } : {}),
    ...(edit.active !== undefined ? { active: edit.active } : {}),
    ...(edit.category !== undefined ? { category: edit.category.trim() } : {}),
    ...(edit.notes !== undefined ? { notes: edit.notes.trim() } : {}),
    updatedAt: new Date(),
  };

  await db
    .insert(financeRecurringSpend)
    .values({
      userId,
      name,
      matchers: matchers ?? [],
      period: edit.period ?? "week",
      amountSource: edit.amountSource ?? "auto",
      expectedCents: edit.expectedCents ?? null,
      active: edit.active ?? true,
      category: edit.category?.trim() ?? "",
      notes: edit.notes?.trim() ?? "",
    })
    .onConflictDoUpdate({
      target: [financeRecurringSpend.userId, financeRecurringSpend.name],
      set: changes,
    });

  await reclassifyIfCategoriesMoved(userId, existing[0], {
    category: edit.category,
    matchers,
  });
}

/**
 * Rename a recurring-spend group in place.
 *
 * A direct column update for the same reason as `renameRecurringBill`: insert-then-delete would
 * leave the old row holding the same bank strings for a moment, and `checkedMatchers` would
 * reject the new one as claiming a merchant that already belongs to something.
 *
 * The grid had no way to do this at all until 2026-08-18, which is how "Track as spend" on
 * Pizza Hut produced a permanent group named after one shop rather than the Pizza group it was
 * meant to join.
 */
export async function renameRecurringSpend(
  userId: string,
  from: string,
  to: string,
): Promise<void> {
  const next = to.trim();
  if (next === "") throw new Error("A recurring spend needs a name.");
  const result = await db
    .update(financeRecurringSpend)
    .set({ name: next, updatedAt: new Date() })
    .where(
      and(
        eq(financeRecurringSpend.userId, userId),
        eq(financeRecurringSpend.name, from),
      ),
    )
    .returning({ id: financeRecurringSpend.id });
  if (result.length === 0) throw new Error("Recurring spend not found.");
}

/** Remove a recurring-spend entry. Its charges go back to being ordinary spending. */
export async function deleteRecurringSpend(
  userId: string,
  name: string,
): Promise<void> {
  await db
    .delete(financeRecurringSpend)
    .where(
      and(
        eq(financeRecurringSpend.userId, userId),
        eq(financeRecurringSpend.name, name),
      ),
    );
}

/**
 * Cancel, ignore, or revive a subscription.
 *
 * A dedicated write rather than another `upsertRecurringBill` so the dashboard's "still
 * active?" prompt cannot accidentally clear the amount or cadence on the way through — it
 * sends a status and, when the answer is *still active*, a new anchor, and nothing else.
 *
 * Throws if this user has no bill by that name, so a second user cannot "succeed" at
 * cancelling someone else's subscription by writing a row of their own.
 */
export async function setSubscriptionStatus(
  userId: string,
  name: string,
  status: CommitmentStatus,
  options: { reanchorOn?: string; cancelledOn?: string | null } = {},
): Promise<void> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({
      cadenceMonths: financeRecurringBills.cadenceMonths,
      cadenceDays: financeRecurringBills.cadenceDays,
    })
    .from(financeRecurringBills)
    .where(
      and(
        eq(financeRecurringBills.userId, userId),
        eq(financeRecurringBills.name, trimmed),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Bill not found.");

  await upsertRecurringBill(userId, {
    name: trimmed,
    cadence: cadenceOf(existing),
    status,
    ...(options.cancelledOn !== undefined ? { cancelledOn: options.cancelledOn } : {}),
    ...(status === "active" && options.reanchorOn !== undefined
      ? { anchorDate: options.reanchorOn }
      : {}),
  });
}

/**
 * Add bank merchant strings to a commitment that already exists, on either tier.
 *
 * **Append, not replace.** The alternative — reading the row, spreading its matchers, and
 * sending the whole list back through the upsert — is what the review list did for spend
 * groups, and it makes every join a read-modify-write that silently drops whatever changed in
 * between. This is one statement, and the exclusivity check still runs, so claiming a merchant
 * another commitment holds fails by name rather than moving it.
 *
 * Strings already on the row are ignored rather than duplicated: joining twice is a slip, not
 * an error worth an exception.
 */
export async function addMatchersToCommitment(
  userId: string,
  input: { kind: "bill" | "spend"; name: string; matchers: readonly string[] },
): Promise<void> {
  const name = input.name.trim();
  const table = input.kind === "bill" ? financeRecurringBills : financeRecurringSpend;

  const [existing] = await db
    .select({ id: table.id, matchers: table.matchers, category: table.category })
    .from(table)
    .where(and(eq(table.userId, userId), eq(table.name, name)))
    .limit(1);
  if (!existing) throw new Error("Commitment not found.");

  const added = input.matchers.map((entry) => entry.trim()).filter(Boolean);
  const merged = [...new Set([...existing.matchers, ...added])];
  if (merged.length === existing.matchers.length) return;

  await checkedMatchers(userId, merged, {
    table: input.kind,
    id: existing.id,
  });

  await db
    .update(table)
    .set({ matchers: merged, updatedAt: new Date() })
    // Scoped on the id *and* the user: the id came from a row this user owns, and saying so
    // twice is what makes a mistaken id a no-op rather than someone else's row.
    .where(and(eq(table.userId, userId), eq(table.id, existing.id)));

  await reclassifyIfCategoriesMoved(
    userId,
    { category: existing.category, matchers: existing.matchers },
    { matchers: merged },
  );
}

/** Remove a commitment from either table. Kind is required because names are unique per table, not across both. */
export async function deleteCommitment(
  userId: string,
  target: { kind: "bill" | "spend"; name: string },
): Promise<void> {
  if (target.kind === "bill") {
    await deleteRecurringBill(userId, target.name);
    return;
  }
  await deleteRecurringSpend(userId, target.name);
}

/**
 * Today as a `YYYY-MM-DD` key, for stamping `cancelled_on` when the caller did not supply one.
 *
 * Server-side "today" is acceptable here and nowhere else in this feature: it records when a
 * write happened rather than driving a calculation, so a timezone being a few hours out
 * misdates the audit trail at worst. Every figure that a reader compares against a date takes
 * `todayKey` from the browser instead (`agent-os/standards/development/dates.md`).
 */
function todayInUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
