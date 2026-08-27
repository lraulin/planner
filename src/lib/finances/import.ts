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
  looksLikeCapitalOneCardStatement,
  parseCapitalOneCardStatement,
} from "./capitalOneCardStatement";
import {
  looksLikeChaseCreditStatement,
  parseChaseCreditStatement,
} from "./chaseStatement";
import { fingerprintAll } from "./fingerprint";
import { parseFinanceCsv } from "./formats";
import {
  DATE_TOLERANCE_DAYS,
  selectNewAgainstMixed,
  type TaggedRow,
} from "./liveFeedMatch";
import { centsToNumericString, numericStringToCents } from "./money";
import { looksLikeCoinbaseCsv, parseCoinbaseCsv } from "./coinbaseCsv";
import { persistPaypalResolutions } from "./paypalResolutions";
import { looksLikePlannerPending } from "./capitalOnePending";
import { replaceScrapedPending } from "./scrapePending";
import {
  looksLikePaypalStatement,
  parsePaypalStatement,
  type PaypalEntry,
} from "./paypalStatement";
import { extractPdfText, isPdfBytes } from "./pdf";
import {
  looksLikeCapitalOne360Statement,
  parseCapitalOne360Statement,
} from "./statement";
import {
  FEED_LABELS,
  SUPPORTED_STATEMENT_PDFS,
  type ImportResult,
  type ParsedAccount,
  type ParsedFinanceCsv,
  type ParsedStatement,
} from "./types";
import {
  finalizeTransactionIngestion,
  transactionIngestionWatermark,
} from "./ingestion";
import { defaultOffBudget } from "./accountKind";
import { includeNewOnBudgetAccount } from "./budget/membership";
import { bankRows } from "./splitRows";

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
): Promise<{ id: string; created: boolean; kind: (typeof account)["kind"] }> {
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
  if (existing) return { id: existing.id, created: false, kind: account.kind };

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
      offBudget: defaultOffBudget(account.kind),
    })
    // Two uploads racing on a brand-new account: let the index win, then read the winner.
    .onConflictDoNothing()
    .returning({ id: financeAccounts.id });
  if (row) return { id: row.id, created: true, kind: account.kind };

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
  return { id: raced.id, created: false, kind: account.kind };
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

type ParsedFile =
  | { ok: false; error: string }
  | { ok: true; kind: "paypal"; entries: PaypalEntry[] }
  | { ok: true; kind: "ledger"; parsed: ParsedFinanceCsv };

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

/**
 * Rows already on this account across the dates the file covers.
 *
 * The range is widened by the live-feed date tolerance because a row the **sync** wrote
 * carries the aggregator's date, not the bank's, and the two differ by a day or two. A row
 * dated just outside the file's own range is still the same event, and loading only the
 * file's range hides exactly those — which duplicates every transaction on the boundary.
 */
