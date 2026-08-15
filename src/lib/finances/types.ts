import type { FinanceAccountKind, FinanceFlowKind } from "@/db/schema";

/**
 * Which feed a row came from. A string union rather than a database enum because adding a
 * feed must not be a migration — `ALTER TYPE ... ADD VALUE` fails on Neon's pooler, and a
 * later Plaid or SimpleFIN sync should be a new member here and nothing else.
 */
export type FinanceFeed =
  | "csv:chase-credit"
  | "csv:capitalone-card"
  | "csv:capitalone-bank"
  | "csv:coinbase"
  | "api:plaid";

export const FINANCE_FEEDS: readonly FinanceFeed[] = [
  "csv:chase-credit",
  "csv:capitalone-card",
  "csv:capitalone-bank",
  "csv:coinbase",
  "api:plaid",
] as const;

/** Human label for a feed, for import summaries and warnings. */
export const FEED_LABELS: Record<FinanceFeed, string> = {
  "csv:chase-credit": "Chase credit card",
  "csv:capitalone-card": "Capital One card",
  "csv:capitalone-bank": "Capital One 360 bank",
  "csv:coinbase": "Coinbase",
  "api:plaid": "Bank sync",
};

/** Fail-closed PDF dispatch names every format we actually parse. */
export const SUPPORTED_STATEMENT_PDFS =
  "Supported PDFs are Chase Prime Visa monthly statements, Capital One card monthly statements, Capital One 360 monthly bank statements, and PayPal monthly statements.";

/**
 * One transaction as it comes out of a CSV, before it has an account id or a fingerprint.
 *
 * Money is carried as **integer cents** through the whole parse. Every source amount is a
 * decimal string, and the only safe way to add or compare those in JS is to leave the float
 * domain entirely; `src/lib/finances/money.ts` converts at both ends.
 */
export type ParsedTransaction = {
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  /** `YYYY-MM-DD`, or null when the feed does not distinguish posting. */
  postedDate: string | null;
  description: string;
  /** Signed; positive is money into the account. */
  amountCents: number;
  /** Whatever the bank called it; "" when the feed has no category column. */
  sourceCategory: string;
  /**
   * A note the user typed at the bank (Chase's Memo column). Seeded into `notes` when the
   * row is first created and never touched again, since `notes` is theirs after that.
   * Deliberately **not** part of the description, so editing a memo at the bank and
   * re-exporting does not look like a new transaction.
   */
  memo: string;
  /** Running balance where the feed supplies one. */
  balanceAfterCents: number | null;
  /**
   * The feed's own id, when it has one (Coinbase). Absent feeds get a fingerprint
   * at import. Kept off the hash so a later description tweak cannot duplicate a row
   * Coinbase already numbered.
   */
  externalId?: string;
};

/**
 * One account's worth of rows out of a single file. A file usually holds exactly one, but
 * the bank formats carry an account number per row, so parsing groups by it rather than
 * assuming.
 */
export type ParsedAccount = {
  /** Stable per-feed identifier — last four, account number. */
  externalKey: string;
  /** Default display name, used only when creating the account. */
  name: string;
  institution: string;
  kind: FinanceAccountKind;
  transactions: ParsedTransaction[];
  /**
   * Calendar day the account closed, when this file shows a close-out (the 360 CD).
   * Import sets `closedAt` only if it is currently null — it never un-closes.
   */
  closedOn?: string | null;
};

/** 1-based row numbers count the header as row 1, the way a spreadsheet does. */
export type RowError = { row: number; message: string };

export type ParsedStatementRate = {
  balanceType: string;
  /** 24.24, not basis points. */
  aprPercent: number;
  balanceSubjectCents: number | null;
  /** Module sign. */
  interestChargedCents: number | null;
};

/**
 * One official monthly statement, before it has an account id.
 *
 * Ledger totals (`opening`, `closing`, activity) are in the module sign. Facts that are
 * not ledger direction (min payment, credit line, YTD fees) are magnitudes as printed.
 */
