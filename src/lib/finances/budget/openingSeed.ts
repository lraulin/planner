/**
 * One account's stored opening (`finance_accounts.budget_opening_cents`): statement-first,
 * today's live position as the fallback.
 *
 * Pure by design — the caller picks the statement and reads the register rows near its
 * close, so this module never touches the database. That split is what makes the statement
 * path testable without a fixture database and immune to drift: it only ever sees the fixed
 * window a statement already settled, never "whatever the register says today."
 *
 * Spec: `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D2.
 */

function cents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

/**
 * A closed statement, as the seed needs it. `closingCents` is the bank's **posted** balance
 * at the end of `periodEnd`, in module sign.
 */
export type SeedStatement = {
  periodStart: string;
  periodEnd: string;
  closingCents: number;
};

/**
 * A posted register row near a statement boundary. `postedDate` null means the source never
 * said, and the row is taken to have posted on its transaction date — the schema's own
 * fallback (`finance_transactions.posted_date`).
 */
export type SeedRow = {
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
};

export type OpeningSeed =
  | {
      openingCents: number;
      source: "statement";
      statementDateKey: string;
      /** The rows carried between the statement's close and the opening day, summed. */
      crossingCents: number;
    }
  | { openingCents: number; source: "bank-headline" };

/** What the cutover receipt says about where an opening came from. */
export function openingSeedLabel(seed: OpeningSeed): string {
  return seed.source === "statement"
    ? `seeded from the statement closing ${seed.statementDateKey}`
    : "seeded from the bank headline";
}

/**
 * The statement to anchor an opening on `dayKey`: the latest one closing on or before it,
 * else the earliest closing after it (a card whose first imported statement contains the
 * day).
 *
 * On or before first because then every row the walk carries is dated on or before the
 * day — pre-start history — so no register row dated after the start can leak into the
 * opening (D2: "must not absorb post-start register errors"). Anchoring after the day would
 * carry the rows dated between the start and that close instead.
 */
export function anchorStatement<S extends SeedStatement>(
  statements: readonly S[],
  dayKey: string,
): S | null {
  const onOrBefore = statements
    .filter((statement) => statement.periodEnd <= dayKey)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  if (onOrBefore[0]) return onOrBefore[0];
  const after = statements
    .filter((statement) => statement.periodEnd > dayKey)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return after[0] ?? null;
}

/**
 * Whether a row moves the account between a statement's close and the opening day, and in
 * which direction. A statement's closing balance is posted-basis; the budget's opening is the
 * transaction-date position the fold walks from (`openingPositionFor` filters on
 * `transaction_date`), so the rows to carry across are the ones whose two dates fall on
 * opposite sides:
 *
 * - dated on or before the day but posted after the close: missing from the closing balance,
 *   but part of the position → add;
 * - dated after the day but posted by the close: in the closing balance, but not yet part of
 *   the position → take out.
 *
 * Dating rows by transaction date alone is what put the original statement-first seed
 * $70.02 off on the real data: two Chase charges dated Jul 17–18 posted after the Jul 18
 * close, and a Capital One charge dated Jul 21 posted after the Jul 21 close, so neither
 * closing balance nor "rows dated after the close" held them.
 */
export function crossingSign(
  row: SeedRow,
  closeKey: string,
  dayKey: string,
): -1 | 0 | 1 {
  const postedKey = row.postedDate ?? row.transactionDate;
  if (row.transactionDate <= dayKey && postedKey > closeKey) return 1;
  if (row.transactionDate > dayKey && postedKey <= closeKey) return -1;
  return 0;
}

/**
 * Seed one account's opening: its position at the end of `dayKey` (the day before the start
 * month), in transaction-date terms.
 *
 * With a statement, that is the statement's closing balance carried to the day across the
 * rows {@link crossingSign} picks — a window the statement settled, so a register error dated
 * outside it cannot leak into the opening. Without one, `headlinePositionCents` is today's
 * live recomputation (`openingPositionFor`), which absorbs any post-start register error into
 * the opening, and the receipt says so.
 */
export function seedAccountOpening(
  anchor: { statement: SeedStatement; rows: readonly SeedRow[] } | null,
  dayKey: string,
  headlinePositionCents: number,
): OpeningSeed {
  if (!anchor) {
    return {
      openingCents: cents(headlinePositionCents, "opening seed"),
      source: "bank-headline",
    };
  }
  const closeKey = anchor.statement.periodEnd;
  const crossingCents = anchor.rows.reduce(
    (sum, row) =>
      sum +
      crossingSign(row, closeKey, dayKey) * cents(row.amountCents, "register row"),
    0,
  );
  return {
    openingCents: cents(
      cents(anchor.statement.closingCents, "statement closing balance") + crossingCents,
      "opening seed",
    ),
    source: "statement",
    statementDateKey: closeKey,
    crossingCents,
  };
}

export type AccountOpeningInput = {
  offBudget: boolean;
  budgetOpeningCents: number | null;
};

/**
 * The fold's opening input: the sum of every on-budget account's own recorded opening, once
 * every on-budget account has one. Until then it is the pre-Task-3 recorded total
 * (`legacyOpeningCents`), so a budget with an account still unseeded keeps behaving exactly
 * as it did before this column existed — nothing regresses between this column landing and
 * a cutover (or ordinary membership changes) seeding the rest.
 *
 * The fallback is deliberately temporary: once every on-budget account carries a recorded
 * opening, this always takes the sum, and `legacyOpeningCents` stops being read.
 */
export function effectiveOpeningCents(
  accounts: readonly AccountOpeningInput[],
  legacyOpeningCents: number,
): number {
  const onBudget = accounts.filter((account) => !account.offBudget);
  const allSeeded = onBudget.every((account) => account.budgetOpeningCents !== null);
  if (!allSeeded) return legacyOpeningCents;
  return onBudget.reduce((sum, account) => sum + (account.budgetOpeningCents ?? 0), 0);
}
