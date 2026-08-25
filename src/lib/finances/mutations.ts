import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeBudgetCategories,
  financePaymentResolutions,
  financePayeeAliases,
  financeTransactions,
  type EnvelopeStatus,
  type FinanceAccountKind,
  type FinanceFlowKind,
} from "@/db/schema";
import * as sortKey from "@/lib/tree/sortKey";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { parseAccountUrl } from "./accountUrl";
import { isCoreBudgetKind, resolvedOffBudget } from "./accountKind";
import { rebaseAccountMembership } from "./budget/membership";
import { changedRows, planReclassify } from "./classify/reclassify";
import { summarizeClassifiedIncome, type IncomeSummary } from "./classify/income";
import { summarizeFlowChanges, type FlowDiff } from "./classify/flowDiff";
import { lastChargeOnBill } from "./billLastCharge";
import { nextChargeWriteError } from "./commitments";
import { cadenceColumns, cadenceOf, type Cadence } from "./recurringBills";
import { numericStringToCents } from "./money";
import type { PaypalResolution } from "./paypalMatch";
import { ensurePayees } from "./payees/backfill";
import {
  isolatePayeeForBill,
  replaceCommitmentPayeesInTransaction,
} from "./payees/mutations";
import { applyClaimedPayees } from "./payees/claims";
import { aliasFor, payeeIndex } from "./payees/resolve";

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
  await deleteTransactions(userId, [transactionId]);
}

/** Delete the user's own rows in `ids`. Other users' ids are ignored. */
export async function deleteTransactions(
  userId: string,
  transactionIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(transactionIds)];
  if (unique.length === 0) return;
  await db
    .delete(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.id, unique),
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
  /**
   * Include or exclude a flexible account (investment, loan, other) from the envelope
   * budget. Core kinds ignore a request to leave; the write path forces them on-budget.
   */
  offBudget?: boolean;
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
  const [current] = await db
    .select({
      id: financeAccounts.id,
      kind: financeAccounts.kind,
      offBudget: financeAccounts.offBudget,
    })
    .from(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
    .limit(1);
  if (!current) throw new Error("Account not found.");

  const nextKind = edit.kind ?? current.kind;
  if (isCoreBudgetKind(nextKind) && edit.offBudget === true) {
    throw new Error(
      "Checking, savings, cash, and credit-card accounts are always on budget.",
    );
  }
  const nextOffBudget = resolvedOffBudget(
    nextKind,
    edit.offBudget ?? current.offBudget,
  );

  const values: {
    name?: string;
    kind?: FinanceAccountKind;
    institution?: string;
    url?: string;
    closedAt?: Date | null;
    offBudget?: boolean;
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

  const membershipChanged = nextOffBudget !== current.offBudget;
  const leaving = membershipChanged && nextOffBudget;

  // Leaving the pool requires the kind to already be flexible (a core kind cannot
  // store off-budget). Entering can happen before a kind edit that makes it core.
  if (leaving && values.kind !== undefined) {
    await db
      .update(financeAccounts)
      .set({ kind: values.kind, updatedAt: new Date() })
      .where(
        and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)),
      );
    delete values.kind;
  }

  if (membershipChanged) {
    await rebaseAccountMembership(userId, accountId, nextOffBudget);
  } else {
    values.offBudget = nextOffBudget;
  }

  if (
    values.name !== undefined ||
    values.kind !== undefined ||
    values.institution !== undefined ||
    values.url !== undefined ||
    values.closedAt !== undefined ||
    values.offBudget !== undefined
  ) {
    await db
      .update(financeAccounts)
      .set(values)
      .where(
        and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)),
      );
  }
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
 * Only `derived_*`, `transfer_group_id` and the recomputable `payee_id` are written.
 * `category`, `flow_override`, `exclude_from_baseline` and `event_label` belong to the user
 * and are not in the update statement at all, so no amount of re-running can erase a
 * correction.
 */
