import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
import { markAmazonMatchSplitProtected } from "@/lib/amazon/matchProtect";
import { nextChargeWriteError } from "./commitments";
import { cadenceColumns, cadenceOf, type Cadence } from "./recurringBills";
import { centsToNumericString, numericStringToCents } from "./money";
import { splitRemainderCents } from "./splitRemainder";
import type { PaypalResolution } from "./paypalMatch";
import { ensurePayees } from "./payees/backfill";
import {
  isolatePayeeForBill,
  isolateSimilarAmountForBill,
  replaceCommitmentPayeesInTransaction,
} from "./payees/mutations";
import { applyClaimedPayees } from "./payees/claims";
import { aliasFor, payeeIndex } from "./payees/resolve";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import { writeFinanceAuditEvent } from "./audit/writes";
import { monthKeyOf } from "./budget/envelope";

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

export type TransactionEdit = {
  notes?: string;
  /** Null defers to the classifier again. */
  flowOverride?: FinanceFlowKind | null;
};

const TRANSACTION_AUDIT_COLUMNS = {
  id: financeTransactions.id,
  accountId: financeTransactions.accountId,
  transactionDate: financeTransactions.transactionDate,
  amount: financeTransactions.amount,
  pending: financeTransactions.pending,
  budgetCategoryId: financeTransactions.budgetCategoryId,
  derivedFlow: financeTransactions.derivedFlow,
  flowOverride: financeTransactions.flowOverride,
  isParent: financeTransactions.isParent,
  parentId: financeTransactions.parentId,
} as const;

type TransactionAuditRow = {
  [
    K in keyof typeof TRANSACTION_AUDIT_COLUMNS
  ]: (typeof financeTransactions.$inferSelect)[K];
};

function transactionAuditFields(row: TransactionAuditRow) {
  return {
    accountId: row.accountId,
    transactionDate: row.transactionDate,
    amount: row.amount,
    pending: row.pending,
    budgetCategoryId: row.budgetCategoryId,
    derivedFlow: row.derivedFlow,
    flowOverride: row.flowOverride,
    isParent: row.isParent,
    parentId: row.parentId,
  };
}

