/**
 * Plaid's wire shapes translated into this register's shapes. Pure, and the place every
 * judgement about Plaid data lives — `client.ts` and `sync.ts` around it are plumbing.
 *
 * Two conventions differ from Plaid's and both are silent when wrong, which is why they are
 * here with tests rather than inline at the call site:
 *
 * 1. **Sign.** Plaid's `amount` is positive for money *out*. This register is positive for
 *    money *in*, uniformly across account kinds. So every transaction amount is negated.
 * 2. **Balances.** A credit account's `current` is the amount *owed* — a positive number.
 *    This register (and `finance_statements` before it) stores a card's balance negative.
 *    So balances negate for `credit` and not for `depository`, which is the one place the
 *    two mappings disagree.
 */

import type { FinanceAccountKind } from "@/db/schema";
import { parseAmountCents } from "@/lib/finances/money";
import type { ParsedTransaction } from "@/lib/finances/types";

/** The subset of Plaid's account object this feature reads. */
export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  /** `depository`, `credit`, `loan`, `investment`, `brokerage`, `other`. */
  type: string;
  subtype?: string | null;
  /** Last four of the account number. Plaid's name for it; our `externalKey`. */
  mask?: string | null;
  balances?: {
    available?: number | null;
    current?: number | null;
    limit?: number | null;
    iso_currency_code?: string | null;
  } | null;
};

/** The subset of Plaid's transaction object this feature reads. */
export type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  /** `YYYY-MM-DD`, the posted or occurred date. */
  date: string;
  /** `YYYY-MM-DD` when the institution authorised it. Often null. */
  authorized_date?: string | null;
  /** Raw description as the bank wrote it. */
  name: string;
  /** Plaid's cleaned merchant name. Not adopted as an authority — see `sourceCategory`. */
  merchant_name?: string | null;
  /** Positive is money OUT. Negated on the way in. */
  amount: number;
  pending: boolean;
  /** On a posted row, the id of the pending row it replaced. */
  pending_transaction_id?: string | null;
  personal_finance_category?: { primary?: string | null } | null;
};

/**
 * A Plaid amount into signed cents, still in Plaid's sign convention.
 *
 * Goes via the decimal string rather than `Math.round(amount * 100)` because the input is a
 * JSON float: `23631.9805 * 100` is `2363198.0499999998`, and rounding that is luck rather
 * than arithmetic. `String()` gives the shortest round-tripping decimal, which
 * `parseAmountCents` then converts exactly — the same path every CSV amount already takes.
 */
export function plaidAmountToCents(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  return parseAmountCents(String(amount));
}

/**
 * Plaid's account taxonomy onto `financeAccountKindEnum`.
 *
 * Subtype decides within `depository` because "checking" and "savings" are different rows in
 * every report; everything Plaid calls `credit` is a card here, since the register has no
 * other credit kind. Unknown types land on `other` rather than throwing — a new Plaid
 * subtype should not fail an entire sync.
 */
export function accountKindOf(account: PlaidAccount): FinanceAccountKind {
  const subtype = (account.subtype ?? "").toLowerCase();
  switch (account.type.toLowerCase()) {
    case "depository":
      if (subtype === "savings" || subtype === "hsa") return "savings";
      if (subtype === "checking" || subtype === "cash management") return "checking";
      return "savings";
    case "credit":
      return "credit_card";
    case "loan":
      return "loan";
    case "investment":
    case "brokerage":
      return "investment";
    default:
      return "other";
  }
}

/**
 * The live balance for an account, in module sign — positive is money you have.
 *
 * Returns `current`, negated for credit accounts. Null when Plaid supplies no `current`,
 * which is preferable to falling back to `available`: on a credit account `available` is
 * *remaining credit*, a different quantity entirely, and substituting it would silently
 * report a card with $2,000 of headroom as $2,000 of assets.
 */
