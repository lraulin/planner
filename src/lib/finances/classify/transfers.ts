/**
 * Finding the money that only looks like it was spent.
 *
 * A credit-card purchase is already a negative row on the card. Paying that card off is a
 * second negative row on the checking account, for the same money. Moving $500 into savings
 * is a negative and a positive that net to nothing. Add those up as "spending" and this data
 * set overstates outflow by roughly $350,000 — more than twice the real total.
 *
 * So transfers have to be identified, and identified as **pairs**. Knowing that a row is a
 * transfer is not enough on its own: the useful fact is which two rows are the same
 * movement, because that is what lets a report drop both halves without also dropping a
 * genuine purchase that happens to match an unrelated amount.
 *
 * Three signals, in descending confidence:
 *
 * 1. **The description names the other account.** Capital One writes the counterparty's
 *    masked number into the description (`Withdrawal to 360 Checking XXXXXXX2322`), and
 *    those last four match `finance_accounts.external_key` exactly. When that is present
 *    there is nothing to infer.
 * 2. **A known payment or transfer wording**, listed below. These are the movements whose
 *    counterparty the feed does not name.
 * 3. **An opposite-sign row of the same size on another account within a few days**, which
 *    turns a one-sided intent into a matched pair.
 *
 * Signal 3 is deliberately **not** used on its own. Pairing any two equal-and-opposite
 * amounts across accounts would eventually marry a purchase to an unrelated refund; every
 * real transfer in this data says so in words, so at least one leg must carry intent before
 * a pair is allowed to form.
 *
 * **An unpaired leg is still a transfer.** The Capital One card was imported two years after
 * the payments to it began, so 113 payments have no counterpart row anywhere in the data.
 * Requiring a partner would leave $109,248 counted as ordinary spending — the single largest
 * error this module exists to prevent.
 */

import { daysBetweenKeys } from "@/lib/schedule/geometry";

/** How far apart the two legs of one movement may post. Cards take a few days to credit a
 * payment; five covers every pair in this history without reaching far enough to marry two
 * unrelated rows. */
const PAIR_WINDOW_DAYS = 5;

/**
 * Money moving between two accounts we hold. Both legs drop out of spending entirely.
 *
 * `PYMT` and `PMT` are the same payment seen from the two sides — Capital One spells it one
 * way on the card and the other on the bank account.
 */
const INTERNAL_PATTERNS: readonly RegExp[] = [
  /CAPITAL ONE (MOBILE|ONLINE) (PMT|PYMT)/i,
  /CHASE CREDIT CRD (EPAY|AUTOPAY)/i,
  /PAYMENT THANK YOU/i,
  /AUTOMATIC PAYMENT/i,
  /RETURNED PAYMENT/i,
  /PAYCHECK PERCENTAGE/i,
  /OVERDRAFT TRANSFER/i,
  /CD CLOSE-?OUT/i,
];

/**
 * Money moving to or from an account outside this module — an old credit union, a PayPal
 * balance. Not spending, because it is still ours; not neutral, because only one leg will
 * ever exist here.
 *
 * The Pentagon Federal rows matter for a reason worth recording: they are a sweep from a
 * bank that was never imported, so treating them as income would invent earnings we cannot
 * see, and treating them as spending would invent losses. Income before 2024 simply is not
 * observable from the accounts that exist here.
 */
const EXTERNAL_PATTERNS: readonly RegExp[] = [
  /PAYPAL (TO|FROM) LEE RAULIN/i,
  /PENTAGON FEDERAL/i,
];

/** Capital One's masked counterparty: `XXXXXXX2322`. The last four are the account key. */
const MASKED_ACCOUNT = /X{3,}\s*(\d{4})/gi;

export type TransferRow = {
  id: string;
  accountId: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  description: string;
  amountCents: number;
};

export type TransferAccount = {
  id: string;
  /** Last four / account number, as the importer stored it. */
  externalKey: string;
};

export type TransferKind = "internal_transfer" | "external_transfer";

export type TransferMatch = {
  /** Transaction id → the flow it should carry. */
  flows: Map<string, TransferKind>;
  /** Ids belonging to one movement. The caller mints a `transferGroupId` per group — this
   * module stays pure so its output is reproducible in a test. */
  groups: string[][];
};

/** Account keys named in a description, excluding the account the row is already on. */
function counterpartyKeys(description: string): string[] {
  const keys: string[] = [];
  for (const match of description.matchAll(MASKED_ACCOUNT)) keys.push(match[1]);
  return keys;
}