/** A `YYYY-MM-DD` day shifted by whole days. Noon UTC so no timezone can move the date. */
function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function existingOnAccount(
  tx: Executor,
  userId: string,
  accountId: string,
  incoming: readonly { transactionDate: string }[],
): Promise<TaggedRow[]> {
  if (incoming.length === 0) return [];
  const dates = incoming.map((row) => row.transactionDate);
  const from = shiftDateKey(
    dates.reduce((min, d) => (d < min ? d : min)),
    -DATE_TOLERANCE_DAYS,
  );
  const to = shiftDateKey(
    dates.reduce((max, d) => (d > max ? d : max)),
    DATE_TOLERANCE_DAYS,
  );
  const rows = await tx
    .select({
      transactionDate: financeTransactions.transactionDate,
      amount: financeTransactions.amount,
      description: financeTransactions.description,
      externalSource: financeTransactions.externalSource,
    })
    .from(financeTransactions)
    .where(
      and(
        eq(financeTransactions.userId, userId),
        // Bank rows: an import compares a file's lines against the bank rows already held.
        // A child is not one, and matching a file line to one would attach the file's
        // identity to half a charge.
        bankRows,
        eq(financeTransactions.accountId, accountId),
        gte(financeTransactions.transactionDate, from),
        lte(financeTransactions.transactionDate, to),
      ),
    );
  return rows.map((row) => ({
    transactionDate: row.transactionDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    description: row.description,
    // Only a live feed's rows get the looser comparison. Everything else keeps the exact
    // matching that CSV-to-CSV dedup already relies on.
    fromLiveFeed: row.externalSource === "api:simplefin",
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
  if (looksLikePaypalStatement(text)) {
    return { ok: true, kind: "paypal", entries: parsePaypalStatement(text) };
  }
  if (looksLikeCoinbaseCsv(text)) {
    const parsed = parseCoinbaseCsv(file.name, text);
    return parsed.ok ? { ok: true, kind: "ledger", parsed: parsed.parsed } : parsed;
  }
  if (looksLikeChaseCreditStatement(text)) {
    const parsed = parseChaseCreditStatement(file.name, text);
    return parsed.ok ? { ok: true, kind: "ledger", parsed: parsed.parsed } : parsed;
  }
  if (looksLikeCapitalOne360Statement(text)) {
    const parsed = parseCapitalOne360Statement(file.name, text);
    return parsed.ok ? { ok: true, kind: "ledger", parsed: parsed.parsed } : parsed;
  }
  if (looksLikeCapitalOneCardStatement(text)) {
    const parsed = parseCapitalOneCardStatement(file.name, text);
    return parsed.ok ? { ok: true, kind: "ledger", parsed: parsed.parsed } : parsed;
  }
  if (isPdf) {
    return {
      ok: false,
      error: `"${file.name}" is not a recognised statement. ${SUPPORTED_STATEMENT_PDFS}`,
    };
  }
  const parsed = parseFinanceCsv(file.name, text);
  return parsed.ok ? { ok: true, kind: "ledger", parsed: parsed.parsed } : parsed;
}

/**
 * Import one or more bank/card CSV exports, Chase Prime Visa monthly statements,
 * Capital One card monthly statements, Capital One 360 statement PDFs, PayPal
 * monthly statements, or a Coinbase transaction-history CSV. PayPal files write
 * resolutions, not register rows. Each file's format is detected on its own.
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
  const importStartedAt = await transactionIngestionWatermark();
  const warnings: string[] = [];
  let created = 0;
  let skipped = 0;
  let accountsCreated = 0;
  let statementsCreated = 0;
  let statementsSkipped = 0;
  let resolutionsCreated = 0;
  let resolutionsSkipped = 0;

  for (const file of files) {
    const text = file.text ?? "";
    if (looksLikePlannerPending(text)) {
      try {
        const outcome = await replaceScrapedPending(userId, text, "");
        created += outcome.inserted;
        skipped += outcome.skippedPosted;
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `${file.name}: ${error.message}`
            : `"${file.name}" failed.`,
        );
      }
      continue;
    }

    const parsed = await parseImportFile(file);
    if (!parsed.ok) {
      warnings.push(parsed.error);
      continue;
    }

    if (parsed.kind === "paypal") {
      if (parsed.entries.length === 0) {
        warnings.push(
          `${file.name} looked like a PayPal statement but had no transactions.`,
        );
        continue;
      }
      const outcome = await persistPaypalResolutions(userId, parsed.entries);
      resolutionsCreated += outcome.created;
      resolutionsSkipped += outcome.skipped;
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
        const { keep, skipCount } = selectNewAgainstMixed(
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
          externalId: transaction.externalId ?? ids[i],
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
          accountId: resolved.id,
          accountCreated: resolved.created,
          accountKind: resolved.kind,
          inserted,
          skipped: skipCount + (values.length - inserted),
          statementsCreated: snapshotCounts.created,
          statementsSkipped: snapshotCounts.skipped,
        };
      });

      if (outcome.accountCreated) {
        accountsCreated += 1;
        if (!defaultOffBudget(outcome.accountKind)) {
          await includeNewOnBudgetAccount(userId, outcome.accountId);
        }
      }
      created += outcome.inserted;
      skipped += outcome.skipped;
      statementsCreated += outcome.statementsCreated;
      statementsSkipped += outcome.statementsSkipped;
    }
  }

  if (created > 0) {
    await finalizeTransactionIngestion(userId, {
      applyAutoCategorySince: importStartedAt,
    });
  }

  return {
    created,
    skipped,
    accountsCreated,
    statementsCreated,
    statementsSkipped,
    resolutionsCreated,
    resolutionsSkipped,
    warnings,
  };
}