export function balanceCentsOf(account: PlaidAccount): number | null {
  const current = account.balances?.current;
  if (current === null || current === undefined) return null;
  const cents = plaidAmountToCents(current);
  if (cents === null) return null;
  return account.type.toLowerCase() === "credit" ? -cents : cents;
}

/**
 * Ledger net pending, in module sign — **depository accounts only**.
 *
 * Null for credit accounts on purpose. Plaid reuses `available` there for remaining credit,
 * so storing it in a column named "available balance" would put a number that means one
 * thing under a label that means another.
 */
export function availableCentsOf(account: PlaidAccount): number | null {
  if (account.type.toLowerCase() === "credit") return null;
  const available = account.balances?.available;
  if (available === null || available === undefined) return null;
  return plaidAmountToCents(available);
}

/**
 * A Plaid transaction into the shape the importer already speaks.
 *
 * `postedDate` stays null while pending — the row has not posted, so claiming a posted date
 * would be a lie the register cannot tell apart from a real one. Once posted, Plaid's `date`
 * is the posted date and `authorized_date` is when it happened, so the two swap into place.
 *
 * Returns null for a row whose amount will not parse. One unusable row should not abort a
 * sync; the caller counts it and moves on.
 */
export function toParsedTransaction(
  transaction: PlaidTransaction,
):
  | (ParsedTransaction & { pending: boolean; pendingTransactionId: string | null })
  | null {
  const cents = plaidAmountToCents(transaction.amount);
  if (cents === null) return null;

  return {
    // Authorised date is when the money was actually spent; Plaid's `date` is when it
    // landed. The register sorts and buckets on the spend date, matching the CSV feeds.
    transactionDate: transaction.authorized_date || transaction.date,
    postedDate: transaction.pending ? null : transaction.date,
    description: transaction.name,
    // The whole reason this module exists. See the file header.
    amountCents: -cents,
    // Plaid's own category, recorded as the bank's label the way every CSV feed's category
    // column is. It is not adopted as a classification authority: `derivedCategory` stays
    // the classifier's, so `effectiveCategory`'s fallback chain keeps one owner.
    sourceCategory: transaction.personal_finance_category?.primary ?? "",
    memo: "",
    // Plaid supplies no running balance.
    balanceAfterCents: null,
    externalId: transaction.transaction_id,
    pending: transaction.pending,
    pendingTransactionId: transaction.pending_transaction_id ?? null,
  };
}

/**
 * Candidate register accounts for a Plaid account, best first.
 *
 * Matching is on the mask (last four) against `externalKey`, which is what the CSV feeds
 * already store. Deliberately returns candidates rather than picking: the user confirms each
 * link, because a wrong one merges two real accounts and is near-impossible to unpick.
 *
 * An account with no mask yields no candidates — a blank key would otherwise match every
 * register account whose `externalKey` is also blank.
 */
export function linkCandidates(
  account: PlaidAccount,
  registerAccounts: readonly { id: string; externalKey: string; kind: string }[],
): string[] {
  const mask = (account.mask ?? "").trim();
  if (!mask) return [];
  const kind = accountKindOf(account);

  return registerAccounts
    .filter((candidate) => candidate.externalKey.trim().endsWith(mask))
    .sort((a, b) => {
      // A same-kind match outranks a bare digit coincidence: two accounts really can end in
      // the same four digits at different institutions.
      const aKind = a.kind === kind ? 0 : 1;
      const bKind = b.kind === kind ? 0 : 1;
      if (aKind !== bKind) return aKind - bKind;
      return a.externalKey.localeCompare(b.externalKey);
    })
    .map((candidate) => candidate.id);
}

/** A default display name for an account we end up creating rather than linking. */
export function accountNameOf(account: PlaidAccount, institution: string): string {
  const base = account.name || account.official_name || "Account";
  const mask = (account.mask ?? "").trim();
  const prefix = institution ? `${institution} ` : "";
  return mask ? `${prefix}${base} •••${mask}` : `${prefix}${base}`;
}