function transactionAuditScope(rows: readonly TransactionAuditRow[]) {
  return {
    accountIds: [...new Set(rows.map((row) => row.accountId))],
    budgetMonths: [...new Set(rows.map((row) => monthKeyOf(row.transactionDate)))],
  };
}

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
  const values: {
    notes?: string;
    flowOverride?: FinanceFlowKind | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (edit.notes !== undefined) values.notes = edit.notes;
  if (edit.flowOverride !== undefined) values.flowOverride = edit.flowOverride;

  await db.transaction(async (tx) => {
    const [before] = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.id, transactionId),
          eq(financeTransactions.userId, userId),
        ),
      )
      .limit(1);
    if (!before) throw new Error("Transaction not found.");

    const flowOverrideAfter =
      values.flowOverride !== undefined ? values.flowOverride : before.flowOverride;
    const moneyChanged = flowOverrideAfter !== before.flowOverride;
    const scope = transactionAuditScope([before]);
    const beforeCheckpoint = moneyChanged
      ? await captureFinanceMoneyCheckpoint(userId, scope, tx)
      : null;

    await tx
      .update(financeTransactions)
      .set(values)
      .where(
        and(
          eq(financeTransactions.id, transactionId),
          eq(financeTransactions.userId, userId),
        ),
      );

    if (!moneyChanged) return;
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_change",
      origin: "Register",
      summary: "Changed transaction classification.",
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        {
          entityType: "transaction",
          entityIdentity: transactionId,
          before: {
            flowOverride: before.flowOverride,
          },
          after: {
            flowOverride: flowOverrideAfter,
          },
        },
      ],
    });
  });
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
  await db.transaction(async (tx) => {
    const rows = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          or(
            inArray(financeTransactions.id, unique),
            inArray(financeTransactions.parentId, unique),
          ),
        ),
      );
    const selected = rows.filter((row) => unique.includes(row.id));
    if (selected.length === 0) return;
    const scope = transactionAuditScope(rows);
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await tx
      .delete(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          inArray(financeTransactions.id, unique),
        ),
      );
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_delete",
      origin: "Register",
      summary: `Deleted ${selected.length} transaction${selected.length === 1 ? "" : "s"}.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: rows.map((row) => ({
        entityType: row.parentId ? "transaction_split_child" : "transaction",
        entityIdentity: row.id,
        before: transactionAuditFields(row),
        after: null,
      })),
    });
  });
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
  auditEventId: string;
  auditBatchId: string;
};

/**
 * Recompute every derived classification for one user, from scratch.
 *
 * **This must never change an account balance.** A balance is `sum(amount)` and nothing here
 * touches `amount`, so a reclassify that moves one is a bug by construction — which makes it
 * the sharpest test available for this whole layer, and it is written down as one.
 *
 * Only `derived_*`, `transfer_group_id` and the recomputable `payee_id` are written.
 * `flow_override` and `notes` belong to the user
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
  options: { auditBatchId?: string; auditOrigin?: string } = {},
): Promise<ReclassifySummary> {
  // Mint the stable ids before planning. The planner then assigns those ids in the same
  // row-shaped update as the other recomputable facts rather than maintaining a second
  // classification path just for payees.
  await ensurePayees(userId);

  const { parsed, plan, changed } = await loadAndPlanReclassify(userId);

  const audit = await db.transaction(async (tx) => {
    const scope = {
      accountIds: [...new Set(parsed.map((row) => row.accountId))],
      budgetMonths: [...new Set(parsed.map((row) => monthKeyOf(row.transactionDate)))],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    if (changed.length > 0) {
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
    }
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const beforeById = new Map(parsed.map((row) => [row.id, row]));
    return writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_classification",
      origin: options.auditOrigin ?? "Finance classifier",
      batchId: options.auditBatchId,
      summary: `Reclassified ${changed.length} of ${parsed.length} transactions.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: changed.map((row) => {
        const before = beforeById.get(row.id);
        return {
          entityType: "transaction",
          entityIdentity: row.id,
          before: before
            ? {
                derivedFlow: before.derivedFlow,
                transferGroupId: before.transferGroupId,
                payeeId: before.payeeId,
              }
            : null,
          after: {
            derivedFlow: row.derivedFlow,
            transferGroupId: row.transferGroupId,
            payeeId: row.payeeId,
          },
        };
      }),
    });
  });

  return {
    scanned: parsed.length,
    updated: changed.length,
    paydayCount: plan.paydays.length,
    medianPaycheckCents: plan.medianPaycheckCents,
    normalizedMonthlyIncomeCents: plan.normalizedMonthlyIncomeCents,
    auditEventId: audit.eventId,
    auditBatchId: audit.batchId,
  };
}

