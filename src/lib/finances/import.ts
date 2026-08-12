import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  financeAccounts,
  financeStatementRates,
  financeStatements,
  financeTransactions,
} from "@/db/schema";
import { fromDateKey } from "@/lib/schedule/geometry";
import {
  looksLikeChaseCreditStatement,
  parseChaseCreditStatement,
} from "./chaseStatement";
import { fingerprintAll } from "./fingerprint";
import { parseFinanceCsv } from "./formats";
import { selectNewTransactions } from "./matchExisting";
import { centsToNumericString, numericStringToCents } from "./money";
import { extractPdfText, isPdfBytes } from "./pdf";
import {
  looksLikeCapitalOne360Statement,
  parseCapitalOne360Statement,
} from "./statement";
import {
  FEED_LABELS,
  type ImportResult,
  type ParsedAccount,
  type ParsedFinanceCsv,
  type ParsedStatement,
} from "./types";

/**
 * Writing parsed CSV or statement rows into the register.
 *
 * Two rules shape everything here:
 *
 * 1. **Import inserts or skips transactions. It never updates them.** That is what makes
 *    the user-owned `category` and `notes` durable across re-imports without any field-level
 *    merge policy — an overlapping export simply cannot touch a row that already exists.
 *    The one exception is `closedAt` on an account: a 360 CD close-out sets it when it is
 *    still null, and never un-closes.
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
      closedAt: account.closedOn ? fromDateKey(account.closedOn) : null,
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

/**
 * Set `closedAt` from a statement close-out, but only if nobody has closed it already.
 * Import still never un-closes, and it never touches name / kind / institution.
 */
async function markClosedIfNeeded(
  tx: Executor,
  userId: string,
  accountId: string,
  closedOn: string | null | undefined,
): Promise<void> {
  if (!closedOn) return;
  await tx
    .update(financeAccounts)
    .set({ closedAt: fromDateKey(closedOn), updatedAt: new Date() })
    .where(
      and(
        eq(financeAccounts.id, accountId),
        eq(financeAccounts.userId, userId),
        isNull(financeAccounts.closedAt),
      ),
    );
}

export type ImportFile = { name: string; text?: string; bytes?: Uint8Array };

type ParsedFile = { ok: false; error: string } | { ok: true; parsed: ParsedFinanceCsv };

function optionalCents(cents: number | null | undefined): string | null {
  return cents === null || cents === undefined ? null : centsToNumericString(cents);
}

async function persistStatements(
  tx: Executor,
  userId: string,
  accountId: string,
  feed: string,
  snapshots: readonly ParsedStatement[],
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const snapshot of snapshots) {
    const [row] = await tx
      .insert(financeStatements)
      .values({
        userId,
        accountId,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        statementDate: snapshot.statementDate,
        openingBalance: centsToNumericString(snapshot.openingBalanceCents),
        closingBalance: centsToNumericString(snapshot.closingBalanceCents),
        paymentDueDate: snapshot.paymentDueDate,
        minimumPayment: optionalCents(snapshot.minimumPaymentCents),
        pastDueAmount: optionalCents(snapshot.pastDueAmountCents),
        creditLimit: optionalCents(snapshot.creditLimitCents),
        availableCredit: optionalCents(snapshot.availableCreditCents),
        paymentsCredits: optionalCents(snapshot.paymentsCreditsCents),
        purchases: optionalCents(snapshot.purchasesCents),
        cashAdvances: optionalCents(snapshot.cashAdvancesCents),
        balanceTransfers: optionalCents(snapshot.balanceTransfersCents),
        feesCharged: optionalCents(snapshot.feesChargedCents),
        interestCharged: optionalCents(snapshot.interestChargedCents),
        ytdFees: optionalCents(snapshot.ytdFeesCents),
        ytdInterest: optionalCents(snapshot.ytdInterestCents),
        rewardsPoints: snapshot.rewardsPoints,
        externalSource: feed,
        // Include the last-four: a 360 PDF has three accounts in the same period.
        externalId: `${snapshot.externalKey}|${snapshot.periodStart}|${snapshot.periodEnd}`,
      })
      .onConflictDoNothing()
      .returning({ id: financeStatements.id });
    if (!row) {
      skipped += 1;
      continue;
    }
    created += 1;
    if (snapshot.rates.length === 0) continue;
    await tx.insert(financeStatementRates).values(
      snapshot.rates.map((rate) => ({
        userId,
        statementId: row.id,
        balanceType: rate.balanceType,
        aprPercent: rate.aprPercent.toFixed(3),
        balanceSubject: optionalCents(rate.balanceSubjectCents),
        interestCharged: optionalCents(rate.interestChargedCents),
      })),
    );
  }
  return { created, skipped };
}

