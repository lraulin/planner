import { createHash } from "node:crypto";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  bankAccountLinks,
  financeAccounts,
  financeStatementRates,
  financeStatements,
  financeTransactions,
} from "@/db/schema";
import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
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
import {
  isScrapeFeed,
  looksLikeBankBrowserSnapshot,
  looksLikeLegacyPlannerPending,
} from "./bankSnapshot";
import { applyBankBrowserSnapshot } from "./bankSnapshotApply";
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
  type ParsedTransaction,
} from "./types";
import {
  finalizeTransactionIngestion,
  transactionIngestionWatermark,
} from "./ingestion";
import { defaultOffBudget } from "./accountKind";
import { includeNewOnBudgetAccount } from "./budget/membership";
import { bankRows } from "./splitRows";
import { retireCoveredScrapeRows } from "./feedHandoverWrite";
import { recordSourceState } from "./sourceStateWrite";
import { captureFinanceMoneyCheckpoint } from "./audit/checkpoints";
import type { FinanceAuditChange } from "./audit/types";
import { financeAuditBatchId, writeFinanceAuditEvent } from "./audit/writes";
import { monthKeyOf } from "./budget/envelope";
import {
  importedPostedHeadline,
  latestRunningBalance,
  type PostedActivityRow,
} from "./importedPostedBalance";

/**
 * Writing parsed CSV or statement rows into the register.
 *
 * Two rules shape everything here:
 *
 * 1. **Import inserts or skips transactions. It never updates them.** That is what makes
 *    the user-owned `category` and `notes` durable across re-imports without any field-level
 *    merge policy — an overlapping export simply cannot touch a row that already exists.
 *    Account-adjacent exceptions: `closedAt` on a 360 CD close-out (set when still null,
 *    never un-closed), and the live posted headline on a SimpleFIN-linked account — a file
 *    ahead of the aggregator writes `bankAccountLinks.balanceCents` under the same 36-hour
 *    scrape hold a browser snapshot uses, so income does not land without cash.
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
): Promise<{
  id: string;
  name: string;
  created: boolean;
  kind: (typeof account)["kind"];
}> {
  const [existing] = await tx
    .select({ id: financeAccounts.id, name: financeAccounts.name })
    .from(financeAccounts)
    .where(
      and(
        eq(financeAccounts.userId, userId),
        eq(financeAccounts.externalSource, externalSource),
        eq(financeAccounts.externalKey, account.externalKey),
      ),
    )
    .limit(1);
  if (existing) {
    return { id: existing.id, name: existing.name, created: false, kind: account.kind };
  }

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
  if (row) {
    return { id: row.id, name: account.name, created: true, kind: account.kind };
  }

  const [raced] = await tx
    .select({ id: financeAccounts.id, name: financeAccounts.name })
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
  return { id: raced.id, name: raced.name, created: false, kind: account.kind };
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

/**
 * Record what this file says the account's posted balance is, as of its own newest data day.
 *
 * The file writes only its own stamp. A CSV whose newest data day predates the stored
 * stamp still imports every row — backfill from an old export is legitimate and the feed
 * watermark already decides ownership — and simply does not move the headline (D4).
 */
async function recordImportedPostedHeadline(
  tx: Executor,
  userId: string,
  accountId: string,
  fileRows: readonly ParsedTransaction[],
  inserted: readonly PostedActivityRow[],
): Promise<{ changes: FinanceAuditChange[]; withheld: boolean }> {
  const [link] = await tx
    .select({
      balanceCents: bankAccountLinks.balanceCents,
      balanceAsOf: bankAccountLinks.balanceAsOf,
    })
    .from(bankAccountLinks)
    .where(
      and(
        eq(bankAccountLinks.userId, userId),
        eq(bankAccountLinks.accountId, accountId),
      ),
    )
    .limit(1);

  const headline = importedPostedHeadline({
    linked: link
      ? {
          balanceCents: link.balanceCents,
          asOfDate: link.balanceAsOf ? toDateKey(link.balanceAsOf) : null,
        }
      : null,
    running: latestRunningBalance(fileRows),
    inserted,
  });
  if (!headline) return { changes: [], withheld: false };

  const authority = await recordSourceState(tx, userId, accountId, {
    source: "file",
    balanceCents: headline.cents,
    availableCents: null,
    // Files carry no instant, only the day their newest data is from.
    asOf: null,
    asOfDay: headline.asOfDay,
  });
  return {
    changes: authority.changes,
    // No link means no headline to move, which is not something a receipt should report.
    withheld: !authority.headlineMoved && authority.headlineSource !== null,
  };
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
): Promise<{ created: number; skipped: number; changes: FinanceAuditChange[] }> {
  let created = 0;
  let skipped = 0;
  const changes: FinanceAuditChange[] = [];
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
    changes.push({
      entityType: "statement",
      entityIdentity: row.id,
      before: null,
      after: {
        accountId,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
        openingBalanceCents: snapshot.openingBalanceCents,
        closingBalanceCents: snapshot.closingBalanceCents,
        minimumPaymentCents: snapshot.minimumPaymentCents,
        creditLimitCents: snapshot.creditLimitCents,
        availableCreditCents: snapshot.availableCreditCents,
      },
    });
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
  return { created, skipped, changes };
}

