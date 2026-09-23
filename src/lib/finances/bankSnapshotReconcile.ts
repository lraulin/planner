import {
  DATE_TOLERANCE_DAYS,
  dateDistance,
  descriptionsOverlap,
} from "./liveFeedMatch";
import { pairRows, resolveLostHold, type PairableRow } from "./feedPairing";
import { carryableFields, type CarriedState } from "./feedHandover";
import { isScrapeFeed, type ParsedBankSnapshotRow } from "./bankSnapshot";
import { formatUsd } from "./money";

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
  /** Set when a capture already reported this hold posted at the bank. */
  postedAtBank: Date | null;
  /** Set when a complete capture stopped listing this hold and nothing accounts for it. */
  unlistedAt: Date | null;
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
  /**
   * D4: posted rows on a feed-covered account that nothing stored holds yet — not inserted,
   * because the feed will bring them. Named so the paste can say which charges it saw but
   * left for the feed, instead of counting them nowhere.
   */
  postedAwaitingFeed: ParsedBankSnapshotRow[];
  pendingUpdates: BankSnapshotPendingUpdate[];
  pendingInserts: ParsedBankSnapshotRow[];
  /** Before a delete, move a pending row's user state onto the posted row that replaced it. */
  pendingCarries: BankSnapshotPendingCarry[];
  /** Browser-pending omitted by the complete page set, plus duplicate feed holds. */
  pendingDeletes: string[];
  /**
   * D4: on a feed-covered account, a stored hold the page now shows posted — stays pending,
   * envelope intact, flagged rather than turned into page-authored posted history.
   */
  postedAtBankMarks: string[];
  /**
   * D3: holds the complete page no longer lists, with no successor anywhere. Kept with their
   * envelope and flagged for the user — absence alone never authorizes a delete. The apply
   * stamps only rows not already flagged.
   */
  unlistedMarks: string[];
  /** Incoming posted rows a stored history-feed row already pairs with. */
  postedCoveredByFeed: number;
  warnings: string[];
};

/**
 * `1 posted not in the bank feed yet: YouTube $16.95`, or "" when there are none.
 *
 * A feed-covered paste leaves these for SimpleFIN to deliver (D4), so they are in neither
 * the register nor any other count. Without naming them, a paste that read nine posted rows
 * and accounted for eight looks like it lost one (YouTube, 2026-09-22).
 */
export function awaitingFeedPhrase(
  rows: readonly Pick<ParsedBankSnapshotRow, "description" | "amountCents">[],
): string {
  if (rows.length === 0) return "";
  const named = rows
    .map((row) => `${row.description} ${formatUsd(Math.abs(row.amountCents))}`)
    .join(", ");
  return `${rows.length} posted not in the bank feed yet: ${named}`;
}

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
 * **`feedCovered` accounts never get page-authored posted history**
 * (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D4). Chase and Capital One's page
 * display names (`Amazon.com`) routinely share nothing with SimpleFIN's fuller descriptors
 * (`AMAZON MKTPL*537NK9DZ2`), so a page-side match against a stored hold can fail even when
 * it is unambiguously the same charge — and every failure used to fall through to inserting
 * the page's own copy as a brand new posted row, a permanent duplicate once the feed's own
 * copy also arrived. Now, for these accounts: an incoming posted row with no stored feed pair
 * is never inserted (the feed will bring it), and one that matches a stored hold does not
 * transition that hold into posted — it stays pending, envelope intact, flagged
 * `postedAtBankMarks` instead. `resolveLostHold` (below) is what eventually retires it once
 * the feed's own row arrives, on a later capture.
 *
 * Everything left unpaired goes through the identity-free paths this always had: an
 * `externalId` match against a stored row is a re-paste of the same page and is dropped; a
 * pending row's own posting is recognised by amount, date and description
 * (`sameEvent`/`sameDateAndDescription`); anything left is a genuinely new posted row —
 * unless `feedCovered`, where it is simply not inserted.
 *
 * **A hold is never deleted by absence** (`agent-os/specs/2026-09-20-1216-holds-are-never-
 * deleted-by-absence/` D3, superseding D3a of ingest-by-identity). A hold the page no longer
 * lists is looked for in the closed statement the capture carried (`recentPosted`, D2 — evidence
 * only, never inserted): a match there marks it `postedAtBankMarks`. Otherwise D3b tries to
 * carry its state onto a posted row within Actual's approximate-amount band and a wider date
 * tolerance — a hold that posted with a tip added, or a page-side name a feed's descriptor
 * never matched. `resolveLostHold` ranks candidates by description rather than requiring it to
 * match (D4): exactly one qualifying row retires the hold outright; several retire it only with
 * one clear description winner; several with none keeps the hold and warns instead of guessing.
 * With no candidate at all the hold is kept and flagged `unlistedMarks` — the page cannot see
 * everything a hold might have become, so its silence is not proof the hold is gone.
 */