/**
 * Load everything one user's classification depends on, and plan it. **Writes nothing.**
 *
 * Split out because a preview and a run must not be two implementations of the same answer.
 * The moment they diverge, the count a person confirmed stops being the count that lands —
 * and the difference would show up as a wrong number rather than as an error. `previewFlow`
 * and `reclassifyTransactions` therefore share this, and differ only in what they do with the
 * plan afterwards.
 *
 * Deliberately does **not** call `ensurePayees`: minting a payee is a write, and a caller that
 * only wants to look must be able to. A run calls it first; a preview accepts that a merchant
 * never seen before is still unclaimed and reports it that way.
 */
async function loadAndPlanReclassify(userId: string) {
  const [rows, accounts, storedResolutions, aliases] = await Promise.all([
    db
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

  const plan = planReclassify(
    parsed,
    accounts,
    randomUUID,
    resolutions,
    payeeIndex(aliases),
  );

  return { parsed, plan, changed: changedRows(parsed, plan) };
}

/**
 * What a reclassify would do to `derived_flow`, without doing it.
 *
 * The audit half of a detector change: see `classify/flowDiff.ts` for why a flow movement is
 * reported in signed cents and read by a human before anything is written.
 */
export async function previewFlowChanges(userId: string): Promise<FlowDiff> {
  return (await previewDerivedChanges(userId)).flow;
}

export type DerivedPreview = {
  scanned: number;
  updated: number;
  flow: FlowDiff;
  income: {
    before: IncomeSummary;
    after: IncomeSummary;
  };
};

/**
 * What a reclassify would do to `derived_flow`, without doing it.
 *
 * Category is no longer a derived column; claims and payee defaults write `budget_category_id`
 * on new or uncategorised rows only.
 */
export async function previewDerivedChanges(userId: string): Promise<DerivedPreview> {
  const { parsed, plan, changed } = await loadAndPlanReclassify(userId);
  return {
    scanned: parsed.length,
    updated: changed.length,
    flow: summarizeFlowChanges(parsed, plan.rows),
    income: {
      before: summarizeClassifiedIncome(parsed),
      after: {
        paydayCount: plan.paydays.length,
        medianPaycheckCents: plan.medianPaycheckCents,
        normalizedMonthlyIncomeCents: plan.normalizedMonthlyIncomeCents,
      },
    },
  };
}

export async function reclassifyTransactions(
  userId: string,
): Promise<ReclassifySummary> {
  // Mint the stable ids before planning. The planner then assigns those ids in the same
  // row-shaped update as the other recomputable facts rather than maintaining a second
  // classification path just for payees.
  await ensurePayees(userId);

  const { parsed, plan, changed } = await loadAndPlanReclassify(userId);

  if (changed.length > 0) {
    await db.transaction(async (tx) => {
      for (let start = 0; start < changed.length; start += RECLASSIFY_CHUNK) {
        const chunk = changed.slice(start, start + RECLASSIFY_CHUNK);
        const values = sql.join(
          chunk.map(
            (row) =>
              sql`(${row.id}::uuid, ${row.derivedFlow}::finance_flow_kind, ${row.transferGroupId}::uuid, ${row.payeeId}::uuid)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          update ${financeTransactions} as t
          set derived_flow = v.derived_flow,
              transfer_group_id = v.transfer_group_id,
              payee_id = v.payee_id,
              updated_at = now()
          from (values ${values}) as v(id, derived_flow, transfer_group_id, payee_id)
          where t.id = v.id and t.user_id = ${userId}::uuid
        `);
      }
    });
  }

  return {
    scanned: parsed.length,
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

export type BillEnvelopeEdit = {
  /** The user's name for the bill, and the upsert key. */
  name: string;
  /** Stable payees whose transactions belong to this bill. Omitted leaves claims alone. */
  payeeIds?: readonly string[];
  /** Whether it is still live. See `EnvelopeStatus`. */
  status?: EnvelopeStatus;
  /** When it was cancelled. Defaults to today when `status` becomes `cancelled`. */
  cancelledOn?: string | null;
  /** Where the bill is managed — account page, billing page, cancel page. */
  url?: string;
  /** How often it charges: whole months, or a fixed number of days. */
  cadence: Cadence;
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
  /** Optional group for a **new** bill. Ignored when the bill already exists. Null — the default — sits the bill in the Bills section with no group. */
  groupId?: string | null;
};

/**
 * Declare a bill, or change one already declared.
 *
 * **A bill is an envelope with `kind = 'bill'`** — before
 * `agent-os/specs/2026-08-23-2313-one-budget/`, this wrote a separate `finance_recurring_bills`
 * row and, once imported, a second `finance_budget_categories` row pointing at it. One row now
 * carries both facets, so declaring a bill *is* creating its envelope.
 *
 * Keyed on the **name** rather than an id, because the caller is often the one-off review row
 * and it knows what it is declaring, not whether a declaration already exists. That makes the
 * operation naturally idempotent: declaring Geico semi-annual twice is one declaration, and
 * correcting it to yearly is the same call with a different number.
 *
 * **This is the canonical bill-envelope write.** Agent tools, the payee-claim picker, and
 * cadence edits on an existing bill call it directly. Transaction-backed Track as bill /
 * New bill… / Review / Insights go through `trackTransactionAsBill`, which isolates the
 * merchant then lands here. Claiming payees files those charges (including history) and
 * upserts the exact-payee rule here, not in each caller.
 *
 * The cadence is checked here as well as by the column's CHECK — a constraint violation
 * surfaces as a database error the user cannot act on, and the offered list is a closed set.
 */
function requireValidBillEnvelope(edit: BillEnvelopeEdit): string {
  const name = edit.name.trim();
  if (name === "") throw new Error("A bill needs a name.");
  if (!Number.isInteger(edit.cadence.n)) {
    throw new Error("A cadence must be a whole number.");
  }
  if (edit.cadence.unit === "month" && (edit.cadence.n < 1 || edit.cadence.n > 24)) {
    throw new Error("A cadence in months must be from 1 to 24.");
  }
  if (edit.cadence.unit === "day" && (edit.cadence.n < 2 || edit.cadence.n > 200)) {
    throw new Error("A cadence in days must be from 2 to 200.");
  }
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
  return name;
}

/**
 * Declare a bill from a Register (or Insights / Review) transaction.
 *
 * Isolation, envelope upsert, historical filing, and the exact-payee rule are one domain
 * write so the browser cannot compose `isolatePayeeForBill` + `upsertBillEnvelope` and
 * leave a split payee behind a refused cadence. Validation runs before isolation so a
 * blank name or illegal cadence is a no-op.
 */
export async function trackTransactionAsBill(
  userId: string,
  transactionId: string,
  edit: Omit<BillEnvelopeEdit, "payeeIds">,
): Promise<{ payeeId: string }> {
  requireValidBillEnvelope(edit);
  const payeeId = await isolatePayeeForBill(userId, transactionId);
  await attachUnassignedMerchantHistory(userId, transactionId, payeeId);
  await upsertBillEnvelope(userId, { ...edit, payeeIds: [payeeId] });
  return { payeeId };
}

/**
 * Minting a payee from one row used to leave the rest of this merchant unassigned, so
 * filing "this payee" missed the history Track as bill counted in the dialog.
 */
async function attachUnassignedMerchantHistory(
  userId: string,
  transactionId: string,
  payeeId: string,
): Promise<void> {
  const [row] = await db
    .select({ description: financeTransactions.description })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return;
  const alias = aliasFor(row.description);
  if (alias === "") return;

  const unassigned = await db
    .select({
      id: financeTransactions.id,
      description: financeTransactions.description,
    })
    .from(financeTransactions)
    .where(
      and(eq(financeTransactions.userId, userId), isNull(financeTransactions.payeeId)),
    );
  const matching = unassigned
    .filter((entry) => aliasFor(entry.description) === alias)
    .map((entry) => entry.id);
  if (matching.length === 0) return;
  await db
    .update(financeTransactions)
    .set({ payeeId, updatedAt: new Date() })
    .where(
      and(
        eq(financeTransactions.userId, userId),
        inArray(financeTransactions.id, matching),
      ),
    );
}

export async function upsertBillEnvelope(
  userId: string,
  edit: BillEnvelopeEdit,
): Promise<void> {
  const name = requireValidBillEnvelope(edit);

  let categoryId: string | undefined;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          eq(financeBudgetCategories.name, name),
          eq(financeBudgetCategories.kind, "bill"),
        ),
      )
      .limit(1);
    if (existing) {
      categoryId = existing.id;
      if (edit.anchorDate !== undefined) {
        // Last charge is the payee claim, not a recategorised row on this envelope —
        // `billLastCharge.ts`. A date on or before that charge is one `billAnchor` would
        // ignore, so storing it would look like the save bounced.
        const error = nextChargeWriteError(
          edit.anchorDate,
          await lastChargeOnBill(userId, categoryId),
        );
        if (error) throw new Error(error);
      }
      // Only the fields supplied are written, the same rule `updateTransaction` follows. It
      // matters here because correcting a cadence from the grid sends the cadence and nothing
      // else, and a blanket write would silently clear the declared amount — after which the
      // bill's figure would quietly fall back to whatever the visible window's median was.
      const changes = {
        ...cadenceColumns(edit.cadence),
        ...(edit.expectedCents !== undefined
          ? { expectedCents: edit.expectedCents }
          : {}),
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
      await tx
        .update(financeBudgetCategories)
        .set(changes)
        .where(
          and(
            eq(financeBudgetCategories.id, categoryId),
            eq(financeBudgetCategories.userId, userId),
          ),
        );
    } else {
      const groupId = edit.groupId ?? null;
      const siblings = await tx
        .select({ sortKey: financeBudgetCategories.sortKey })
        .from(financeBudgetCategories)
        .where(
          and(
            eq(financeBudgetCategories.userId, userId),
            groupId === null
              ? isNull(financeBudgetCategories.groupId)
              : eq(financeBudgetCategories.groupId, groupId),
          ),
        );
      const last = siblings
        .map((row) => row.sortKey)
        .sort((left, right) => sortKey.compare(right, left))[0];

      const [created] = await tx
        .insert(financeBudgetCategories)
        .values({
          userId,
          groupId,
          name,
          sortKey: last === undefined ? sortKey.first() : sortKey.after(last),
          kind: "bill",
          ...cadenceColumns(edit.cadence),
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
        .returning({ id: financeBudgetCategories.id });
      if (!created) throw new Error("Could not create the bill envelope.");
      categoryId = created.id;
    }

    if (categoryId && edit.payeeIds !== undefined) {
      await replaceCommitmentPayeesInTransaction(
        tx,
        userId,
        { id: categoryId },
        edit.payeeIds,
      );
    }
  });
  if (categoryId === undefined) throw new Error("Could not create the bill envelope.");
  if (edit.payeeIds !== undefined) {
    await applyClaimedPayees(userId, categoryId, edit.payeeIds);
  }
}

/**
 * Pause, cancel, dismiss, or revive a bill.
 *
 * A dedicated write rather than another `upsertBillEnvelope` so the dashboard's "still
 * active?" prompt cannot accidentally clear the amount or cadence on the way through — it
 * sends a status and, when the answer is *still active*, a new anchor, and nothing else.
 *
 * Throws if this user has no bill by that name, so a second user cannot "succeed" at
 * cancelling someone else's subscription by writing a row of their own.
 */
export async function setSubscriptionStatus(
  userId: string,
  name: string,
  status: EnvelopeStatus,
  options: { reanchorOn?: string; cancelledOn?: string | null } = {},
): Promise<void> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({
      cadenceMonths: financeBudgetCategories.cadenceMonths,
      cadenceDays: financeBudgetCategories.cadenceDays,
    })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        eq(financeBudgetCategories.name, trimmed),
        eq(financeBudgetCategories.kind, "bill"),
      ),
    )
    .limit(1);
  if (!existing || existing.cadenceMonths === null) throw new Error("Bill not found.");

  await upsertBillEnvelope(userId, {
    name: trimmed,
    cadence: cadenceOf({
      cadenceMonths: existing.cadenceMonths,
      cadenceDays: existing.cadenceDays,
    }),
    status,
    ...(options.cancelledOn !== undefined ? { cancelledOn: options.cancelledOn } : {}),
    ...(status === "active" && options.reanchorOn !== undefined
      ? { anchorDate: options.reanchorOn }
      : {}),
  });
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