export type ParsedStatement = {
  externalKey: string;
  periodStart: string;
  periodEnd: string;
  statementDate: string | null;
  openingBalanceCents: number;
  closingBalanceCents: number;
  paymentDueDate: string | null;
  minimumPaymentCents: number | null;
  pastDueAmountCents: number | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  paymentsCreditsCents: number | null;
  purchasesCents: number | null;
  cashAdvancesCents: number | null;
  balanceTransfersCents: number | null;
  feesChargedCents: number | null;
  interestChargedCents: number | null;
  ytdFeesCents: number | null;
  ytdInterestCents: number | null;
  rewardsPoints: number | null;
  rates: ParsedStatementRate[];
};

export type ParsedFinanceCsv = {
  feed: FinanceFeed;
  accounts: ParsedAccount[];
  statements: ParsedStatement[];
  errors: RowError[];
};

export type ImportResult = {
  created: number;
  skipped: number;
  accountsCreated: number;
  statementsCreated: number;
  statementsSkipped: number;
  /** PayPal enrichment rows. Not ledger inserts. */
  resolutionsCreated: number;
  resolutionsSkipped: number;
  warnings: string[];
};

/** An account with its derived balance, for the register's account picker. */
export type FinanceAccountRow = {
  id: string;
  name: string;
  kind: FinanceAccountKind;
  institution: string;
  externalSource: string;
  externalKey: string;
  closedAt: Date | null;
  /**
   * Headline current balance. Latest statement closing plus later txs when a
   * snapshot exists; otherwise the ledger sum.
   */
  balanceCents: number;
  /** Sum of every transaction on the account. */
  ledgerBalanceCents: number;
  statementClosingCents: number | null;
  statementPeriodEnd: string | null;
  /**
   * `ledger − headline`. Zero when nothing anchors the headline to an outside source.
   *
   * Against a live synced balance this is the more useful reading of the same number: how
   * far the register has drifted from what the bank says, i.e. whether the register is
   * complete.
   */
  balanceMismatchCents: number;
  /** When the live balance was read, or null for an account with no bank connection. */
  syncedBalanceAsOf: Date | null;
  transactionCount: number;
};

/**
 * One register row.
 *
 * Carries both halves of the classification split: `derived*` is what the classifier worked
 * out and is rewritten by every reclassify, while `category`, `flowOverride`,
 * `excludeFromBaseline` and `eventLabel` are yours and survive one. The register shows the
 * effective value of each and marks which is which.
 */
export type TransactionListRow = {
  id: string;
  accountId: string;
  accountName: string;
  transactionDate: string;
  postedDate: string | null;
  description: string;
  amountCents: number;
  sourceCategory: string;
  category: string | null;
  derivedCategory: string | null;
  derivedFlow: FinanceFlowKind | null;
  flowOverride: FinanceFlowKind | null;
  excludeFromBaseline: boolean;
  eventLabel: string;
  notes: string;
  balanceAfterCents: number | null;
};

export type TransactionFilter = {
  accountId?: string;
  /** Inclusive `YYYY-MM-DD` bounds. */
  from?: string;
  to?: string;
};

/** One stored statement snapshot, for tests and a later UI. */
export type StatementListRow = {
  id: string;
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  statementDate: string | null;
  openingBalanceCents: number;
  closingBalanceCents: number;
  paymentDueDate: string | null;
  minimumPaymentCents: number | null;
  pastDueAmountCents: number | null;
  creditLimitCents: number | null;
  availableCreditCents: number | null;
  paymentsCreditsCents: number | null;
  purchasesCents: number | null;
  cashAdvancesCents: number | null;
  balanceTransfersCents: number | null;
  feesChargedCents: number | null;
  interestChargedCents: number | null;
  ytdFeesCents: number | null;
  ytdInterestCents: number | null;
  rewardsPoints: number | null;
  rates: ParsedStatementRate[];
};

/** One stored statement plus the register check for that period. */
export type StatementViewRow = StatementListRow & {
  registerSumCents: number;
  registerDeltaCents: number;
  rowCount: number;
};