export function planBankSnapshotReconciliation(
  existing: readonly ExistingBankSnapshotRow[],
  posted: readonly ParsedBankSnapshotRow[],
  pending: readonly ParsedBankSnapshotRow[],
  feedCovered: boolean,
  recentPosted: readonly ParsedBankSnapshotRow[] = [],
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
  const postedAwaitingFeed: ParsedBankSnapshotRow[] = [];
  const pendingCarries: BankSnapshotPendingCarry[] = [];
  const pendingDeletes = new Set<string>();
  const postedAtBankMarks = new Set<string>();
  const unlistedMarks: string[] = [];
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
    if (feedCovered) {
      // D4: the page confirms one of its own holds posted, but it never authors posted
      // history for this account — stays pending, envelope intact, flagged instead.
      postedAtBankMarks.add(match.row.id);
      continue;
    }
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
      if (feedCovered) {
        // D4: the feed will bring it; nothing here to attach or lose.
        postedAwaitingFeed.push(incoming);
        continue;
      }
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
    if (feedCovered) {
      postedAtBankMarks.add(matched.id);
      continue;
    }
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

  // The closed statement's rows minus any a stored posted row already holds: a charge in
  // both places must count once, or `resolveLostHold` would see two candidates for one.
  const recentAll = recentPosted.map(incomingPairable);
  const heldByStored = new Set(
    pairRows(recentAll, postedHistory.map(toPairable)).map((pair) => pair.browserId),
  );
  const unheldRecent = recentAll.filter((row) => !heldByStored.has(row.id));
  const recentRows = recentPosted.filter((row) => !heldByStored.has(row.externalId));
  const usedRecent = new Set<string>();

  // The browser set is complete for what it lists, and no more. SimpleFIN remains stored so
  // it can resume after the 36-hour browser authority window.
  for (const row of browserPending) {
    if (usedPending.has(row.id) || usedBrowserForCurrent.has(row.id)) continue;
    if (row.isParent) {
      pendingDeletes.add(row.id);
      warnings.push(
        `Discarded split pending transaction "${row.description}" because the complete bank snapshot no longer listed it and no posted match was unambiguous.`,
      );
      continue;
    }
    // The closed statement is evidence, not history: a hold that posted just before the
    // cycle rolled over is on it, so it is marked rather than lost.
    const closed = recentRows
      .filter((recent) => !usedRecent.has(recent.externalId) && sameEvent(row, recent))
      .sort((left, right) => dateDistance(row, left) - dateDistance(row, right))[0];
    if (closed) {
      usedRecent.add(closed.externalId);
      postedAtBankMarks.add(row.id);
      continue;
    }
    const resolution = resolveLostHold(row, [
      ...postedHistory,
      ...unheldRecent.filter((recent) => !usedRecent.has(recent.id)),
    ]);
    if (resolution.outcome === "carry") {
      const target = postedHistoryById.get(resolution.postedId);
      if (target) {
        pendingDeletes.add(row.id);
        pendingCarries.push({
          pendingId: row.id,
          targetId: target.id,
          carry: carryableFields(row, target),
        });
      } else {
        // The only qualifying row is on the closed statement — nowhere to carry to yet.
        usedRecent.add(resolution.postedId);
        postedAtBankMarks.add(row.id);
      }
    } else if (resolution.outcome === "ambiguous") {
      // D4: several posted rows qualify and none is a clear description winner — kept
      // rather than guessed onto the wrong successor. The hold stays pending, exactly as
      // it was, until a later capture narrows the field or the user resolves it by hand.
      warnings.push(
        `Kept pending transaction "${row.description}" because more than one posted row could be its successor and none was a clear match by description; resolve it by hand.`,
      );
    } else if (row.postedAtBank === null) {
      // D3: nothing accounts for it, and the page cannot see everything a hold might have
      // become — kept with its envelope and flagged, never deleted for being absent.
      unlistedMarks.push(row.id);
      if (row.unlistedAt === null) {
        warnings.push(
          `Kept pending transaction "${row.description}" although the complete bank snapshot no longer lists it and no posted row could be confirmed as its successor; it is flagged for you to resolve.`,
        );
      }
    }
  }

  return {
    postedDuplicates,
    postedTransitions,
    postedReplacements,
    postedInserts,
    postedAwaitingFeed,
    pendingUpdates,
    pendingInserts,
    pendingCarries,
    pendingDeletes: [...pendingDeletes],
    postedAtBankMarks: [...postedAtBankMarks],
    unlistedMarks,
    postedCoveredByFeed: pairings.length,
    warnings,
  };
}