/** Delete an account and, by cascade, every transaction on it. */
export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select({
        id: financeAccounts.id,
        name: financeAccounts.name,
        kind: financeAccounts.kind,
        offBudget: financeAccounts.offBudget,
        externalSource: financeAccounts.externalSource,
        externalKey: financeAccounts.externalKey,
      })
      .from(financeAccounts)
      .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)))
      .limit(1);
    if (!account) throw new Error("Account not found.");
    const transactions = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.accountId, accountId),
          eq(financeTransactions.userId, userId),
        ),
      );
    const scope = {
      accountIds: [accountId],
      accountNames: [account.name],
      budgetMonths: [
        ...new Set(transactions.map((row) => monthKeyOf(row.transactionDate))),
      ],
    };
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await tx
      .delete(financeAccounts)
      .where(
        and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)),
      );
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "account_delete",
      origin: "Finance accounts",
      summary: `Deleted ${account.name} and ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: [
        {
          entityType: "account",
          entityIdentity: account.id,
          before: {
            name: account.name,
            kind: account.kind,
            offBudget: account.offBudget,
            externalSource: account.externalSource,
            externalKey: account.externalKey,
          },
          after: null,
        },
        ...transactions.map((row) => ({
          entityType: row.parentId ? "transaction_split_child" : "transaction",
          entityIdentity: row.id,
          before: transactionAuditFields(row),
          after: null,
        })),
      ],
    });
  });
}

export type BillEnvelopeEdit = {
  /** Existing bills are always edited by stable envelope ID. */
  id?: string;
  /** Display name; legacy creation callers may resolve an unambiguous name. */
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
  /**
   * Day of the month the bill is **due**, 1–31, or null to walk from the last charge on file.
   * A declared due day makes the bill's dates calendar arithmetic (`billSchedule.ts`).
   */
  dueDay?: number | null;
  /**
   * How many days before the due date the charge posts, 0–60. Rent is due the 1st and
   * autopays seven days ahead, so its charge lands in the previous month.
   */
  leadDays?: number;
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
 * Existing records resolve by **envelope ID and owner**. Discovery callers can still supply
 * a name, but a non-unique name is rejected: nested groups legitimately contain duplicate
 * bill names and must never share edits or charge histories.
 *
 * **This is the canonical bill-envelope write.** Agent tools, the payee-claim picker, and
 * cadence edits on an existing bill call it directly. Transaction-backed Track as bill /
 * New bill… / Review go through `trackTransactionAsBill`, which isolates the
 * merchant (and, when amounts are mixed, this amount) then lands here. Claiming payees
 * files those charges (including history) here, not in each caller.
 *
 * The cadence is checked here as well as by the column's CHECK — a constraint violation
 * surfaces as a database error the user cannot act on, and the offered list is a closed set.
 */
function requireValidBillEnvelope(edit: BillEnvelopeEdit): string {
  const name = edit.name.trim();
  if (name === "") throw new Error("A bill needs a name.");
  if (
    edit.expectedCents !== undefined &&
    edit.expectedCents !== null &&
    (!Number.isSafeInteger(edit.expectedCents) ||
      edit.expectedCents < 0 ||
      edit.expectedCents > 2147483647)
  )
    throw new Error("A bill amount must be a nonnegative whole number of cents.");
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
  // Validated here as well as in the CHECK: a constraint violation surfaces as a database
  // error the user cannot act on.
  if (
    edit.leadDays !== undefined &&
    (!Number.isInteger(edit.leadDays) || edit.leadDays < 0 || edit.leadDays > 60)
  ) {
    throw new Error("A payment lead must be a whole number of days from 0 to 60.");
  }
  return name;
}

/**
 * Declare a bill from a Register (or Insights / Review) transaction.
 *
 * Isolation, envelope upsert, and historical filing are one domain write so the
 * browser cannot compose `isolatePayeeForBill` + `upsertBillEnvelope` and leave a split
 * payee behind a refused cadence. Validation runs before isolation so a blank name or
 * illegal cadence is a no-op. Mixed-amount merchants (Apple Store) isolate this amount
 * onto a payee that does not take the shared alias.
 */
export async function trackTransactionAsBill(
  userId: string,
  transactionId: string,
  edit: Omit<BillEnvelopeEdit, "payeeIds">,
): Promise<{ payeeId: string }> {
  requireValidBillEnvelope(edit);
  const isolated = await isolatePayeeForBill(userId, transactionId);
  const payeeId = await isolateSimilarAmountForBill(
    userId,
    transactionId,
    isolated,
    edit.name,
  );
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

  const [ownsAlias] = await db
    .select({ alias: financePayeeAliases.alias })
    .from(financePayeeAliases)
    .where(
      and(
        eq(financePayeeAliases.userId, userId),
        eq(financePayeeAliases.payeeId, payeeId),
        eq(financePayeeAliases.alias, alias),
      ),
    )
    .limit(1);
  if (!ownsAlias) return;

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
    const matches = await tx
      .select({ id: financeBudgetCategories.id })
      .from(financeBudgetCategories)
      .where(
        and(
          eq(financeBudgetCategories.userId, userId),
          edit.id
            ? eq(financeBudgetCategories.id, edit.id)
            : eq(financeBudgetCategories.name, name),
          eq(financeBudgetCategories.kind, "bill"),
        ),
      )
      .limit(2);
    if (edit.id && matches.length === 0) throw new Error("Bill not found.");
    if (matches.length > 1)
      throw new Error("More than one bill has this name. Use its envelope ID.");
    const existing = matches[0];
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
        // Clearing the due day returns the bill to the walk, where a lead has no meaning and
        // would come back as a surprise if the due day were ever set again.
        ...(edit.dueDay === null ? { leadDays: 0 } : {}),
        ...(edit.leadDays !== undefined ? { leadDays: edit.leadDays } : {}),
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
          leadDays:
            edit.dueDay === undefined || edit.dueDay === null
              ? 0
              : (edit.leadDays ?? 0),
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
 * A dedicated write rather than another `upsertBillEnvelope` so the Bills page's "still
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

/**
 * One child of a split, as the editor hands it over.
 *
 * `id` names an existing child to keep and update; absent, a new one is inserted. Only the
 * three fields a child owns are here — everything else is the parent's and is inherited
 * (`agent-os/specs/2026-08-26-2022-split-transactions/` D9). Payee especially: identity is
 * derived from the bank's description with no per-row override, and the bank says Apple.
 */
export type SplitChildInput = {
  id?: string;
  /** Signed cents, same convention as the parent. */
  amountCents: number;
  /** Null is a real answer here — an unassigned child *is* budget backlog. */
  budgetCategoryId: string | null;
  notes?: string;
};

/** Columns a child inherits from its parent, read once and copied onto every insert. */
const SPLIT_PARENT_COLUMNS = {
  id: financeTransactions.id,
  accountId: financeTransactions.accountId,
  transactionDate: financeTransactions.transactionDate,
  postedDate: financeTransactions.postedDate,
  pending: financeTransactions.pending,
  description: financeTransactions.description,
  amount: financeTransactions.amount,
  payeeId: financeTransactions.payeeId,
  derivedFlow: financeTransactions.derivedFlow,
  flowOverride: financeTransactions.flowOverride,
  transferGroupId: financeTransactions.transferGroupId,
  budgetCategoryId: financeTransactions.budgetCategoryId,
  isParent: financeTransactions.isParent,
  parentId: financeTransactions.parentId,
} as const;

type SplitParentRow = {
  [
    K in keyof typeof SPLIT_PARENT_COLUMNS
  ]: (typeof financeTransactions.$inferSelect)[K];
};

async function requireSplitParent(
  userId: string,
  transactionId: string,
): Promise<SplitParentRow> {
  const [row] = await db
    .select(SPLIT_PARENT_COLUMNS)
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.id, transactionId),
        eq(financeTransactions.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Transaction not found.");
  return row;
}

/**
 * Every envelope named by the children must be the caller's.
 *
 * This is the novel cross-user hole the parent/child schema opens: the child rows are
 * written by us, so a `userId` on the insert proves nothing about the ids the caller chose
 * to put *in* them.
 */
async function requireCategoriesOwned(
  userId: string,
  categoryIds: readonly (string | null)[],
): Promise<void> {
  const unique = [...new Set(categoryIds.flatMap((id) => (id === null ? [] : [id])))];
  if (unique.length === 0) return;
  const rows = await db
    .select({ id: financeBudgetCategories.id })
    .from(financeBudgetCategories)
    .where(
      and(
        eq(financeBudgetCategories.userId, userId),
        inArray(financeBudgetCategories.id, unique),
      ),
    );
  if (rows.length !== unique.length) throw new Error("Envelope not found.");
}

/**
 * Refuse a split that does not add up.
 *
 * **Divergence from Actual**, which persists the imbalance as a `SplitTransactionError` and
 * shows it on the row. Two reasons to be stricter here: `reconcile.ts` is a hard arithmetic
 * check, so an unbalanced split surfaces as a statement discrepancy whose cause is invisible
 * from where it is reported; and there is no sync layer forcing tolerance of a half-written
 * record. An unbalanced split can only ever be a bug wearing data's clothes.
 */
function requireBalanced(
  parentCents: number,
  children: readonly SplitChildInput[],
): void {
  const remainder = splitRemainderCents(
    parentCents,
    children.map((child) => child.amountCents),
  );
  if (remainder === 0) return;
  // Direction is relative to the parent's sign, not to zero: on a card charge every amount
  // runs negative, so a remainder of -$1.98 is $1.98 *still to allocate*, not an overshoot.
  const stillToAllocate = parentCents === 0 || remainder * parentCents > 0;
  const gap = centsToNumericString(Math.abs(remainder));
  const direction = stillToAllocate ? "short by" : "over by";
  throw new Error(
    `Split does not add up: the children are ${direction} $${gap}. Use Distribute to close the gap.`,
  );
}

/** The rows a split may not be made from (D10). */
function requireSplittable(parent: SplitParentRow): void {
  if (parent.parentId !== null) {
    throw new Error("A split child cannot itself be split.");
  }
  if (parent.transferGroupId !== null) {
    // Both legs would have to be split to stay coherent, and `activitySince`'s transfer
    // exclusion keys on the group rather than on the row.
    throw new Error("A transfer cannot be split.");
  }
}

/**
 * Replace a parent's children wholesale, inside one transaction.
 *
 * Wholesale rather than per-row because the balance invariant is a property of the *set*:
 * any per-child write would have to pass through a state where the split does not add up,
 * and D6 says that state is never persisted.
 */
async function writeSplitChildren(
  userId: string,
  parent: SplitParentRow,
  children: readonly SplitChildInput[],
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeRows = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          or(
            eq(financeTransactions.id, parent.id),
            eq(financeTransactions.parentId, parent.id),
          ),
        ),
      );
    const scope = transactionAuditScope(beforeRows);
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    const existingIds = new Set(
      beforeRows.flatMap((row) => (row.parentId === parent.id ? [row.id] : [])),
    );

    const kept = new Set(
      children.flatMap((child) =>
        child.id !== undefined && existingIds.has(child.id) ? [child.id] : [],
      ),
    );
    const removed = [...existingIds].filter((id) => !kept.has(id));
    if (removed.length > 0) {
      await tx
        .delete(financeTransactions)
        .where(
          and(
            eq(financeTransactions.userId, userId),
            inArray(financeTransactions.id, removed),
          ),
        );
    }

    for (const child of children) {
      const values = {
        amount: centsToNumericString(child.amountCents),
        budgetCategoryId: child.budgetCategoryId,
        notes: child.notes?.trim() ?? "",
        updatedAt: now,
      };
      if (child.id !== undefined && kept.has(child.id)) {
        await tx
          .update(financeTransactions)
          .set(values)
          .where(
            and(
              eq(financeTransactions.userId, userId),
              eq(financeTransactions.id, child.id),
            ),
          );
        continue;
      }
      await tx.insert(financeTransactions).values({
        userId,
        parentId: parent.id,
        accountId: parent.accountId,
        transactionDate: parent.transactionDate,
        postedDate: parent.postedDate,
        pending: parent.pending,
        description: parent.description,
        payeeId: parent.payeeId,
        derivedFlow: parent.derivedFlow,
        flowOverride: parent.flowOverride,
        // `externalSource` / `externalId` stay null: a child is not a bank row (D4), so it
        // sits outside the partial unique index that dedups re-imports and can neither be
        // created nor resurrected by one.
        ...values,
      });
    }

    // D3: the parent holds no envelope. If it kept one, the leaf sum and the envelope sum
    // would double-count it.
    await tx
      .update(financeTransactions)
      .set({ isParent: true, budgetCategoryId: null, updatedAt: now })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, parent.id),
        ),
      );

    const afterRows = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          or(
            eq(financeTransactions.id, parent.id),
            eq(financeTransactions.parentId, parent.id),
          ),
        ),
      );
    const beforeById = new Map(beforeRows.map((row) => [row.id, row]));
    const afterById = new Map(afterRows.map((row) => [row.id, row]));
    const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])];
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_split",
      origin: "Register",
      summary: `${parent.isParent ? "Changed" : "Split"} a transaction into ${children.length} part${children.length === 1 ? "" : "s"}.`,
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: ids.map((id) => ({
        entityType: id === parent.id ? "transaction" : "transaction_split_child",
        entityIdentity: id,
        before: beforeById.has(id) ? transactionAuditFields(beforeById.get(id)!) : null,
        after: afterById.has(id) ? transactionAuditFields(afterById.get(id)!) : null,
      })),
    });
  });
}

/**
 * Divide one bank transaction between envelopes.
 *
 * The parent keeps the bank's amount and gives up its envelope; the children sum to it
 * exactly. Nothing calls this automatically — no rule action, no import
 * (`agent-os/specs/2026-08-23-1536-finance-rules/` D4 stands). Splits are rare by design,
 * and a split register is a harder register to read.
 *
 * An envelope already on the row moves onto the first child rather than being dropped on the
 * floor, unless the caller named one there.
 */
export async function splitTransaction(
  userId: string,
  transactionId: string,
  children: readonly SplitChildInput[],
): Promise<void> {
  const parent = await requireSplitParent(userId, transactionId);
  requireSplittable(parent);
  if (parent.isParent) throw new Error("That transaction is already split.");
  if (children.length === 0) throw new Error("A split needs at least one child.");

  const inherited = children.map((child, index) =>
    index === 0 && child.budgetCategoryId === null && parent.budgetCategoryId !== null
      ? { ...child, budgetCategoryId: parent.budgetCategoryId }
      : { ...child, id: undefined },
  );
  requireBalanced(numericStringToCents(parent.amount) ?? 0, inherited);
  await requireCategoriesOwned(
    userId,
    inherited.map((child) => child.budgetCategoryId),
  );

  await writeSplitChildren(userId, parent, inherited);
}

/**
 * Rewrite an existing split's children.
 *
 * An empty set unsplits the row (D11): removing the last child has to restore an ordinary
 * transaction, or a mis-split row would be permanently strange with no way back.
 */
export async function updateSplitChildren(
  userId: string,
  transactionId: string,
  children: readonly SplitChildInput[],
): Promise<void> {
  const parent = await requireSplitParent(userId, transactionId);
  if (!parent.isParent) throw new Error("That transaction is not split.");
  if (children.length === 0) {
    await unsplitTransaction(userId, transactionId);
    return;
  }

  requireBalanced(numericStringToCents(parent.amount) ?? 0, children);
  await requireCategoriesOwned(
    userId,
    children.map((child) => child.budgetCategoryId),
  );

  await writeSplitChildren(userId, parent, children);
  await markAmazonMatchSplitProtected(userId, transactionId);
}

/**
 * Return a split parent to an ordinary row.
 *
 * The children go; the parent's envelope stays null, so the row lands back in the budget's
 * backlog and the ordinary envelope picker is how it leaves again. Restoring one child's
 * envelope onto the parent would be a guess about which of two was the real one.
 */
export async function unsplitTransaction(
  userId: string,
  transactionId: string,
): Promise<void> {
  const parent = await requireSplitParent(userId, transactionId);
  if (!parent.isParent) return;

  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeRows = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          or(
            eq(financeTransactions.id, transactionId),
            eq(financeTransactions.parentId, transactionId),
          ),
        ),
      );
    const scope = transactionAuditScope(beforeRows);
    const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await tx
      .delete(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.parentId, transactionId),
        ),
      );
    await tx
      .update(financeTransactions)
      .set({ isParent: false, updatedAt: now })
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, transactionId),
        ),
      );
    const [afterParent] = await tx
      .select(TRANSACTION_AUDIT_COLUMNS)
      .from(financeTransactions)
      .where(
        and(
          eq(financeTransactions.userId, userId),
          eq(financeTransactions.id, transactionId),
        ),
      )
      .limit(1);
    const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
    await writeFinanceAuditEvent(tx, userId, {
      kind: "transaction_split",
      origin: "Register",
      summary: "Removed a transaction split.",
      scope,
      beforeCheckpoint,
      afterCheckpoint,
      changes: beforeRows.map((row) => ({
        entityType:
          row.id === transactionId ? "transaction" : "transaction_split_child",
        entityIdentity: row.id,
        before: transactionAuditFields(row),
        after:
          row.id === transactionId && afterParent
            ? transactionAuditFields(afterParent)
            : null,
      })),
    });
  });
  await markAmazonMatchSplitProtected(userId, transactionId);
}
