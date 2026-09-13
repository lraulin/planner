import {
  DATE_TOLERANCE_DAYS,
  dateDistance,
  descriptionsOverlap,
} from "./liveFeedMatch";
import { pairRows, resolveLostHold, type PairableRow } from "./feedPairing";
import { carryableFields, type CarriedState } from "./feedHandover";
import { isScrapeFeed, type ParsedBankSnapshotRow } from "./bankSnapshot";

export type ExistingBankSnapshotRow = CarriedState & {
  id: string;
  transactionDate: string;
  postedDate: string | null;
  description: string;
  amountCents: number;
  pending: boolean;
  externalSource: string | null;
  externalId: string | null;
  isParent: boolean;
};

export type BankSnapshotPostedTransition = {
  existingId: string;
  incoming: ParsedBankSnapshotRow;
  amountChanged: boolean;
};

export type BankSnapshotPostedReplacement = {
  existingId: string;
  incoming: ParsedBankSnapshotRow;
  warning: string;
};

export type BankSnapshotPendingUpdate = {
  existingId: string;
  incoming: ParsedBankSnapshotRow;
};

/** A pending row's envelope, notes and flow moving onto the posted row that succeeded it. */
export type BankSnapshotPendingCarry = {
  pendingId: string;
  targetId: string;
  carry: Partial<CarriedState>;
};

export type BankSnapshotReconciliationPlan = {
  postedDuplicates: { existingId: string; incoming: ParsedBankSnapshotRow }[];
  postedTransitions: BankSnapshotPostedTransition[];
  postedReplacements: BankSnapshotPostedReplacement[];
  postedInserts: ParsedBankSnapshotRow[];
  pendingUpdates: BankSnapshotPendingUpdate[];
  pendingInserts: ParsedBankSnapshotRow[];
  /** Before a delete, move a pending row's user state onto the posted row that replaced it. */
  pendingCarries: BankSnapshotPendingCarry[];
  /** Browser-pending omitted by the complete page set, plus duplicate feed holds. */
  pendingDeletes: string[];
  /** Incoming posted rows a stored history-feed row already pairs with. */
  postedCoveredByFeed: number;
  warnings: string[];
};

/** True for the feeds that own history: SimpleFIN and every file download. */
function isHistoryFeed(externalSource: string | null): boolean {
  return (
    externalSource !== null && externalSource !== "" && !isScrapeFeed(externalSource)
  );
}

function toPairable(row: {
  id: string;
  transactionDate: string;
  postedDate: string | null;
  amountCents: number;
  description: string;
}): PairableRow {
  return {
    id: row.id,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: row.amountCents,
    description: row.description,
  };
}

function incomingPairable(row: ParsedBankSnapshotRow): PairableRow {
  return {
    id: row.externalId,
    transactionDate: row.transactionDate,
    postedDate: row.postedDate,
    amountCents: row.amountCents,
    description: row.description,
  };
}

/**
 * Two records of one charge from the **same** browser feed.
 *
 * The userscript derives `externalId` from the page's own row — source, card, date, folded
 * description, amount, and an occurrence ordinal — so re-pasting the same page produces the
 * same ids. That is an identity, not a comparison, which is what lets the posted side drop
 * description matching entirely.
 */
function samePostedRow(
  existing: ExistingBankSnapshotRow,
  incoming: ParsedBankSnapshotRow,
): boolean {
  return existing.externalId !== null && existing.externalId === incoming.externalId;
}

function sameDateAndDescription(
  existing: Pick<
    ExistingBankSnapshotRow,
    "transactionDate" | "postedDate" | "description"
  >,
  incoming: Pick<
    ParsedBankSnapshotRow,
    "transactionDate" | "postedDate" | "description"
  >,
): boolean {
  // The bank page dates a row by its purchase day while a feed dates it by its posting
  // day, so the comparison has to consider both axes on both sides.
  return (
    dateDistance(existing, incoming) <= DATE_TOLERANCE_DAYS &&
    descriptionsOverlap(existing.description, incoming.description)
  );
}

function sameEvent(
  existing: ExistingBankSnapshotRow,
  incoming: ParsedBankSnapshotRow,
): boolean {
  return (
    existing.amountCents === incoming.amountCents &&
    sameDateAndDescription(existing, incoming)
  );
}

function closestMatch(
  existing: readonly ExistingBankSnapshotRow[],
  used: ReadonlySet<string>,
  incoming: ParsedBankSnapshotRow,
  predicate: (row: ExistingBankSnapshotRow, incoming: ParsedBankSnapshotRow) => boolean,
): { row: ExistingBankSnapshotRow; candidateCount: number } | null {
  const candidates = existing
    .filter((row) => !used.has(row.id) && predicate(row, incoming))
    .sort(
      (left, right) =>
        dateDistance(left, incoming) - dateDistance(right, incoming) ||
        left.id.localeCompare(right.id),
    );
  return candidates[0]
    ? { row: candidates[0], candidateCount: candidates.length }
    : null;
}

