/**
 * SimpleFIN's wire shapes translated into this register's shapes. Pure, and the place every
 * judgement about provider data lives — `client.ts` and `sync.ts` around it are plumbing.
 *
 * **The sign convention is the thing to be careful about, and it is careful in the opposite
 * direction from the last provider.** SimpleFIN states that positive amounts are deposits,
 * which is exactly this register's rule, so amounts pass through untouched. The previous
 * implementation negated every amount because Plaid signed the other way. Carrying that
 * habit forward would invert every row while looking entirely plausible on screen, so the
 * absence of a negation here is deliberate and is asserted by tests in both directions.
 *
 * Amounts arrive as decimal **strings**, so `parseAmountCents` reads them exactly and the
 * float-rounding question the previous provider raised does not arise at all.
 */

import type { FinanceAccountKind } from "@/db/schema";
import { parseAmountCents } from "@/lib/finances/money";
import type { ParsedTransaction } from "@/lib/finances/types";

/** One transaction as SimpleFIN reports it. */
export type SimpleFinTransaction = {
  id: string;
  /** Unix seconds when it posted. `0` while pending. */
  posted: number;
  /** Decimal string. **Positive is a deposit** — the register's own convention. */
  amount: string;
  description: string;
  /** Unix seconds when it actually happened, where the provider knows. */
  transacted_at?: number | null;
  pending?: boolean;
  extra?: Record<string, unknown> | null;
};

/** One account, with the transactions that fell in the requested window. */
export type SimpleFinAccount = {
  id: string;
  name: string;
  conn_id?: string;
  currency?: string;
  /** Decimal string, module sign: positive is money held. */
  balance: string;
  /** Balance net pending, where supplied. */
  "available-balance"?: string | null;
  /** Unix seconds — when the balance was true, not when we asked. */
  "balance-date"?: number | null;
  org?: { name?: string | null; domain?: string | null; url?: string | null } | null;
  transactions?: SimpleFinTransaction[];
};

/** The `/accounts` envelope. */
export type SimpleFinAccountSet = {
  /** Per-connection problems. Present even on a 200, and must not fail the whole sync. */
  errors?: string[];
  errlist?: unknown[];
  accounts?: SimpleFinAccount[];
};

/** Unix seconds → `YYYY-MM-DD`, or null for the `0` that marks a pending row. */
export function epochToDateKey(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** A decimal amount string into signed cents, in the register's convention already. */
export function amountToCents(amount: string): number | null {
  return parseAmountCents(amount);
}

/** True when the provider is still holding this row unposted. */
export function isPending(transaction: SimpleFinTransaction): boolean {
  // Two independent signals, either of which means unposted. `posted: 0` is the protocol's
  // required marker; `pending` is optional and not every server sets it.
  return transaction.pending === true || !transaction.posted;
}

/**
 * SimpleFIN reports no account type, so the kind is inferred from the name it shows.
 *
 * Deliberately conservative: an unrecognised name lands on `other` rather than guessing
 * `checking`, because the kind drives how an account is grouped in every report and a wrong
 * guess is quieter than a missing one. The user renames and re-kinds accounts in the
 * register anyway — the importer never touches an existing account's kind.
 */
export function accountKindFromName(name: string): FinanceAccountKind {
  const text = name.toLowerCase();
  if (/\b(credit|card|visa|mastercard|amex)\b/.test(text)) return "credit_card";
  if (/\b(savings|saver|hsa|money market)\b/.test(text)) return "savings";
  if (/\b(checking|chequing|cash management|spend)\b/.test(text)) return "checking";
  if (/\b(cd|certificate)\b/.test(text)) return "savings";
  if (/\b(loan|mortgage|student)\b/.test(text)) return "loan";
  if (/\b(ira|401k|brokerage|invest)\b/.test(text)) return "investment";
  return "other";
}

/**
 * The balance for an account, in module sign — positive is money you have.
 *
 * **Stored as reported, with no branch on account type.** SimpleFIN's convention already
 * matches the register's, so a credit card comes back negative on its own. The previous
 * provider needed a branch here because it reported a card's balance as the positive amount
 * owed; keeping that branch would flip every card to an asset.
 */
export function balanceCentsOf(account: SimpleFinAccount): number | null {
  return amountToCents(account.balance);
}

/** Balance net pending, where the provider supplies one. */
export function availableCentsOf(account: SimpleFinAccount): number | null {
  const available = account["available-balance"];
  if (available === null || available === undefined || available === "") return null;
  return amountToCents(available);
}

/**
 * When the balance was true according to the provider, or **null when it will not say**.
 *
 * There is deliberately no fallback to the read time. Stamping an undated response "now"
 * is the lie that lets a stale figure outrank a fresher browser capture or file import —
 * the whole defect `sourceAuthority.ts` exists to make unrepresentable.
 */
export function balanceAsOf(account: SimpleFinAccount): Date | null {
  const reported = epochToDateKey(account["balance-date"]);
  if (!reported || !account["balance-date"]) return null;
  return new Date(account["balance-date"] * 1000);
}

/**
 * A SimpleFIN transaction into the shape the importer already speaks.
 *
 * `postedDate` stays null while pending — the row has not posted, and claiming a posted date
 * would be a lie the register cannot tell apart from a real one. `transacted_at` is when the
 * money was actually spent, which is what the register sorts and buckets on; it falls back
 * to the posted day when the provider does not supply it.
 *
 * Returns null for a row whose amount will not parse. One unusable row should not abort a
 * sync; the caller counts it and moves on.
 */
export function toParsedTransaction(
  transaction: SimpleFinTransaction,
): (ParsedTransaction & { pending: boolean }) | null {
  const cents = amountToCents(transaction.amount);
  if (cents === null) return null;

  const pending = isPending(transaction);
  const postedKey = epochToDateKey(transaction.posted);
  const transactedKey = epochToDateKey(transaction.transacted_at);
  const transactionDate = transactedKey ?? postedKey;
  // Nothing usable to date it by. A row with neither timestamp cannot be placed in the
  // register at all, so it is dropped the same way an unparseable amount is.
  if (!transactionDate) return null;

  return {
    transactionDate,
    postedDate: pending ? null : postedKey,
    description: transaction.description,
    // No negation. See the file header — this is the line that inverts the whole register
    // if it is "fixed" to match the previous provider.
    amountCents: cents,
    // SimpleFIN has no category of its own; `extra` is server-specific and not a contract.
    sourceCategory: "",
    memo: "",
    balanceAfterCents: null,
    externalId: transaction.id,
    pending,
  };
}

/**
 * Candidate register accounts for a provider account, best first.
 *
 * SimpleFIN gives no mask field, so the match is on trailing digits in the account name —
 * "Chase Prime Visa ...9910" against `externalKey` "9910". Deliberately returns candidates
 * rather than picking: the user confirms each link, because a wrong one merges two real
 * accounts and is near-impossible to unpick.
 */
export function trailingDigits(name: string): string | null {
  const match = /(\d{4})\D*$/.exec(name.trim());
  return match ? match[1] : null;
}

export function linkCandidates(
  account: SimpleFinAccount,
  registerAccounts: readonly { id: string; externalKey: string; kind: string }[],
): string[] {
  const digits = trailingDigits(account.name);
  if (!digits) return [];
  const kind = accountKindFromName(account.name);

  return registerAccounts
    .filter((candidate) => candidate.externalKey.trim().endsWith(digits))
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

/** The institution name, where the provider names one. */
export function institutionOf(account: SimpleFinAccount): string {
  return account.org?.name?.trim() || "";
}
