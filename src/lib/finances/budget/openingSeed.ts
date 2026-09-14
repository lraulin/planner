/**
 * One account's stored opening (`finance_accounts.budget_opening_cents`): statement-first,
 * today's live position as the fallback.
 *
 * Pure by design — the caller resolves which statement covers the day before the start
 * month and sums the register rows between its close and the start, so this module never
 * touches the database. That split is what makes the statement path testable without a
 * fixture database and immune to drift: it only ever sees the fixed window a statement
 * already settled, never "whatever the register says today."
 *
 * Spec: `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D2.
 */

function cents(value: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be integer cents, got ${value}`);
  }
  return value;
}

/** A statement whose period covers the day before the budget's start month. */
export type StatementCoverage = {
  /** The statement's closing balance, in cents, module sign. */
  closingCents: number;
  /** The day it closed on (`YYYY-MM-DD`), on or before the day before the start month. */
  closingDateKey: string;
};

export type OpeningSeed =
  | { openingCents: number; source: "statement"; statementDateKey: string }
  | { openingCents: number; source: "bank-headline" };

/** What the cutover receipt says about where an opening came from. */
export function openingSeedLabel(seed: OpeningSeed): string {
  return seed.source === "statement"
    ? `seeded from the statement closing ${seed.statementDateKey}`
    : "seeded from the bank headline";
}

/**
 * Seed one account's opening.
 *
 * When a statement covers the day before the start month, the opening is that statement's
 * closing balance plus the register rows between its close and the start — a fixed window
 * a later edit to the register cannot reach, so a statement-backed opening cannot absorb a
 * post-start register error. Only when no statement covers it does the seed fall back to
 * `headlinePositionCents`, today's live recomputation of that account's pre-start position —
 * the same figure the account would have gotten under the old single-total model, now
 * recorded once instead of recomputed on every load.
 */
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

export function seedAccountOpening(
  statement: StatementCoverage | null,
  rowsSinceCloseCents: number,
  headlinePositionCents: number,
): OpeningSeed {
  if (statement) {
    cents(statement.closingCents, "statement closing balance");
    cents(rowsSinceCloseCents, "rows since statement close");
    return {
      openingCents: cents(statement.closingCents + rowsSinceCloseCents, "opening seed"),
      source: "statement",
      statementDateKey: statement.closingDateKey,
    };
  }
  return {
    openingCents: cents(headlinePositionCents, "opening seed"),
    source: "bank-headline",
  };
}
