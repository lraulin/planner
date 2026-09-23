/**
 * Pairing a browser row with the history-feed row that is the same charge.
 *
 * `feedHandover.ts` used to pick, for each browser row in turn, whichever feed row had the
 * nearest date at the same amount — with no ceiling on how near "nearest" had to be, and no
 * look at the description. That is how a scraped **ChatGPT** −$21.20 carried its envelope
 * onto SimpleFIN's **Claude** −$21.20 two days later: nothing stopped it, and nothing
 * preferred ChatGPT's own row once one arrived.
 *
 * This module is the one pairing rule, used in both directions (`agent-os/specs/
 * 2026-09-13-1127-ingest-by-identity/` D2): retirement pairs stored browser rows against
 * stored feed rows; snapshot insertion pairs an incoming posted row against stored feed
 * rows. A pair needs an exact amount, `dateDistance` within `DATE_TOLERANCE_DAYS`, and
 * `descriptionsOverlap` — the same identity bar `liveFeedMatch.ts`'s `sameEvent` already
 * holds live-feed rows to, because without a watermark to lean on, date and amount alone are
 * not enough to say two rows are the same charge.
 *
 * Candidates are sorted **globally**, not per browser row: every eligible pair, nearest date
 * first, ties broken by id for determinism, then taken greedily while neither side is
 * already used. Global order is what lets ChatGPT's own feed row win its pairing even though
 * Claude's row is also in range — the (ChatGPT, ChatGPT) pair is closer, so it is claimed
 * before (ChatGPT, Claude) is ever considered. Per-row matching would have compared only
 * ChatGPT's own two candidates and could not see that ordering across rows.
 */

import {
  dateDistance,
  descriptionsOverlap,
  DATE_TOLERANCE_DAYS,
} from "./liveFeedMatch";
import { amountMatches } from "./amountMatch";

export type PairableRow = {
  id: string;
  transactionDate: string;
  postedDate?: string | null;
  amountCents: number;
  description: string;
};

export type RowPairing = {
  browserId: string;
  feedId: string;
};

/**
 * Pair browser rows against history-feed rows for one account.
 *
 * Occurrence-counted: each id, on either side, appears in at most one returned pairing. A
 * row with no eligible partner — wrong amount, too far apart, or no description overlap —
 * is simply absent from the result; callers decide what an unpaired row means for them.
 */
export function pairRows(
  browserRows: readonly PairableRow[],
  feedRows: readonly PairableRow[],
): RowPairing[] {
  const candidates: { browser: PairableRow; feed: PairableRow; distance: number }[] =
    [];

  for (const browser of browserRows) {
    for (const feed of feedRows) {
      if (browser.amountCents !== feed.amountCents) continue;
      const distance = dateDistance(browser, feed);
      if (distance > DATE_TOLERANCE_DAYS) continue;
      if (!descriptionsOverlap(browser.description, feed.description)) continue;
      candidates.push({ browser, feed, distance });
    }
  }

  candidates.sort(
    (left, right) =>
      left.distance - right.distance ||
      `${left.browser.id}:${left.feed.id}`.localeCompare(
        `${right.browser.id}:${right.feed.id}`,
      ),
  );

  const usedBrowser = new Set<string>();
  const usedFeed = new Set<string>();
  const pairings: RowPairing[] = [];

  for (const candidate of candidates) {
    if (usedBrowser.has(candidate.browser.id) || usedFeed.has(candidate.feed.id))
      continue;
    usedBrowser.add(candidate.browser.id);
    usedFeed.add(candidate.feed.id);
    pairings.push({ browserId: candidate.browser.id, feedId: candidate.feed.id });
  }

  return pairings;
}

/**
 * How long a hold may run before its posted twin shows up, for the lost-hold carry (D3b).
 *
 * Wider than `DATE_TOLERANCE_DAYS`: a hold is not the same-day disagreement pairing exists
 * for, it is an authorization that can sit for the better part of a week before the bank
 * posts the real charge.
 */
export const LOST_HOLD_TOLERANCE_DAYS = 7;

/**
 * The largest tip, as a fraction of the hold, that still reads as the same charge.
 *
 * Actual's 7.5% band (`amountMatch.ts`) is a rule-matching tolerance, not a tip: a 20% tip
 * on a $50 nail salon hold posts at $60, a full $6.25 outside it. That is how Kim's Nails
 * III (2026-09-19, $50 hold → $60 posted) was kept and flagged instead of retired, leaving
 * both in the register. Half the hold covers a $1 tip on a $2 coffee.
 */
export const LOST_HOLD_TIP_CEILING = 0.5;

/**
 * Whether `posted` is `hold` with a tip added: same direction, larger, and not by more than
 * `LOST_HOLD_TIP_CEILING`. Only ever trusted together with a description overlap — a larger
 * amount alone says nothing about which merchant it came from.
 */
function tippedFrom(postedCents: number, holdCents: number): boolean {
  if (Math.sign(postedCents) !== Math.sign(holdCents)) return false;
  const tip = Math.abs(postedCents) - Math.abs(holdCents);
  return tip > 0 && tip <= Math.abs(holdCents) * LOST_HOLD_TIP_CEILING;
}

export type LostHoldResolution =
  | { outcome: "carry"; postedId: string }
  | { outcome: "none" }
  | { outcome: "ambiguous"; candidateIds: string[] };

/**
 * Where an omitted hold's envelope and notes should land before the hold is removed.
 *
 * Bank-page pending sets omit a hold once it clears, one way or another: it posted, or it
 * never did (a duplicate the page dropped). Only the first case has anywhere to carry state
 * to. A posted row qualifies as a candidate successor when it is dated within
 * `LOST_HOLD_TOLERANCE_DAYS` and either its amount is within Actual's 7.5% band, or it names
 * the same merchant and is the hold with a tip added (`tippedFrom`). The tip case needs the
 * description because a bigger amount, unlike a near-equal one, is not itself evidence.
 *
 * **Description ranks candidates; it does not gate them**
 * (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D4). A page's own display name
 * for a hold (`Amazon.com`) routinely shares nothing with a feed's fuller descriptor
 * (`AMAZON MKTPL*537NK9DZ2`) — requiring overlap lost every one of those retirements and
 * left the hold, and the duplicate it caused, in the register forever. So: exactly one
 * qualifying row retires the hold outright, whatever its description. Several qualifying
 * rows retire it only when exactly one of them also overlaps the hold's description — a
 * clear winner among plausible successors. Several with no clear winner keep the hold
 * rather than guess which one it became; the caller warns instead of removing it.
 */
export function resolveLostHold(
  hold: PairableRow,
  postedCandidates: readonly PairableRow[],
): LostHoldResolution {
  const qualifying = postedCandidates.filter(
    (candidate) =>
      dateDistance(hold, candidate) <= LOST_HOLD_TOLERANCE_DAYS &&
      (amountMatches(candidate.amountCents, hold.amountCents) ||
        (tippedFrom(candidate.amountCents, hold.amountCents) &&
          descriptionsOverlap(hold.description, candidate.description))),
  );

  if (qualifying.length === 0) return { outcome: "none" };
  if (qualifying.length === 1) {
    return { outcome: "carry", postedId: qualifying[0].id };
  }

  const overlapping = qualifying.filter((candidate) =>
    descriptionsOverlap(hold.description, candidate.description),
  );
  if (overlapping.length === 1) {
    return { outcome: "carry", postedId: overlapping[0].id };
  }
  return { outcome: "ambiguous", candidateIds: qualifying.map((row) => row.id) };
}
