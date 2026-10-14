"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useToday } from "@/components/grid/useToday";
import { cachePolicyFor } from "@/lib/navigation/cachePolicy";
import { createAwayTracker, returnAction } from "@/lib/navigation/freshness";
import { freshness } from "./freshness";

/**
 * The three ways the cache learns it may be behind without a request telling it so:
 *
 * 1. **Leaving a `self-patching` page** marks it suspect — the page may have written through
 *    an action that revalidates nothing. Marked on the pathname change, so no action has to
 *    remember to.
 * 2. **Returning to the tab** after `FOCUS_RETURN_AWAY_MS` or more: a userscript push, an
 *    alert email, the agent API or another device may have written meanwhile.
 * 3. **The local day rolling over**: yesterday's "today" must not be shown again.
 *
 * 2 and 3 are one handler (`returnAction`): mark suspect, and refresh the visible page unless
 * it is `self-patching`. The refresh is silent — nothing is navigating, and the page is being
 * replaced by a newer copy of itself.
 *
 * The day change rides `useToday`, which already owns the midnight timer and the visibility
 * listener, instead of arming a second one.
 */
export function NavigationFreshness() {
  const pathname = usePathname();
  const router = useRouter();
  const today = useToday();

  // A layout effect, not a passive one: it must run before the arriving page's `PageStamp`
  // decides (a passive effect in the same commit), or a cached page would be judged against a
  // mark that is set a moment too late and shown stale. Passive effects follow every layout
  // effect of the commit, whatever the tree order.
  const previousPath = useRef(pathname);
  useLayoutEffect(() => {
    const left = previousPath.current;
    previousPath.current = pathname;
    if (left !== pathname && cachePolicyFor(left) === "self-patching") {
      freshness.markSuspect(Date.now());
    }
  }, [pathname]);

  useEffect(() => {
    const away = createAwayTracker();
    const handleReturn = () => {
      const now = Date.now();
      const action = returnAction(
        away.returned(now),
        cachePolicyFor(window.location.pathname),
      );
      if (action === "none") return;
      freshness.markSuspect(now);
      if (action === "refresh") router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") away.left(Date.now());
      else handleReturn();
    };
    const onBlur = () => away.left(Date.now());

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", handleReturn);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", handleReturn);
    };
  }, [router]);

  const previousDay = useRef(today);
  useEffect(() => {
    const before = previousDay.current;
    previousDay.current = today;
    // `null` is the server render and the first client one; only a real change counts.
    if (before === null || today === null || before === today) return;
    freshness.markSuspect(Date.now());
    if (cachePolicyFor(window.location.pathname) !== "self-patching") router.refresh();
  }, [today, router]);

  return null;
}