function intentOf(
  row: TransferRow,
  keyToAccount: ReadonlyMap<string, string>,
): { kind: TransferKind; counterpartyAccountId: string | null } | null {
  // Signal 1 — the description names another account we hold.
  for (const key of counterpartyKeys(row.description)) {
    const accountId = keyToAccount.get(key);
    if (accountId !== undefined && accountId !== row.accountId) {
      return { kind: "internal_transfer", counterpartyAccountId: accountId };
    }
  }

  // Signal 2 — known wording.
  if (EXTERNAL_PATTERNS.some((pattern) => pattern.test(row.description))) {
    return { kind: "external_transfer", counterpartyAccountId: null };
  }
  if (INTERNAL_PATTERNS.some((pattern) => pattern.test(row.description))) {
    return { kind: "internal_transfer", counterpartyAccountId: null };
  }
  return null;
}

/**
 * Classify transfers across a user's whole history and pair the legs that belong together.
 *
 * Rows are processed in date order so the result does not depend on how the caller happened
 * to sort them, and a candidate partner is chosen by closest date with the id as a
 * tiebreak — two identical candidates must not pair differently between runs, or a
 * reclassify would churn the data it just wrote.
 */
export function matchTransfers(
  rows: readonly TransferRow[],
  accounts: readonly TransferAccount[],
): TransferMatch {
  const keyToAccount = new Map(
    accounts.map((account) => [account.externalKey, account.id]),
  );

  const ordered = [...rows].sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      left.id.localeCompare(right.id),
  );

  const flows = new Map<string, TransferKind>();
  const intents = new Map<
    string,
    { kind: TransferKind; counterpartyAccountId: string | null }
  >();
  for (const row of ordered) {
    const intent = intentOf(row, keyToAccount);
    if (intent) {
      intents.set(row.id, intent);
      flows.set(row.id, intent.kind);
    }
  }

  // Index by absolute amount so finding a partner does not rescan the whole history.
  const byAmount = new Map<number, TransferRow[]>();
  for (const row of ordered) {
    const magnitude = Math.abs(row.amountCents);
    const bucket = byAmount.get(magnitude);
    if (bucket) bucket.push(row);
    else byAmount.set(magnitude, [row]);
  }

  const groups: string[][] = [];
  const paired = new Set<string>();

  // Two passes, and the order between them is load-bearing. A row that names its
  // counterparty knows strictly more than one that only says "payment", so it claims its
  // partner first. Run them together and a same-day, same-amount payment on an unrelated
  // account can take the partner that a named row was entitled to.
  const startOrder = [
    ...ordered.filter((row) => intents.get(row.id)?.counterpartyAccountId != null),
    ...ordered.filter((row) => intents.get(row.id)?.counterpartyAccountId == null),
  ];

  for (const row of startOrder) {
    if (paired.has(row.id)) continue;
    const intent = intents.get(row.id);
    // Only a row that already reads as a transfer may start a pair — see the module note.
    if (!intent || intent.kind !== "internal_transfer") continue;
    if (row.amountCents === 0) continue;

    const candidates = (byAmount.get(Math.abs(row.amountCents)) ?? []).filter(
      (other) =>
        other.id !== row.id &&
        !paired.has(other.id) &&
        other.accountId !== row.accountId &&
        // Opposite sign: the two halves of one movement.
        Math.sign(other.amountCents) === -Math.sign(row.amountCents) &&
        Math.abs(daysBetweenKeys(row.transactionDate, other.transactionDate)) <=
          PAIR_WINDOW_DAYS &&
        (intent.counterpartyAccountId === null ||
          other.accountId === intent.counterpartyAccountId),
    );

    if (candidates.length === 0) continue;

    candidates.sort(
      (left, right) =>
        Math.abs(daysBetweenKeys(row.transactionDate, left.transactionDate)) -
          Math.abs(daysBetweenKeys(row.transactionDate, right.transactionDate)) ||
        left.id.localeCompare(right.id),
    );

    const partner = candidates[0];
    paired.add(row.id);
    paired.add(partner.id);
    groups.push([row.id, partner.id]);
    // The partner inherits the flow even when its own wording said nothing — a leg is a
    // transfer because of what it is part of, not because of how the bank worded it.
    flows.set(partner.id, "internal_transfer");
  }

  return { flows, groups };
}
