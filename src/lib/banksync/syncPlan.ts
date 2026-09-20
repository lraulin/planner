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
 * 2. **A stored pending row that has vanished from the window is deleted — once its posted
 *    successor is identified, and never before.** There is no `pending_transaction_id` here,
 *    so a charge that posts simply appears under a new id while the pending id stops being
 *    reported. Without the delete the two coexist and the account double-counts. But the
 *    provider's silence is not proof of a successor, so absence alone authorizes nothing
 *    (`agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/` D5): a hold with
 *    no identifiable successor is kept and flagged, and one that has a successor hands its
 *    envelope, notes and flow onto it before it goes — which the old blanket delete never
 *    did, dropping the user's categorisation whenever a SimpleFIN hold posted.
 * 3. **A row already covered by a statement import is not inserted twice.** The first sync
 *    on an account whose history came from CSVs overlaps them completely.
 *
 * Rules 2 and 3 interact in a way that is easy to get wrong, and there is a test for it:
 * every pending row must be **excluded** from the cross-source comparison, or a newly
 * posted row matches the pending row it replaces and is dropped as a duplicate — leaving
 * the account with neither. That includes scrape-pending from Capital One, which have no
 * SimpleFIN id and would otherwise sit in the comparison set forever.
 *
 * The same "leaving neither" failure applies to **every browser row**, posted or not. The
 * feed handover (`feedHandoverWrite.ts`) deletes browser rows once this sync's watermark
 * covers them, trusting that the feed wrote its own copy. So a browser row may never be
 * the reason a feed row is not written: a posted SimpleFIN row is always inserted, and
 * only a SimpleFIN *hold* defers to the browser's fresh pending set. Matching a feed row
 * to a browser row cost SMECO and Neon charges on 2026-09-10 — both skipped here as
 * duplicates of posted browser rows, then retired with nothing to replace them.
 */

import { carryableFields, type CarriedState } from "@/lib/finances/feedHandover";
import { resolveLostHold, type PairableRow } from "@/lib/finances/feedPairing";
import { selectUnmatched } from "@/lib/finances/liveFeedMatch";
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
  /** The bank's posting day, when the source that wrote this row distinguishes one. */
  postedDate: string | null;
  amountCents: number;
  description: string;
  /** Non-null only for rows this feed wrote. */
  externalId: string | null;
  pending: boolean;
  /**
   * Written by a bank-page capture (`scrape:*`). Never an identity for a feed row: the
   * handover retires it once the feed covers its day, so matching against it drops money.
   */
  fromBrowser: boolean;
  /** Browser pending on an account whose 36-hour bank-page authority is still live. */
  authoritativeBrowserPending?: boolean;
  /** The row's own id — what a carry onto an existing posted row targets. */
  id?: string;
  /** The user's half of the row: what a hold hands its successor when it retires. */
  budgetCategoryId?: string | null;
  notes?: string;
  flowOverride?: CarriedState["flowOverride"];
  /** Already flagged as kept-but-unlisted by an earlier sync. */
  unlistedAt?: Date | null;
};

/** A vanished hold's user state, moving onto the row that succeeded it. */
export type SyncCarry = {
  /** The retiring hold, by provider id. */
  fromExternalId: string;
  /** The successor: a row already stored, or one this same sync is inserting. */
  to: { rowId: string } | { externalId: string };
  carry: Partial<CarriedState>;
};