/**
 * Plan one complete page snapshot against existing bank rows.
 *
 * Matching is occurrence-counted throughout: one stored row can absorb one incoming row.
 * Posted history is never deleted for being outside the bank page's current-cycle window.
 *
 * **Ownership is decided by identity, not by date** (`feedPairing.ts`'s `pairRows`, D2 of
 * `agent-os/specs/2026-09-13-1127-ingest-by-identity/`). An incoming posted row that pairs
 * with a stored history-feed row (`api:simplefin`, `csv:*`) is already held by the feed and
 * is not inserted — whatever its date, which is what lets this page fill in a charge
 * SimpleFIN is merely late on without that copy becoming a permanent duplicate once SimpleFIN
 * catches up. A pair also resolves a browser or SimpleFIN pending twin of that same charge:
 * its envelope, notes and flow move onto the feed row before the hold is dropped, rather than
 * waiting for the next sync to notice.
 *
 * Everything left unpaired goes through the identity-free paths this always had: an
 * `externalId` match against a stored row is a re-paste of the same page and is dropped; a
 * pending row's own posting is recognised by amount, date and description
 * (`sameEvent`/`sameDateAndDescription`); anything left is a genuinely new posted row.
 *
 * The browser's pending list is complete for its own prior holds (D3a): one it no longer
 * lists is removed. Before removing it, D3b tries to carry its state onto a posted row within
 * Actual's approximate-amount band and a wider date tolerance — a hold that posted with a tip
 * added. No unique candidate removes the hold with a warning instead of guessing.
 */
