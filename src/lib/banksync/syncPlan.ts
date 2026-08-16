/**
 * A fetched window of provider data reconciled against what the register already holds.
 * Pure, so the rules that decide what gets written are testable without a database.
 *
 * SimpleFIN has no cursor and no delta feed: every fetch returns the current truth for a
 * date window. So the comparison is ours to make, and three rules carry the weight:
 *
 * 1. **A `modified` row must not clobber user-owned columns.** `category` and `notes`
 *    belong to the user after import; the provider has no opinion about them and must not
 *    blank them when it revises a description.
 * 2. **A stored pending row that has vanished from the window is deleted.** There is no
 *    `pending_transaction_id` here, so a charge that posts simply appears under a new id
 *    while the pending id stops being reported. Without the delete the two coexist and the
 *    account double-counts.
 * 3. **A row already covered by a statement import is not inserted twice.** The first sync
 *    on an account whose history came from CSVs overlaps them completely.
 *
 * Rules 2 and 3 interact in a way that is easy to get wrong, and there is a test for it:
 * the pending rows being deleted must be **excluded** from the cross-source comparison,
 * or the newly posted row matches the pending row it replaces and is dropped as a duplicate
 * — leaving the account with neither.
 */

import { selectNewTransactions } from "@/lib/finances/matchExisting";
import type { ParsedTransaction } from "@/lib/finances/types";
import { toParsedTransaction, type SimpleFinAccount } from "./mapping";

/** A row to write, already resolved to a register account. */
export type BankInsert = {
  accountId: string;
  externalId: string;
  pending: boolean;
  transaction: ParsedTransaction;
};

/**
 * A revision to an existing row. Deliberately narrow: only the columns the provider owns.
 *
 * `category`, `notes`, `flowOverride`, `excludeFromBaseline` and `eventLabel` are absent on
 * purpose — those are the user's, and a revision arriving days later must not undo a
 * categorisation they made by hand.
 */
export type BankUpdate = {
  externalId: string;
  transactionDate: string;
  postedDate: string | null;
  description: string;
  amountCents: number;
  pending: boolean;
};

/** An existing register row, for cross-source comparison. */
export type ExistingRow = {
  transactionDate: string;
  amountCents: number;
  description: string;
  /** Non-null only for rows this feed wrote. */
  externalId: string | null;
  pending: boolean;
};

export type SyncPlan = {
  inserts: BankInsert[];
  updates: BankUpdate[];
  /** External ids to delete: stored pending rows the provider no longer reports. */
  deletes: string[];
  /** Provider accounts carrying data that no register account is linked to. */
  unlinkedAccountIds: string[];
  skippedUnparseable: number;
  skippedDuplicate: number;
};

export type SyncPlanInput = {
  accounts: readonly SimpleFinAccount[];
  /** Provider account id → `finance_accounts.id`, for confirmed links only. */
  accountIdByExternal: ReadonlyMap<string, string>;
  /** Existing rows per register account, covering at least the fetched window. */
  existingByAccount: ReadonlyMap<string, readonly ExistingRow[]>;
  /**
   * Inclusive start of the window that was fetched, `YYYY-MM-DD`.
   *
   * Deletes are confined to it. Without that bound, a narrow window would delete every
   * pending row older than it simply for not having been asked about.
   */
  windowStart: string;
};

export function planSync(input: SyncPlanInput): SyncPlan {
  const { accounts, accountIdByExternal, existingByAccount, windowStart } = input;

  const inserts: BankInsert[] = [];
  const updates: BankUpdate[] = [];
  const unlinked: string[] = [];
  let skippedUnparseable = 0;

  const candidatesByAccount = new Map<string, BankInsert[]>();
  /** Provider ids seen in this window, per register account. */
  const seenByAccount = new Map<string, Set<string>>();

  for (const account of accounts) {
    const accountId = accountIdByExternal.get(account.id);
    if (!accountId) {
      // The provider returns every account on the connection, including ones the user never
      // linked. Recorded rather than dropped silently: a missing link is the kind of thing
      // that otherwise surfaces months later as "why is half my spending missing".
      if (!unlinked.includes(account.id)) unlinked.push(account.id);
      continue;
    }

    const existing = existingByAccount.get(accountId) ?? [];
    const knownIds = new Set(
      existing.flatMap((row) => (row.externalId ? [row.externalId] : [])),
    );
    const seen = seenByAccount.get(accountId) ?? new Set<string>();
    seenByAccount.set(accountId, seen);

    for (const transaction of account.transactions ?? []) {
      const row = toParsedTransaction(transaction);
      if (!row) {
        skippedUnparseable++;
        continue;
      }
      seen.add(transaction.id);

      if (knownIds.has(transaction.id)) {
        updates.push({
          externalId: transaction.id,
          transactionDate: row.transactionDate,
          postedDate: row.postedDate,
          description: row.description,
          amountCents: row.amountCents,
          pending: row.pending,
        });
        continue;
      }

      const insert: BankInsert = {
        accountId,
        externalId: transaction.id,
        pending: row.pending,
        transaction: {
          transactionDate: row.transactionDate,
          postedDate: row.postedDate,
          description: row.description,
          amountCents: row.amountCents,
          sourceCategory: row.sourceCategory,
          memo: row.memo,
          balanceAfterCents: row.balanceAfterCents,
          externalId: row.externalId,
        },
      };
      const bucket = candidatesByAccount.get(accountId);
      if (bucket) bucket.push(insert);
      else candidatesByAccount.set(accountId, [insert]);
    }
  }

  // Stored pending rows inside the window that the provider stopped reporting. Either they
  // posted under a new id, or the bank dropped them; both mean the row must go.
  const deletes: string[] = [];
  const deleted = new Set<string>();
  for (const [accountId, seen] of seenByAccount) {
    for (const row of existingByAccount.get(accountId) ?? []) {
      if (!row.pending || !row.externalId) continue;
      if (row.transactionDate < windowStart) continue;
      if (seen.has(row.externalId)) continue;
      deletes.push(row.externalId);
      deleted.add(row.externalId);
    }
  }

  // Cross-source dedup, per account. The rows being deleted are excluded first: a pending
  // row that just posted still matches its replacement on date, amount and description, so
  // leaving it in would drop the posted row as a duplicate of a row about to disappear.
  let skippedDuplicate = 0;
  for (const [accountId, candidates] of candidatesByAccount) {
    const existing = (existingByAccount.get(accountId) ?? []).filter(
      (row) => !(row.externalId && deleted.has(row.externalId)),
    );
    if (existing.length === 0) {
      inserts.push(...candidates);
      continue;
    }
    const { keep } = selectNewTransactions(
      existing,
      candidates.map((candidate) => candidate.transaction),
    );
    const kept = new Set(keep);
    for (const candidate of candidates) {
      if (kept.has(candidate.transaction)) inserts.push(candidate);
      else skippedDuplicate++;
    }
  }

  return {
    inserts,
    updates,
    deletes,
    unlinkedAccountIds: unlinked,
    skippedUnparseable,
    skippedDuplicate,
  };
}
