/**
 * Strict automatic matching of an Amazon charge to a posted bank row.
 *
 * Exact on account suffix, signed amount, calendar day and Amazon merchant, unique on both
 * sides, completed card charges only. Pending, rewards, refunds, splits and duplicates stay
 * in review — a fuzzy match that filed the wrong envelope would look entirely plausible.
 */

import { normalizeMerchant } from "@/lib/finances/classify/merchant";

export type MatchAccount = {
  id: string;
  externalKey: string;
  closedAt: Date | string | null;
};

export type MatchTransaction = {
  id: string;
  accountId: string;
  transactionDate: string;
  amountCents: number;
  pending: boolean;
  isParent: boolean;
  description: string;
  budgetCategoryId: string | null;
};

export type MatchCharge = {
  paymentId: string;
  date: string;
  amountCents: number | null;
  status: string;
  cardLast4: string | null;
  instrumentKind: string;
};

export type ExactMatch =
  | { kind: "auto"; transactionId: string; accountId: string }
  | {
      kind: "review";
      reason: string;
      candidateIds: string[];
    };

export function isAmazonMerchant(description: string): boolean {
  const merchant = normalizeMerchant(description);
  return (
    /\bAMAZON\b|\bAMZN\b/.test(merchant) ||
    merchant.startsWith("AMAZON") ||
    merchant.startsWith("AMZN")
  );
}

export function last4OfKey(externalKey: string): string {
  return externalKey.replace(/\D/g, "").slice(-4);
}

export function openAccountsWithLast4(
  accounts: readonly MatchAccount[],
  last4: string,
): MatchAccount[] {
  return accounts.filter(
    (account) => account.closedAt == null && last4OfKey(account.externalKey) === last4,
  );
}

/**
 * Pick the unique posted Amazon bank row for this charge, or explain why it cannot.
 *
 * `matchedChargeIds` / `matchedTransactionIds` are already-settled links so a second charge
 * cannot steal the same row.
 */
export function exactMatchCharge(
  charge: MatchCharge,
  accounts: readonly MatchAccount[],
  transactions: readonly MatchTransaction[],
  settled: { chargeIds: ReadonlySet<string>; transactionIds: ReadonlySet<string> },
): ExactMatch {
  if (settled.chargeIds.has(charge.paymentId)) {
    return {
      kind: "review",
      reason: "This charge is already matched.",
      candidateIds: [],
    };
  }
  if (charge.status !== "completed") {
    return {
      kind: "review",
      reason: "Only a completed card charge matches automatically.",
      candidateIds: [],
    };
  }
  if (charge.instrumentKind !== "card") {
    return {
      kind: "review",
      reason: "Rewards and other payment components stay evidence, not a bank match.",
      candidateIds: [],
    };
  }
  if (charge.amountCents === null) {
    return {
      kind: "review",
      reason: "The charge amount is missing.",
      candidateIds: [],
    };
  }
  if (!charge.cardLast4 || !charge.date) {
    return {
      kind: "review",
      reason: "The charge is missing its card suffix or date.",
      candidateIds: [],
    };
  }

  const accountsForCard = openAccountsWithLast4(accounts, charge.cardLast4);
  if (accountsForCard.length !== 1) {
    return {
      kind: "review",
      reason:
        accountsForCard.length === 0
          ? "No open account ends in that card suffix."
          : "More than one open account ends in that card suffix.",
      candidateIds: [],
    };
  }
  const account = accountsForCard[0];

  const candidates = transactions.filter((row) => {
    if (row.accountId !== account.id) return false;
    if (row.pending) return false;
    if (row.isParent) return false;
    if (settled.transactionIds.has(row.id)) return false;
    if (row.amountCents !== charge.amountCents) return false;
    if (row.transactionDate !== charge.date) return false;
    return isAmazonMerchant(row.description);
  });

  if (candidates.length === 1) {
    return { kind: "auto", transactionId: candidates[0].id, accountId: account.id };
  }
  if (candidates.length === 0) {
    const equalAmount = transactions.filter(
      (row) =>
        !row.pending &&
        !row.isParent &&
        !settled.transactionIds.has(row.id) &&
        row.amountCents === charge.amountCents &&
        isAmazonMerchant(row.description),
    );
    return {
      kind: "review",
      reason:
        equalAmount.length > 0
          ? "An equal-amount Amazon row exists, but the date or card does not match exactly."
          : "No posted Amazon row matches this charge exactly.",
      candidateIds: equalAmount.map((row) => row.id),
    };
  }
  return {
    kind: "review",
    reason: "More than one posted Amazon row matches this charge exactly.",
    candidateIds: candidates.map((row) => row.id),
  };
}

/**
 * Manual review may approve an equal-amount owned Amazon row outside the strict automatic
 * date/card match. Unequal totals remain impossible.
 */
export function canManuallyMatch(
  charge: MatchCharge,
  transaction: MatchTransaction,
):
  | { ok: true; dateMismatch: boolean; cardMismatch: boolean }
  | { ok: false; reason: string } {
  if (charge.amountCents === null || charge.amountCents !== transaction.amountCents) {
    return { ok: false, reason: "The totals are not equal." };
  }
  if (transaction.pending)
    return { ok: false, reason: "Pending bank rows cannot be matched." };
  if (transaction.isParent) {
    return { ok: false, reason: "An existing split is not rewritten automatically." };
  }
  if (!isAmazonMerchant(transaction.description)) {
    return { ok: false, reason: "That row is not an Amazon merchant." };
  }
  return {
    ok: true,
    dateMismatch: charge.date !== "" && charge.date !== transaction.transactionDate,
    cardMismatch: false,
  };
}
