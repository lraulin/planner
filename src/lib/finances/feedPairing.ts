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
  closestPairs,
  dateDistance,
  descriptionsOverlap,
  sharesBrandWord,
  DATE_TOLERANCE_DAYS,
} from "./liveFeedMatch";
import { amountMatches } from "./amountMatch";
import { shiftDateKey } from "@/lib/schedule/geometry";

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
 * How many days before a hold's own day a successor may be dated. One, for the feed that
 * stamps a charge with the previous evening in UTC; no more, because a posted row dated
 * days *before* the purchase is a different purchase.
 */
export const SUCCESSOR_SLACK_DAYS = 1;

/**
 * Whether `candidate` could be what `hold` became. A hold is an authorization at the moment
 * of purchase and its posted twin arrives later, so a row whose every date precedes the
 * hold's day is an earlier charge that merely looks alike — Walmart $261.36 on 9/28 is not
 * what the $200.84 Walmart alert of 10/4 turned into, and Tequila Grill $49.87 on 9/30 is
 * nothing to do with a $51.29 Chewy alert (Lee's Capital One •••3448, 2026-10-04).
 *
 * Used for alert holds, whose day is the purchase day. A browser-page hold's date is the
 * page's own idea of a day and is paired symmetrically.
 */
function couldSucceed(hold: PairableRow, candidate: PairableRow): boolean {
  const latest = [candidate.transactionDate, candidate.postedDate ?? null]
    .filter((key): key is string => key !== null)
    .reduce((max, key) => (key > max ? key : max));
  return latest >= shiftDateKey(hold.transactionDate, -SUCCESSOR_SLACK_DAYS);
}

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
  descriptionsMatch: (a: string, b: string) => boolean = descriptionsOverlap,
  successorsOnly = false,
): RowPairing[] {
  const candidates: { left: PairableRow; right: PairableRow; distance: number }[] = [];

  for (const browser of browserRows) {
    for (const feed of feedRows) {
      if (browser.amountCents !== feed.amountCents) continue;
      if (successorsOnly && !couldSucceed(browser, feed)) continue;
      const distance = dateDistance(browser, feed);
      if (distance > DATE_TOLERANCE_DAYS) continue;
      if (!descriptionsMatch(browser.description, feed.description)) continue;
      candidates.push({ left: browser, right: feed, distance });
    }
  }

  return closestPairs(candidates).map(({ left, right }) => ({
    browserId: left.id,
    feedId: right.id,
  }));
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
 * `LOST_HOLD_TIP_CEILING`. Only ever trusted together with `sameMerchant` — a larger amount
 * alone says nothing about which merchant it came from.
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
 * Whether two descriptions name one merchant, for a pair whose amounts differ. Looser than
 * `descriptionsOverlap` alone because a display name and a feed descriptor for the same
 * storefront often part ways at a `*` (`Amazon.com` / `AMAZON MKTPL*537NK9DZ2`).
 */
function sameMerchant(a: string, b: string): boolean {
  return descriptionsOverlap(a, b) || sharesBrandWord(a, b);
}

/** One candidate retires the hold; several do only when the description singles one out. */
function pickSuccessor(
  hold: PairableRow,
  candidates: readonly PairableRow[],
): LostHoldResolution {
  if (candidates.length === 0) return { outcome: "none" };
  if (candidates.length === 1) return { outcome: "carry", postedId: candidates[0].id };
  const overlapping = candidates.filter((candidate) =>
    descriptionsOverlap(hold.description, candidate.description),
  );
  if (overlapping.length === 1) {
    return { outcome: "carry", postedId: overlapping[0].id };
  }
  return { outcome: "ambiguous", candidateIds: candidates.map((row) => row.id) };
}

/**
 * Where an omitted hold's envelope and notes should land before the hold is removed.
 *
 * A posted row dated within `LOST_HOLD_TOLERANCE_DAYS` is a candidate successor in one of
 * two ways, tried in order:
 *
 * 1. **Its amount is the hold's, to the cent.** Description then only ranks
 *    (`agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` D4): a display name
 *    (`Amazon.com`) routinely shares nothing with a feed descriptor
 *    (`AMAZON MKTPL*537NK9DZ2`), and requiring overlap lost every one of those retirements.
 *    One exact row retires the hold whatever it is called; several retire it only when
 *    exactly one overlaps the hold's description.
 * 2. **Its amount is near — Actual's 7.5% band, or the hold with a tip added — and it names
 *    the same merchant.** Only when no exact row exists. A near amount alone is not
 *    evidence: on Lee's Capital One •••3448, 2026-10-23, a $16.95 YouTube hold retired onto
 *    a $15.90 Grok row and a $94.94 county-utility hold onto a $100.90 Comcast row, each
 *    because it was the one row inside the band — days before the hold's own row arrived.
 *    Of the 62 alert holds that had posted by 2026-11-10, all 62 posted at the exact amount.
 *
 * Several candidates with no clear winner keep the hold rather than guess which one it
 * became; the caller warns instead of removing it.
 *
 * `successorsOnly` drops candidates dated before the hold (`couldSucceed`). It is for a hold
 * whose day is the purchase day, which is every alert hold, and it matters most when the
 * alert has just landed: the only posted rows then in the register are older purchases.
 *
 * `exactOnly` stops after step 1. It is for a hold nobody has seen leave the bank's pending
 * list: until its own row has had time to arrive, the same merchant's *other* charge at a
 * near amount (Chewy $53.20 beside the fortnightly Chewy $51.29) is the likelier match.
 */
export function resolveLostHold(
  hold: PairableRow,
  postedCandidates: readonly PairableRow[],
  options: { successorsOnly?: boolean; exactOnly?: boolean } = {},
): LostHoldResolution {
  const inRange = postedCandidates.filter(
    (candidate) =>
      (!options.successorsOnly || couldSucceed(hold, candidate)) &&
      dateDistance(hold, candidate) <= LOST_HOLD_TOLERANCE_DAYS,
  );

  const exact = inRange.filter(
    (candidate) => candidate.amountCents === hold.amountCents,
  );
  if (exact.length > 0 || options.exactOnly) return pickSuccessor(hold, exact);

  return pickSuccessor(
    hold,
    inRange.filter(
      (candidate) =>
        (amountMatches(candidate.amountCents, hold.amountCents) ||
          tippedFrom(candidate.amountCents, hold.amountCents)) &&
        sameMerchant(hold.description, candidate.description),
    ),
  );
}
