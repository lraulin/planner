/**
 * Which source's figure is current.
 *
 * Three sources write the same account — SimpleFIN, a browser bank snapshot, and a
 * CSV/statement import — and the workflow alternates them deliberately, so any of them
 * can arrive at any time in any order. Authority therefore has to be a function of **when
 * each source's data was true**, not of how much wall-clock time has passed since it was
 * written. The elapsed-time windows this replaces got both directions wrong: a snapshot 40
 * hours old lost to a feed three days behind, and a sync whose `balance-date` was newer
 * could not take the headline back for 36 hours.
 *
 * Spec: `agent-os/specs/2026-09-01-1205-source-as-of-authority/` D2.
 */

import { toDateKey } from "@/lib/schedule/geometry";

/** The three feeds that report a balance. A fourth would be its own spec. */
export type SourceKind = "feed" | "browser" | "file";

/** Fixed comparison order, used to break a tie when nothing holds the headline yet. */
export const SOURCE_KINDS: readonly SourceKind[] = ["feed", "browser", "file"];

/**
 * When one source's figure was true.
 *
 * `asOf` is an instant — SimpleFIN's `balance-date`, a capture time. `asOfDay` is a bare
 * `YYYY-MM-DD`, which is all a downloaded file knows. **Both null means "this source will
 * not say"**, which is not the same as "now": stamping an undated response with the read
 * time is exactly the lie that lets a stale figure overwrite a fresh one.
 */
export type SourceStamp = {
  asOf: Date | null;
  asOfDay: string | null;
};

/** Does this stamp claim any currency at all? */
export function isDated(stamp: SourceStamp | null): stamp is SourceStamp {
  return stamp !== null && (stamp.asOf !== null || stamp.asOfDay !== null);
}

/** The calendar day a stamp falls on, reducing an instant the way `import.ts` already does. */
function dayKeyOf(stamp: SourceStamp): string | null {
  if (stamp.asOf !== null) return toDateKey(stamp.asOf);
  return stamp.asOfDay;
}

/**
 * Is `candidate` strictly more current than `incumbent`?
 *
 * - Both carry instants → compare instants.
 * - Otherwise → reduce to calendar days and compare day keys.
 * - **Strictly newer wins; a tie keeps the incumbent.** That is what lets an instant and a
 *   bare calendar day be ranked without inventing a local end-of-day (the timezone hazard
 *   `dates.md` exists to prevent): a same-day skew can only fail to promote a source, never
 *   regress one.
 * - An undated stamp never beats a dated one, and never displaces another undated one.
 */
export function isStrictlyNewer(
  candidate: SourceStamp | null,
  incumbent: SourceStamp | null,
): boolean {
  if (!isDated(candidate)) return false;
  if (!isDated(incumbent)) return true;

  if (candidate.asOf !== null && incumbent.asOf !== null) {
    return candidate.asOf.getTime() > incumbent.asOf.getTime();
  }
  const a = dayKeyOf(candidate);
  const b = dayKeyOf(incumbent);
  if (a === null || b === null) return false;
  return a > b;
}

export type SourceCandidate<T> = {
  source: SourceKind;
  stamp: SourceStamp | null;
  value: T;
};

/**
 * The source whose figure the account should show, or null when nothing has reported.
 *
 * `incumbent` is whichever source currently holds the derived headline; it is compared
 * first and kept on every tie. With no incumbent the fixed `SOURCE_KINDS` order decides,
 * so the provider of record wins a first-write tie rather than whichever row was read
 * first.
 */
export function pickAuthoritative<T>(
  candidates: readonly SourceCandidate<T>[],
  incumbent: SourceKind | null,
): SourceCandidate<T> | null {
  const ordered = [
    ...candidates.filter((entry) => entry.source === incumbent),
    ...SOURCE_KINDS.flatMap((kind) =>
      kind === incumbent ? [] : candidates.filter((entry) => entry.source === kind),
    ),
  ];
  let best: SourceCandidate<T> | null = null;
  for (const entry of ordered) {
    if (best === null || isStrictlyNewer(entry.stamp, best.stamp)) best = entry;
  }
  return best;
}

/**
 * Does the browser hold this account's pending set?
 *
 * The same comparison, applied to pending. **Recorded limitation:** SimpleFIN dates the
 * _balance_, not the pending set, so its `balance-date` stands in for how current its
 * pending view is. Accepted during shaping — it is the only signal the provider gives.
 */
export function browserOwnsPending(
  browser: SourceStamp | null,
  feed: SourceStamp | null,
): boolean {
  if (!isDated(browser)) return false;
  if (!isDated(feed)) return true;
  return isStrictlyNewer(browser, feed);
}