function importEvidence(
  file: ImportFile,
  detectedFormat: string,
): Record<string, unknown> {
  const bytes = file.bytes ?? new TextEncoder().encode(file.text ?? "");
  return {
    filename: file.name,
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    detectedFormat,
  };
}

function importMonths(
  account: ParsedAccount,
  statements: readonly ParsedStatement[],
): string[] {
  return [
    ...new Set([
      ...account.transactions.map((row) => monthKeyOf(row.transactionDate)),
      ...statements.map((row) => monthKeyOf(row.periodEnd)),
    ]),
  ].sort();
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
      postedDate: financeTransactions.postedDate,
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
        // Either axis may fall in the window. A live feed dates a row by the day it
        // posted, so a row whose purchase day sits outside the file's range is still the
        // same event — and loading it is the only way the matcher can see it.
        or(
          and(
            gte(financeTransactions.transactionDate, from),
            lte(financeTransactions.transactionDate, to),
          ),
          and(
            gte(financeTransactions.postedDate, from),
            lte(financeTransactions.postedDate, to),
          ),
        ),
      ),
    );
  return rows.map((row) => ({
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: numericStringToCents(row.amount) ?? 0,
    description: row.description,
    // Only a live feed's rows get the looser comparison. Everything else keeps the exact
    // matching that CSV-to-CSV dedup already relies on.
    fromLiveFeed:
      row.externalSource === "api:simplefin" || isScrapeFeed(row.externalSource ?? ""),
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
  auditBatchId: requestedAuditBatchId,
}: {
  userId: string;
  files: readonly ImportFile[];
  /** Reused when one browser selection must be uploaded in several bounded requests. */
  auditBatchId?: string;
}): Promise<ImportResult> {
  const importStartedAt = await transactionIngestionWatermark();
  const batchId = requestedAuditBatchId ?? financeAuditBatchId();
  const warnings: string[] = [];
  let created = 0;
  let skipped = 0;
  let accountsCreated = 0;
  let statementsCreated = 0;
  let statementsSkipped = 0;
  let resolutionsCreated = 0;
  let resolutionsSkipped = 0;
  let auditBatchId: string | null = null;

  for (const file of files) {
    const text = file.text ?? "";
    if (looksLikeBankBrowserSnapshot(text) || looksLikeLegacyPlannerPending(text)) {
      try {
        const outcome = await applyBankBrowserSnapshot(userId, text, {
          auditBatchId: batchId,
        });
        created +=
          outcome.posted.inserted + outcome.posted.replaced + outcome.pending.inserted;
        skipped += outcome.posted.duplicates;
        auditBatchId = outcome.auditBatchId;
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
      const outcome = await db.transaction(async (tx) => {
        const budgetMonths = [
          ...new Set(parsed.entries.map((entry) => monthKeyOf(entry.date))),
        ].sort();
        const scope = { budgetMonths };
        const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
        const persisted = await persistPaypalResolutions(userId, parsed.entries, tx);
        const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
        const audit = await writeFinanceAuditEvent(tx, userId, {
          kind: "finance_import",
          origin: "PayPal statement import",
          batchId,
          summary: `${file.name}: stored ${persisted.created} PayPal resolution${persisted.created === 1 ? "" : "s"}; skipped ${persisted.skipped}.`,
          scope,
          sourceEvidence: importEvidence(file, "statement:paypal"),
          beforeCheckpoint,
          afterCheckpoint,
          changes: persisted.changes,
        });
        return { ...persisted, auditBatchId: audit.batchId };
      });
      resolutionsCreated += outcome.created;
      resolutionsSkipped += outcome.skipped;
      auditBatchId = outcome.auditBatchId;
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
        const scope = {
          accountIds: [resolved.id],
          accountNames: [resolved.name],
          budgetMonths: importMonths(account, snapshots),
        };
        const beforeCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
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
        const insertedMoney: {
          transactionDate: string;
          postedDate: string | null;
          amountCents: number;
        }[] = [];
        const transactionChanges: FinanceAuditChange[] = [];
        for (let start = 0; start < values.length; start += INSERT_CHUNK_ROWS) {
          const chunk = values.slice(start, start + INSERT_CHUNK_ROWS);
          const rows = await tx
            .insert(financeTransactions)
            .values(chunk)
            .onConflictDoNothing()
            .returning({
              id: financeTransactions.id,
              accountId: financeTransactions.accountId,
              transactionDate: financeTransactions.transactionDate,
              postedDate: financeTransactions.postedDate,
              amount: financeTransactions.amount,
              externalSource: financeTransactions.externalSource,
              externalId: financeTransactions.externalId,
            });
          inserted += rows.length;
          for (const row of rows) {
            const amountCents = numericStringToCents(row.amount) ?? 0;
            insertedMoney.push({
              transactionDate: row.transactionDate,
              postedDate: row.postedDate,
              amountCents,
            });
            transactionChanges.push({
              entityType: "transaction",
              entityIdentity: row.id,
              before: null,
              after: {
                accountId: row.accountId,
                transactionDate: row.transactionDate,
                postedDate: row.postedDate,
                amountCents,
                pending: false,
                externalSource: row.externalSource,
                externalId: row.externalId,
              },
            });
          }
        }

        const headline = await recordImportedPostedHeadline(
          tx,
          userId,
          resolved.id,
          account.transactions,
          insertedMoney,
        );

        // A file import advances the same watermark a sync does, so it hands the same days
        // over from the browser capture — in this transaction, for the same reason (D3).
        const handover = await retireCoveredScrapeRows(tx, userId, resolved.id);

        const headlineWarnings = headline.withheld
          ? [
              `${account.externalKey}: a more current figure is already in force, so this file's rows were imported but the balance was left alone.`,
            ]
          : [];

        const afterCheckpoint = await captureFinanceMoneyCheckpoint(userId, scope, tx);
        const changes: FinanceAuditChange[] = [
          ...(resolved.created
            ? [
                {
                  entityType: "account",
                  entityIdentity: resolved.id,
                  before: null,
                  after: {
                    kind: resolved.kind,
                    offBudget: defaultOffBudget(resolved.kind),
                    externalSource: feed,
                    externalKey: account.externalKey,
                  },
                },
              ]
            : []),
          ...transactionChanges,
          ...headline.changes,
          ...snapshotCounts.changes,
          ...handover.changes,
        ];
        const audit = await writeFinanceAuditEvent(tx, userId, {
          kind: "finance_import",
          origin: "File import",
          batchId,
          summary:
            `${file.name}: imported ${inserted} transaction${inserted === 1 ? "" : "s"}, ` +
            `${snapshotCounts.created} statement${snapshotCounts.created === 1 ? "" : "s"}; ` +
            `skipped ${skipCount + (values.length - inserted) + snapshotCounts.skipped}` +
            (handover.retired > 0
              ? `; retired ${handover.retired} browser row${handover.retired === 1 ? "" : "s"} this file now covers.`
              : "."),
          scope,
          warnings: [
            ...errors.map((error) => error.message),
            ...handover.warnings,
            ...headlineWarnings,
          ],
          sourceEvidence: importEvidence(file, feed),
          beforeCheckpoint,
          afterCheckpoint,
          changes,
        });

        return {
          accountId: resolved.id,
          accountCreated: resolved.created,
          accountKind: resolved.kind,
          inserted,
          skipped: skipCount + (values.length - inserted),
          statementsCreated: snapshotCounts.created,
          statementsSkipped: snapshotCounts.skipped,
          handoverWarnings: [...handover.warnings, ...headlineWarnings],
          auditBatchId: audit.batchId,
        };
      });

      if (outcome.accountCreated) {
        accountsCreated += 1;
        if (!defaultOffBudget(outcome.accountKind)) {
          await includeNewOnBudgetAccount(userId, outcome.accountId, {
            auditBatchId: batchId,
            auditOrigin: "File import",
          });
        }
      }
      warnings.push(...outcome.handoverWarnings);
      created += outcome.inserted;
      skipped += outcome.skipped;
      statementsCreated += outcome.statementsCreated;
      statementsSkipped += outcome.statementsSkipped;
      auditBatchId = outcome.auditBatchId;
    }
  }

  if (created > 0) {
    await finalizeTransactionIngestion(userId, {
      applyAutoCategorySince: importStartedAt,
      auditBatchId: batchId,
      auditOrigin: "File import classification",
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
    auditBatchId,
  };
}
