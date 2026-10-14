/**
 * When a page the browser still holds may be behind, and what to do about it.
 *
 * A `cached` page (`cachePolicy.ts`) is shown again for a minute without a request. That is
 * safe against this tab's own writes — a revalidating action or `router.refresh()` empties the
 * whole cache — and the rules below cover the ways data changes **without the cache hearing
 * of it**. All pure, so each is a fact with a test; the shell wires them to events.
 *
 * **Own edits, through a write that revalidates nothing.** Leaving a `self-patching` page marks
 * the cache *suspect*: a timestamp, not a flag. A cached payload first seen before the mark may
 * predate the write, so arriving at it refreshes it once. The mark lapses after the cache
 * window — anything older than that is stale to Next already — and is dropped when the cache
 * is emptied (the shell layout's render id changes then). Page-level rather than per-action on
 * purpose: a future non-revalidating action cannot forget to set it.
 *
 * **Writes from outside this tab** (userscript pushes, alert emails, the agent API, a second
 * device): no signal reaches the browser, so returning to the tab after `FOCUS_RETURN_AWAY_MS`
 * is the moment they become relevant — mark the cache suspect and refresh the visible page
 * unless it is `self-patching`, where a refresh would reload rows under an edit. While the tab
 * stays focused a cached page may be up to the cache window behind an outside write; that is
 * accepted and stated in the spec.
 *
 * **Midnight.** A payload first seen on a previous *local* day is never reused: it was
 * rendered with yesterday's "today". The day change is handled exactly like a focus return.
 */

import { CACHED_STALE_SECONDS, type CachePolicy } from "./cachePolicy";
import { localDateKey } from "@/lib/schedule/geometry";

/** How long away from the tab counts as "may have changed elsewhere". */
export const FOCUS_RETURN_AWAY_MS = 30_000;

/** How long a suspect mark stays live: the cache window, after which nothing is reused anyway. */
export const SUSPECT_WINDOW_MS = CACHED_STALE_SECONDS * 1000;

/** Rendered-payload ids older than this are forgotten; a revisit that old is a fetch anyway. */
const SEEN_RETENTION_MS = 10 * 60 * 1000;

export type ReturnAction = "none" | "mark-only" | "refresh";

/**
 * What to do when the tab regains attention after `awayMs`, or the local day rolls over
 * (`awayMs` = `Infinity` — a day change is not conditional on how long you were away).
 *
 * The cache is marked suspect for anything but `none`; `refresh` additionally re-renders the
 * visible page. A `self-patching` page is marked only: its view holds edits a refresh would
 * discard, and the mark is enough to protect the cached pages you go to next.
 */
export function returnAction(awayMs: number, policy: CachePolicy): ReturnAction {
  if (awayMs < FOCUS_RETURN_AWAY_MS) return "none";
  return policy === "self-patching" ? "mark-only" : "refresh";
}

/** Whether `localDay(a)` is `localDay(b)`: the browser's wall-clock day, not a stored one. */
export function sameLocalDay(a: number, b: number): boolean {
  return localDateKey(new Date(a)) === localDateKey(new Date(b));
}

export type PageDecision = "fresh" | "refresh";

/**
 * The memory the rules need: when each rendered payload was first seen, and the suspect mark.
 * A factory so tests build their own; the shell holds the one real instance.
 */
export type FreshnessTracker = ReturnType<typeof createFreshnessTracker>;

export function createFreshnessTracker() {
  const seen = new Map<string, number>();
  let mark: number | null = null;
  let epoch: string | null = null;

  const live = (now: number) => mark !== null && now - mark < SUSPECT_WINDOW_MS;

  return {
    /** `now` is when the cache may have been left behind a write. */
    markSuspect(now: number) {
      mark = now;
    },

    isSuspect(now: number): boolean {
      return live(now);
    },

    /**
     * The shell layout rendered again, which only happens on a refresh or a revalidating
     * action: the framework dropped every cached payload. The mark has nothing left to guard,
     * and the payloads seen so far are gone.
     */
    cacheEmptied(nextEpoch: string) {
      if (epoch === nextEpoch) return;
      const first = epoch === null;
      epoch = nextEpoch;
      if (first) return;
      mark = null;
      seen.clear();
    },

    /**
     * A page carrying render id `renderId` is on screen at `now`.
     *
     * The first sighting of an id is when its payload arrived — a fetch, or a full load — so a
     * payload fetched after the mark is fresh by construction; one *first seen* before it may
     * predate the write and is refreshed. An id seen before is a cache hit and keeps its age.
     * Errs toward refreshing: a payload from a previous local day is never reused either.
     */
    pageShown(renderId: string, now: number): PageDecision {
      let firstSeen = seen.get(renderId);
      if (firstSeen === undefined) {
        firstSeen = now;
        seen.set(renderId, now);
        for (const [id, at] of seen) {
          if (now - at > SEEN_RETENTION_MS) seen.delete(id);
        }
      }
      if (!sameLocalDay(firstSeen, now)) return "refresh";
      if (live(now) && mark !== null && firstSeen < mark) return "refresh";
      return "fresh";
    },
  };
}

/**
 * Time spent away from the tab, from the events that say attention left and came back.
 * `blur` and `visibilitychange` overlap (and both fire on some return paths), so the second
 * "returned" must find nothing owed rather than counting the same absence twice.
 */
export function createAwayTracker() {
  let leftAt: number | null = null;
  return {
    left(now: number) {
      if (leftAt === null) leftAt = now;
    },
    /** Milliseconds away since `left`, and forgets the absence. 0 when nothing was open. */
    returned(now: number): number {
      if (leftAt === null) return 0;
      const away = now - leftAt;
      leftAt = null;
      return away;
    },
  };
}
