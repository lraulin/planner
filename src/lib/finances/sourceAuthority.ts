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
 * Same-day file-vs-instant evidence: `agent-os/specs/2026-09-13-1127-ingest-by-identity/` D5.
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
export function dayKeyOf(stamp: SourceStamp): string | null {
  if (stamp.asOf !== null) return toDateKey(stamp.asOf);
  return stamp.asOfDay;
}

/** A stamp that only knows a calendar day — a file, never a feed or browser capture. */
function isDayOnly(stamp: SourceStamp): boolean {
  return stamp.asOf === null && stamp.asOfDay !== null;
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
  /**
   * D5: does this source hold a **posted** register row dated on its own stamp's day?
   *
   * Only consulted for the one case D2's strictly-newer rule cannot resolve — a day-only
   * `file` stamp tying on the calendar day with a dated feed or browser stamp. Omit it (or
   * pass `false`) anywhere that evidence has not been computed; a tie with no evidence on
   * either side keeps the incumbent exactly as before.
   */
  postedOnStampDay?: boolean;
};

/**
 * Does `candidate` win a same-day file-vs-instant tie against `incumbent` under D5?
 *
 * `isStrictlyNewer` already ruled out every other case — this only ever runs when neither
 * side is strictly newer than the other. It applies only when exactly one side is a bare
 * calendar day (a `file` stamp) and the other carries a real instant, and both reduce to
 * the same day: on 2026-09-12 a same-day tie between SimpleFIN's $0.00 (6:18 PM) and a
 * Capital One CSV kept the stale feed figure, inventing $5.19 of Ready to Assign, because
 * the file's own posted Apple rows that day were never weighed against SimpleFIN's lack of
 * them. Evidence is which side's own posted rows actually land on the shared day: the side
 * with rows the other lacks wins; both, neither, or missing evidence keeps the incumbent.
 */
function sameDayFileEvidenceWins<T>(
  candidate: SourceCandidate<T>,
  incumbent: SourceCandidate<T>,
): boolean {
  if (!isDated(candidate.stamp) || !isDated(incumbent.stamp)) return false;
  if (isDayOnly(candidate.stamp) === isDayOnly(incumbent.stamp)) return false;
  if (dayKeyOf(candidate.stamp) !== dayKeyOf(incumbent.stamp)) return false;
  return candidate.postedOnStampDay === true && incumbent.postedOnStampDay !== true;
}

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
    if (best === null || isStrictlyNewer(entry.stamp, best.stamp)) {
      best = entry;
    } else if (sameDayFileEvidenceWins(entry, best)) {
      best = entry;
    }
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