export function planBankSnapshotReconciliation(
  existing: readonly ExistingBankSnapshotRow[],
  posted: readonly ParsedBankSnapshotRow[],
  pending: readonly ParsedBankSnapshotRow[],
): BankSnapshotReconciliationPlan {
  const postedHistory = existing.filter((row) => !row.pending);
  const postedHistoryById = new Map(postedHistory.map((row) => [row.id, row]));
  const feedHistory = postedHistory.filter((row) => isHistoryFeed(row.externalSource));
  const existingPending = existing.filter((row) => row.pending);
  const browserPending = existingPending.filter((row) =>
    isScrapeFeed(row.externalSource ?? ""),
  );
  const simpleFinPending = existingPending.filter(
    (row) => row.externalSource === "api:simplefin",
  );

  const usedPosted = new Set<string>();
  const usedPending = new Set<string>();
  const postedDuplicates: BankSnapshotReconciliationPlan["postedDuplicates"] = [];
  const postedTransitions: BankSnapshotPostedTransition[] = [];
  const postedReplacements: BankSnapshotPostedReplacement[] = [];
  const postedInserts: ParsedBankSnapshotRow[] = [];
  const pendingCarries: BankSnapshotPendingCarry[] = [];
  const pendingDeletes = new Set<string>();
  const warnings: string[] = [];
  const unresolvedPosted: ParsedBankSnapshotRow[] = [];

  const pairings = pairRows(posted.map(incomingPairable), feedHistory.map(toPairable));
  const incomingByExternalId = new Map(posted.map((row) => [row.externalId, row]));
  for (const pairing of pairings) {
    const incoming = incomingByExternalId.get(pairing.browserId);
    const feedRow = postedHistoryById.get(pairing.feedId);
    if (!incoming || !feedRow) continue;
    for (const pendingFeed of [browserPending, simpleFinPending]) {
      const stale = closestMatch(pendingFeed, usedPending, incoming, sameEvent);
      if (!stale) continue;
      usedPending.add(stale.row.id);
      pendingDeletes.add(stale.row.id);
      pendingCarries.push({
        pendingId: stale.row.id,
        targetId: feedRow.id,
        carry: carryableFields(stale.row, feedRow),
      });
    }
  }
  const pairedExternalIds = new Set(pairings.map((pairing) => pairing.browserId));
  const unpaired = posted.filter((row) => !pairedExternalIds.has(row.externalId));

  for (const incoming of unpaired) {
    const match = closestMatch(postedHistory, usedPosted, incoming, samePostedRow);
    if (!match) unresolvedPosted.push(incoming);
    else {
      usedPosted.add(match.row.id);
      postedDuplicates.push({ existingId: match.row.id, incoming });
      for (const pendingFeed of [browserPending, simpleFinPending]) {
        const stale = closestMatch(pendingFeed, usedPending, incoming, sameEvent);
        if (!stale) continue;
        usedPending.add(stale.row.id);
        pendingDeletes.add(stale.row.id);
      }
    }
  }

  const amountCandidates: ParsedBankSnapshotRow[] = [];
  for (const incoming of unresolvedPosted) {
    // Prefer the browser row: it is the identity whose user edits were made on the page
    // snapshot. A matching SimpleFIN hold is the same occurrence and is retired with it.
    const browserMatch = closestMatch(browserPending, usedPending, incoming, sameEvent);
    const match =
      browserMatch ?? closestMatch(simpleFinPending, usedPending, incoming, sameEvent);
    if (!match) {
      amountCandidates.push(incoming);
      continue;
    }
    usedPending.add(match.row.id);
    if (match.row.isParent && match.candidateCount > 1) {
      const warning = `Replaced an ambiguous split pending transaction "${match.row.description}" when it posted; its split edits could not be attached safely.`;
      postedReplacements.push({ existingId: match.row.id, incoming, warning });
      warnings.push(warning);
    } else {
      postedTransitions.push({
        existingId: match.row.id,
        incoming,
        amountChanged: false,
      });
    }

    const otherFeed =
      match.row.externalSource === "api:simplefin" ? browserPending : simpleFinPending;
    const duplicate = closestMatch(otherFeed, usedPending, incoming, sameEvent);
    if (duplicate) {
      usedPending.add(duplicate.row.id);
      pendingDeletes.add(duplicate.row.id);
    }
  }

  for (const incoming of amountCandidates) {
    const browserCandidates = browserPending.filter(
      (row) => !usedPending.has(row.id) && sameDateAndDescription(row, incoming),
    );
    const simpleFinCandidates = simpleFinPending.filter(
      (row) => !usedPending.has(row.id) && sameDateAndDescription(row, incoming),
    );
    const candidates = [...browserCandidates, ...simpleFinCandidates];
    const incomingOccurrences = amountCandidates.filter((other) =>
      candidates.some((candidate) => sameDateAndDescription(candidate, other)),
    ).length;
    const crossSourceDuplicate =
      browserCandidates.length === 1 &&
      simpleFinCandidates.length === 1 &&
      browserCandidates[0].amountCents === simpleFinCandidates[0].amountCents &&
      sameDateAndDescription(browserCandidates[0], simpleFinCandidates[0]);
    const occurrenceCount = crossSourceDuplicate
      ? 1
      : browserCandidates.length + simpleFinCandidates.length;
    if (occurrenceCount !== 1 || incomingOccurrences !== 1) {
      postedInserts.push(incoming);
      if (candidates.some((candidate) => candidate.isParent)) {
        const warning = `Could not attach the ambiguous split pending transaction to posted "${incoming.description}"; the complete pending set decides whether that split is retained or discarded.`;
        warnings.push(warning);
      }
      continue;
    }

    // The same hold can exist once per feed. Treat that pair as one occurrence and prefer
    // the browser identity, where edits made during the page-authority window live.
    const matched = browserCandidates[0] ?? simpleFinCandidates[0];
    usedPending.add(matched.id);
    if (crossSourceDuplicate) {
      const duplicate = simpleFinCandidates[0];
      usedPending.add(duplicate.id);
      pendingDeletes.add(duplicate.id);
    }
    if (matched.isParent) {
      const warning = `Replaced split pending transaction "${matched.description}" because its posted amount changed from ${matched.amountCents} to ${incoming.amountCents} cents; its split edits were discarded.`;
      postedReplacements.push({ existingId: matched.id, incoming, warning });
      warnings.push(warning);
    } else {
      postedTransitions.push({
        existingId: matched.id,
        incoming,
        amountChanged: true,
      });
    }
  }

  const pendingUpdates: BankSnapshotPendingUpdate[] = [];
  const pendingInserts: ParsedBankSnapshotRow[] = [];
  const usedBrowserForCurrent = new Set<string>();
  for (const incoming of pending) {
    const match = closestMatch(
      browserPending,
      new Set([...usedPending, ...usedBrowserForCurrent]),
      incoming,
      sameEvent,
    );
    if (!match) pendingInserts.push(incoming);
    else {
      usedBrowserForCurrent.add(match.row.id);
      pendingUpdates.push({ existingId: match.row.id, incoming });
    }
  }

  // The browser set is complete. Only its own prior pending rows are replaceable; SimpleFIN
  // remains stored so it can resume after the 36-hour browser authority window.
  for (const row of browserPending) {
    if (usedPending.has(row.id) || usedBrowserForCurrent.has(row.id)) continue;
    pendingDeletes.add(row.id);
    if (row.isParent) {
      warnings.push(
        `Discarded split pending transaction "${row.description}" because the complete bank snapshot no longer listed it and no posted match was unambiguous.`,
      );
      continue;
    }
    const resolution = resolveLostHold(row, postedHistory);
    if (resolution.outcome === "carry") {
      const target = postedHistoryById.get(resolution.postedId);
      if (target) {
        pendingCarries.push({
          pendingId: row.id,
          targetId: target.id,
          carry: carryableFields(row, target),
        });
      }
    } else {
      warnings.push(
        `Removed pending transaction "${row.description}" because the complete bank snapshot no longer listed it and no posted row could be confirmed as its successor.`,
      );
    }
  }

  return {
    postedDuplicates,
    postedTransitions,
    postedReplacements,
    postedInserts,
    pendingUpdates,
    pendingInserts,
    pendingCarries,
    pendingDeletes: [...pendingDeletes],
    postedCoveredByFeed: pairings.length,
    warnings,
  };
}
