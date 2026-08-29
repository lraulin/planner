import { DATE_TOLERANCE_DAYS, descriptionsOverlap } from "./liveFeedMatch";
import { isScrapeFeed, type ParsedBankSnapshotRow } from "./bankSnapshot";

export type ExistingBankSnapshotRow = {
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

export type BankSnapshotReconciliationPlan = {
  postedDuplicates: { existingId: string; incoming: ParsedBankSnapshotRow }[];
  postedTransitions: BankSnapshotPostedTransition[];
  postedReplacements: BankSnapshotPostedReplacement[];
  postedInserts: ParsedBankSnapshotRow[];
  pendingUpdates: BankSnapshotPendingUpdate[];
  pendingInserts: ParsedBankSnapshotRow[];
  /** Browser-pending omitted by the complete page set, plus duplicate feed holds. */
  pendingDeletes: string[];
  warnings: string[];
};

function daysApart(left: string, right: string): number {
  return (
    Math.abs(Date.parse(`${left}T12:00:00Z`) - Date.parse(`${right}T12:00:00Z`)) /
    86_400_000
  );
}

function sameDateAndDescription(
  existing: Pick<ExistingBankSnapshotRow, "transactionDate" | "description">,
  incoming: Pick<ParsedBankSnapshotRow, "transactionDate" | "description">,
): boolean {
  return (
    daysApart(existing.transactionDate, incoming.transactionDate) <=
      DATE_TOLERANCE_DAYS &&
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
        daysApart(left.transactionDate, incoming.transactionDate) -
          daysApart(right.transactionDate, incoming.transactionDate) ||
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
 */
export function planBankSnapshotReconciliation(
  existing: readonly ExistingBankSnapshotRow[],
  posted: readonly ParsedBankSnapshotRow[],
  pending: readonly ParsedBankSnapshotRow[],
): BankSnapshotReconciliationPlan {
  const postedHistory = existing.filter((row) => !row.pending);
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
  const pendingDeletes = new Set<string>();
  const warnings: string[] = [];
  const unresolvedPosted: ParsedBankSnapshotRow[] = [];

  for (const incoming of posted) {
    const match = closestMatch(postedHistory, usedPosted, incoming, sameEvent);
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
    }
  }

  return {
    postedDuplicates,
    postedTransitions,
    postedReplacements,
    postedInserts,
    pendingUpdates,
    pendingInserts,
    pendingDeletes: [...pendingDeletes],
    warnings,
  };
}