export type SyncPlan = {
  inserts: BankInsert[];
  updates: BankUpdate[];
  /** External ids to delete: vanished stored holds whose posted successor is identified. */
  deletes: string[];
  /** Applied before `deletes`, so a retiring hold's envelope is never lost with it. */
  carries: SyncCarry[];
  /**
   * External ids of vanished holds with no identifiable successor: kept and flagged for the
   * user, not deleted. The provider stopping its report is not evidence the money is gone.
   */
  unlisted: string[];
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

function stateOf(row: ExistingRow): CarriedState {
  return {
    budgetCategoryId: row.budgetCategoryId ?? null,
    notes: row.notes ?? "",
    flowOverride: row.flowOverride ?? null,
  };
}

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
  // posted under a new id, or the bank dropped them — and the feed cannot say which, so what
  // happens to each is decided below, once the posted candidates are known.
  const vanished: { accountId: string; row: ExistingRow }[] = [];
  for (const [accountId, seen] of seenByAccount) {
    for (const row of existingByAccount.get(accountId) ?? []) {
      if (!row.pending || !row.externalId) continue;
      if (row.transactionDate < windowStart) continue;
      if (seen.has(row.externalId)) continue;
      vanished.push({ accountId, row });
    }
  }
  const deleted = new Set(vanished.map(({ row }) => row.externalId));

  // Cross-source dedup, per account, using `crossSource.ts` rather than the CSV importer's
  // matcher — a live feed and a statement disagree on dates and wrap descriptions in ways
  // that exact matching cannot see. The rows being deleted are excluded first: a pending
  // row that just posted still matches its replacement on date, amount and description, so
  // leaving it in would drop the posted row as a duplicate of a row about to disappear.
  let skippedDuplicate = 0;
  for (const [accountId, candidates] of candidatesByAccount) {
    const accountExisting = existingByAccount.get(accountId) ?? [];
    // The browser's fresh pending set outranks SimpleFIN's holds, and nothing more. A posted
    // candidate is history: the handover retires the browser hold it settles, in the same
    // commit that inserts it, so suppressing it here would lose the charge.
    const authoritativePending = accountExisting.filter(
      (row) => row.pending && row.authoritativeBrowserPending,
    );
    const pageAuthority = selectUnmatched(
      authoritativePending,
      candidates
        .filter((candidate) => candidate.pending)
        .map((candidate) => candidate.transaction),
    );
    const allowedHolds = new Set(pageAuthority.keep);
    const allowedCandidates = candidates.filter(
      (candidate) => !candidate.pending || allowedHolds.has(candidate.transaction),
    );
    skippedDuplicate += candidates.length - allowedCandidates.length;

    const existing = accountExisting.filter(
      (row) =>
        !row.pending &&
        !row.fromBrowser &&
        !(row.externalId && deleted.has(row.externalId)),
    );
    if (existing.length === 0) {
      inserts.push(...allowedCandidates);
      continue;
    }
    const { keep } = selectUnmatched(
      existing,
      allowedCandidates.map((candidate) => candidate.transaction),
    );
    const kept = new Set(keep);
    for (const candidate of allowedCandidates) {
      if (kept.has(candidate.transaction)) inserts.push(candidate);
      else skippedDuplicate++;
    }
  }

  // Every vanished hold looks for its successor among posted rows already stored and posted
  // rows this sync is about to insert (`resolveLostHold`: amount band, seven days, description
  // to rank). A found successor takes its state and the hold goes; anything else stays.
  const deletes: string[] = [];
  const carries: SyncCarry[] = [];
  const unlisted: string[] = [];
  for (const { accountId, row } of vanished) {
    const externalId = row.externalId!;
    const candidates: {
      pairable: PairableRow;
      target: SyncCarry["to"];
      state: CarriedState;
    }[] = [];
    for (const stored of existingByAccount.get(accountId) ?? []) {
      if (stored.pending || stored.fromBrowser || !stored.id) continue;
      candidates.push({
        pairable: { ...stored, id: stored.id },
        target: { rowId: stored.id },
        state: stateOf(stored),
      });
    }
    for (const insert of inserts) {
      if (insert.accountId !== accountId || insert.pending) continue;
      candidates.push({
        pairable: { ...insert.transaction, id: insert.externalId },
        target: { externalId: insert.externalId },
        state: {
          budgetCategoryId: null,
          notes: insert.transaction.memo,
          flowOverride: null,
        },
      });
    }
    const resolution = resolveLostHold(
      { ...row, id: externalId },
      candidates.map((candidate) => candidate.pairable),
    );
    if (resolution.outcome !== "carry") {
      unlisted.push(externalId);
      continue;
    }
    const successor = candidates.find(
      (candidate) => candidate.pairable.id === resolution.postedId,
    )!;
    deletes.push(externalId);
    const carry = carryableFields(stateOf(row), successor.state);
    if (Object.keys(carry).length > 0) {
      carries.push({ fromExternalId: externalId, to: successor.target, carry });
    }
  }

  return {
    inserts,
    updates,
    deletes,
    carries,
    unlisted,
    unlinkedAccountIds: unlinked,
    skippedUnparseable,
    skippedDuplicate,
  };
}
