/**
 * `/transactions/sync` deltas turned into row operations. Pure, so the rules that decide
 * what gets written are testable without a database or a network.
 *
 * Plaid tells us exactly what changed — `added`, `modified`, `removed` against a cursor —
 * so this applies those literally rather than re-deriving them. That is the whole reason
 * the sync does not need the occurrence-ordinal fingerprint the CSV importer depends on.
 *
 * Three rules here are load-bearing and none of them is obvious from the endpoint:
 *
 * 1. **A `modified` row must not clobber user-owned columns.** `category` and `notes`
 *    belong to the user after import; Plaid has no opinion about them and must not blank
 *    them when it revises a description.
 * 2. **A posted row replaces the pending row it names.** `pending_transaction_id` points at
 *    the row Plaid is superseding, so the pending row is deleted in the same breath as the
 *    posted one is inserted. Without this the two coexist and the account double-counts.
 * 3. **Rows the statement importer already has are skipped, not inserted twice.** The first
 *    sync on an account whose history came from CSVs overlaps them completely.
 */

import { selectNewTransactions } from "@/lib/finances/matchExisting";
import type { ParsedTransaction } from "@/lib/finances/types";
import { toParsedTransaction, type PlaidTransaction } from "./mapping";

/** A row to write, already resolved to a register account. */
export type PlaidInsert = {
  accountId: string;
  externalId: string;
  pending: boolean;
  transaction: ParsedTransaction;
};

/**
 * A revision to an existing row. Deliberately narrow: only the columns Plaid owns.
 *
 * `category`, `notes`, `flowOverride`, `excludeFromBaseline` and `eventLabel` are absent on
 * purpose — those are the user's, and a `modified` delta arriving weeks later must not undo
 * a categorisation they made by hand.
 */
export type PlaidUpdate = {
  externalId: string;
  transactionDate: string;
  postedDate: string | null;
  description: string;
  amountCents: number;
  sourceCategory: string;
  pending: boolean;
};

export type SyncPlan = {
  inserts: PlaidInsert[];
  updates: PlaidUpdate[];
  /** External ids to delete: Plaid's `removed`, plus pending rows that have now posted. */
  deletes: string[];
  /** Plaid accounts carrying transactions that no register account is linked to. */
  unlinkedPlaidAccountIds: string[];
  /** Rows whose amount would not parse. Counted rather than thrown on. */
  skippedUnparseable: number;
  /** Rows a statement or CSV import already covers. */
  skippedDuplicate: number;
};

export type SyncPlanInput = {
  added: readonly PlaidTransaction[];
  modified: readonly PlaidTransaction[];
  removed: readonly { transaction_id: string }[];
  /** Plaid `account_id` → `finance_accounts.id`, for confirmed links only. */
  accountIdByPlaidAccount: ReadonlyMap<string, string>;
  /** External ids already stored for these accounts, so `modified` can tell update from insert. */
  knownExternalIds: ReadonlySet<string>;
  /**
   * Existing rows per register account id, for cross-source dedup. Only needs to cover the
   * date range the deltas touch — the caller loads that window.
   */
  existingByAccount: ReadonlyMap<
    string,
    readonly { transactionDate: string; amountCents: number; description: string }[]
  >;
};

export function planSync(input: SyncPlanInput): SyncPlan {
  const {
    added,
    modified,
    removed,
    accountIdByPlaidAccount,
    knownExternalIds,
    existingByAccount,
  } = input;

  const inserts: PlaidInsert[] = [];
  const updates: PlaidUpdate[] = [];
  const deletes: string[] = [];
  const unlinked = new Set<string>();
  let skippedUnparseable = 0;

  // Candidate inserts are grouped by account so the cross-source matcher can run once per
  // account against that account's existing rows — the same shape `import.ts` uses.
  const candidatesByAccount = new Map<string, PlaidInsert[]>();

  const consider = (transaction: PlaidTransaction, allowUpdate: boolean): void => {
    const accountId = accountIdByPlaidAccount.get(transaction.account_id);
    if (!accountId) {
      // Plaid returns every account on the Item, including ones the user never linked.
      // Recorded rather than dropped silently: a missing link is the kind of thing that
      // otherwise surfaces months later as "why is half my spending missing".
      unlinked.add(transaction.account_id);
      return;
    }

    const row = toParsedTransaction(transaction);
    if (!row) {
      skippedUnparseable++;
      return;
    }

    // A posted row supersedes the pending row it names, wherever it arrives.
    if (transaction.pending_transaction_id) {
      deletes.push(transaction.pending_transaction_id);
    }

    if (allowUpdate && knownExternalIds.has(transaction.transaction_id)) {
      updates.push({
        externalId: transaction.transaction_id,
        transactionDate: row.transactionDate,
        postedDate: row.postedDate,
        description: row.description,
        amountCents: row.amountCents,
        sourceCategory: row.sourceCategory,
        pending: row.pending,
      });
      return;
    }

    // Already stored and not an update — Plaid re-sent a row we have. Nothing to do.
    if (knownExternalIds.has(transaction.transaction_id)) return;

    const insert: PlaidInsert = {
      accountId,
      externalId: transaction.transaction_id,
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
  };

  for (const transaction of added) consider(transaction, false);
  for (const transaction of modified) consider(transaction, true);

  for (const entry of removed) deletes.push(entry.transaction_id);

  // Cross-source dedup, per account. `selectNewTransactions` matches on date + signed cents
  // + fuzzy description, occurrence-counted — it exists precisely because the external-id
  // index cannot see that a Chase statement row and a Plaid row are the same event.
  let skippedDuplicate = 0;
  for (const [accountId, candidates] of candidatesByAccount) {
    const existing = existingByAccount.get(accountId) ?? [];
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
    // One id can arrive from both `removed` and a posted row's `pending_transaction_id`.
    deletes: [...new Set(deletes)],
    unlinkedPlaidAccountIds: [...unlinked],
    skippedUnparseable,
    skippedDuplicate,
  };
}
