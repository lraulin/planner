import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financeAccounts, financeTransactions } from "@/db/schema";
import { fingerprintAll } from "./fingerprint";
import { parseFinanceCsv } from "./formats";
import { centsToNumericString } from "./money";
import { FEED_LABELS, type ImportResult, type ParsedAccount } from "./types";

/**
 * Writing parsed CSV rows into the register.
 *
 * Two rules shape everything here:
 *
 * 1. **Import inserts or skips. It never updates.** That is what makes the user-owned
 *    `category` and `notes` durable across re-imports without any field-level merge policy —
 *    an overlapping export simply cannot touch a row that already exists.
 * 2. **The database decides what is a duplicate**, via the partial unique index on
 *    `(user_id, external_source, external_id)`. `onConflictDoNothing` plus a count of what
 *    actually came back from `returning` means a double-submitted upload cannot duplicate
 *    rows even if application-side bookkeeping is wrong.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/** Postgres caps a statement's bind parameters; these rows have 13 columns each. */
const INSERT_CHUNK_ROWS = 500;

/**
 * Find the account this feed's key refers to, creating it the first time it is seen.
 *
 * Identity is `(externalSource, externalKey)`, never the name — so renaming "Chase •••9910"
 * to "Sapphire" keeps every future import landing in the same account. For the same reason
 * an existing account's name, kind and institution are left alone: they are the user's after
 * creation.
 */
async function resolveAccount(
  tx: Executor,
  userId: string,
  externalSource: string,
  account: ParsedAccount,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await tx
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.externalSource, externalSource),
        eq(financeAccounts.externalKey, account.externalKey),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, created: false };

  const [row] = await tx
    .insert(financeAccounts)
    .values({
      userId,
      name: account.name,
      kind: account.kind,
      institution: account.institution,
      externalSource,
      externalKey: account.externalKey,
    })
    // Two uploads racing on a brand-new account: let the index win, then read the winner.
    .onConflictDoNothing()
    .returning({ id: financeAccounts.id });
  if (row) return { id: row.id, created: true };

  const [raced] = await tx
    .select({ id: financeAccounts.id })
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.externalSource, externalSource),
        eq(financeAccounts.externalKey, account.externalKey),
      ),
    )
    .limit(1);
  if (!raced) throw new Error("Could not create the account for this import.");
  return { id: raced.id, created: false };
}

export type ImportFile = { name: string; text: string };

/**
 * Import one or more CSV exports. Each file's format is detected from its own header, so a
 * single upload can mix all four.
 *
 * A file that cannot be identified becomes a warning and is skipped; the rest still import.
 * Individual unparseable rows become warnings too. Only a call with no usable file at all
 * comes back empty.
 */
export async function importFinanceCsvFiles({
  userId,
  files,
}: {
  userId: string;
  files: readonly ImportFile[];
}): Promise<ImportResult> {
  const warnings: string[] = [];
  let created = 0;
  let skipped = 0;
  let accountsCreated = 0;

  for (const file of files) {
    const parsed = parseFinanceCsv(file.name, file.text);
    if (!parsed.ok) {
      warnings.push(parsed.error);
      continue;
    }

    const { feed, accounts, errors } = parsed.parsed;
    for (const error of errors) {
      warnings.push(`${file.name} row ${error.row}: ${error.message}`);
    }

    if (accounts.length === 0) {
      warnings.push(
        `${file.name} (${FEED_LABELS[feed]}) had no readable transactions.`,
      );
      continue;
    }

    for (const account of accounts) {
      const outcome = await db.transaction(async (tx) => {
        const resolved = await resolveAccount(tx, userId, feed, account);
        const ids = fingerprintAll(resolved.id, account.transactions);

        const values = account.transactions.map((transaction, i) => ({
          userId,
          accountId: resolved.id,
          transactionDate: transaction.transactionDate,
          postedDate: transaction.postedDate,
          description: transaction.description,
          amount: centsToNumericString(transaction.amountCents),
          sourceCategory: transaction.sourceCategory,
          // The bank's memo seeds the note once, at creation. After that `notes` is the
          // user's, and since import never updates, nothing can overwrite what they write.
          notes: transaction.memo,
          balanceAfter:
            transaction.balanceAfterCents === null
              ? null
              : centsToNumericString(transaction.balanceAfterCents),
          externalSource: feed,
          externalId: ids[i],
        }));

        let inserted = 0;
        for (let start = 0; start < values.length; start += INSERT_CHUNK_ROWS) {
          const chunk = values.slice(start, start + INSERT_CHUNK_ROWS);
          const rows = await tx
            .insert(financeTransactions)
            .values(chunk)
            .onConflictDoNothing()
            .returning({ id: financeTransactions.id });
          inserted += rows.length;
        }

        return {
          accountCreated: resolved.created,
          inserted,
          skipped: values.length - inserted,
        };
      });

      if (outcome.accountCreated) accountsCreated += 1;
      created += outcome.inserted;
      skipped += outcome.skipped;
    }
  }

  return { created, skipped, accountsCreated, warnings };
}
