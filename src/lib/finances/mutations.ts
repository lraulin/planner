import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeTransactions,
  type FinanceAccountKind,
} from "@/db/schema";

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
};

/** Edit the user-owned half of a transaction: its category and notes. */
export async function updateTransaction(
  userId: string,
  transactionId: string,
  edit: TransactionEdit,
): Promise<void> {
  await requireTransaction(userId, transactionId);

  const values: {
    category?: string | null;
    notes?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (edit.category !== undefined) {
    // A blank string and "uncategorised" are the same thing to a person, so store one of
    // them. Null is the uncategorised value, matching the nullable column.
    const trimmed = edit.category === null ? null : edit.category.trim();
    values.category = trimmed === "" ? null : trimmed;
  }
  if (edit.notes !== undefined) values.notes = edit.notes;

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

/** Delete an account and, by cascade, every transaction on it. */
export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  await requireAccount(userId, accountId);
  await db
    .delete(financeAccounts)
    .where(and(eq(financeAccounts.id, accountId), eq(financeAccounts.userId, userId)));
}
