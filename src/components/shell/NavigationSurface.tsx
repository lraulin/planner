"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  NAVIGATION_ABANDON_MS,
  livePending,
  progressDelayMs,
} from "@/lib/navigation/pendingNavigation";
import { pendingNavigation, usePendingNavigation } from "./pendingNavigation";

/**
 * The content area, and the only thing on screen that says "this is still loading".
 *
 * The old page stays put while the next one is fetched — there is deliberately no `loading.tsx`
 * and no skeleton, because a fallback that replaces content flashes on every 200–300 ms switch
 * and keeping the old page never does. What a slow navigation (or an arrival refresh) gets
 * instead, and only after `NAVIGATION_PROGRESS_DELAY_MS`, is a thin bar at the top of this
 * area, directly under the page bar, and the content dimmed under a translucent veil.
 * `aria-busy` says the same to assistive tech. The veil never takes pointer events: the point
 * of keeping the old page is that it stays usable, and a second click on another tab must
 * still land.
 *
 * It also settles the pending record when the address bar arrives — dropping it rather than
 * merely ignoring it, because a stale record becomes live again the moment the user returns to
 * the page it began on — and abandons one that nothing ever finished.
 */
export function NavigationSurface({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pending = usePendingNavigation();
  const live = livePending(pending, pathname);

  const startedAt = live?.startedAt ?? null;
  const delay = live ? progressDelayMs(live) : 0;

  // Which navigation has outlasted its delay. Held as the start time rather than a boolean, so
  // a newer navigation has to earn its own delay and nothing needs resetting.
  const [pastDelay, setPastDelay] = useState<number | null>(null);

  useEffect(() => {
    pendingNavigation.settle(pathname);
  }, [pathname]);

  useEffect(() => {
    if (startedAt === null) return;
    const wait = Math.max(0, startedAt + delay - Date.now());
    const timer = window.setTimeout(() => setPastDelay(startedAt), wait);
    return () => window.clearTimeout(timer);
  }, [startedAt, delay]);

  useEffect(() => {
    if (startedAt === null) return;
    const wait = Math.max(0, startedAt + NAVIGATION_ABANDON_MS - Date.now());
    const timer = window.setTimeout(() => pendingNavigation.clear(), wait);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  const busy = startedAt !== null && pastDelay === startedAt;

  return (
    /*
     * `relative` is the drawer's containing block above `md` (`Drawer` is `md:absolute`
     * here). That is what keeps the form tabs below the menu and page bar instead of painting
     * under their z-50 stacking.
     */
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      aria-busy={busy || undefined}
    >
      {busy && (
        <>
          <div
            aria-hidden
            className="nav-dim pointer-events-none absolute inset-0 z-20 bg-surface/50"
          />
          <div
            aria-hidden
            role="progressbar"
            className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
          >
            <div className="nav-progress h-full w-full bg-select-edge" />
          </div>
        </>
      )}
      {children}
    </div>
  );
}