async function existingOnAccount(
  tx: Executor,
  userId: string,
  accountId: string,
  incoming: readonly { transactionDate: string }[],
): Promise<{ transactionDate: string; amountCents: number; description: string }[]> {
  if (incoming.length === 0) return [];
  const dates = incoming.map((row) => row.transactionDate);
  const from = dates.reduce((min, d) => (d < min ? d : min));
  const to = dates.reduce((max, d) => (d > max ? d : max));
  const rows = await tx
    .select({
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
      description: financeTransactions.description,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        eq(financeTransactions.accountId, accountId),
        gte(financeTransactions.transactionDate, from),
        lte(financeTransactions.transactionDate, to),
      ),
    );
  return rows.map((row) => ({
    transactionDate: row.transactionDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    description: row.description,
  }));
}

async function parseImportFile(file: ImportFile): Promise<ParsedFile> {
  let text = file.text ?? "";
  if (
    file.bytes &&
    file.bytes.length > 0 &&
    (isPdfBytes(file.bytes) || /\.pdf$/i.test(file.name))
  ) {
    try {
      text = await extractPdfText(file.bytes);
    } catch {
      return {
        ok: false,
        error: `"${file.name}" could not be read as a PDF.`,
      };
    }
  }

  if (text.trim() === "") {
    return { ok: false, error: `"${file.name}" is empty.` };
  }
  const isPdf = isPdfBytes(file.bytes ?? new Uint8Array()) || /\.pdf$/i.test(file.name);
  if (looksLikeChaseCreditStatement(text)) {
    return parseChaseCreditStatement(file.name, text);
  }
  if (looksLikeCapitalOne360Statement(text)) {
    return parseCapitalOne360Statement(file.name, text);
  }
  if (isPdf) {
    return {
      ok: false,
      error: `"${file.name}" is not a recognised statement. Supported PDFs are Chase Prime Visa monthly statements and Capital One 360 monthly bank statements.`,
    };
  }
  return parseFinanceCsv(file.name, text);
}

/**
 * Import one or more bank/card CSV exports, Chase Prime Visa monthly statements, or
 * Capital One 360 statement PDFs. Each file's format is detected on its own.
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
  let statementsCreated = 0;
  let statementsSkipped = 0;

  for (const file of files) {
    const parsed = await parseImportFile(file);
    if (!parsed.ok) {
      warnings.push(parsed.error);
      continue;
    }

    const { feed, accounts, statements, errors } = parsed.parsed;
    for (const error of errors) {
      warnings.push(
        error.row > 0
          ? `${file.name} row ${error.row}: ${error.message}`
          : error.message,
      );
    }

    if (accounts.length === 0) {
      warnings.push(
        `${file.name} (${FEED_LABELS[feed]}) had no readable transactions.`,
      );
      continue;
    }

    for (const account of accounts) {
      const snapshots = statements.filter(
        (snapshot) => snapshot.externalKey === account.externalKey,
      );
      const outcome = await db.transaction(async (tx) => {
        const resolved = await resolveAccount(tx, userId, feed, account);
        await markClosedIfNeeded(tx, userId, resolved.id, account.closedOn);
        const snapshotCounts = await persistStatements(
          tx,
          userId,
          resolved.id,
          feed,
          snapshots,
        );

        const already = await existingOnAccount(
          tx,
          userId,
          resolved.id,
          account.transactions,
        );
        const { keep, skipCount } = selectNewTransactions(
          already,
          account.transactions,
        );
        const ids = fingerprintAll(resolved.id, keep);

        const values = keep.map((transaction, i) => ({
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
          skipped: skipCount + (values.length - inserted),
          statementsCreated: snapshotCounts.created,
          statementsSkipped: snapshotCounts.skipped,
        };
      });

      if (outcome.accountCreated) accountsCreated += 1;
      created += outcome.inserted;
      skipped += outcome.skipped;
      statementsCreated += outcome.statementsCreated;
      statementsSkipped += outcome.statementsSkipped;
    }
  }

  return {
    created,
    skipped,
    accountsCreated,
    statementsCreated,
    statementsSkipped,
    warnings,
  };
}
