"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { freshness } from "./freshness";
import { pendingNavigation } from "./pendingNavigation";

/**
 * Decides, once a cached page is on screen, whether what it shows may be behind.
 *
 * A payload first seen before the cache was marked suspect (`lib/navigation/freshness.ts`) is
 * refreshed, with the slow-navigation bar shown from the start because the content is already
 * stale and the bar says why it is about to change. A payload that was just fetched is fresh
 * by construction, so a destination that was not in the cache is fetched once, not twice.
 *
 * `router.refresh()` also empties the rest of the cache, which is what makes this a single
 * refresh per suspect mark rather than one per cached page you visit.
 */
export function PageStampClient({ renderId }: { renderId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const requested = useRef<string | null>(null);

  useEffect(() => {
    const now = Date.now();
    const decision = freshness.pageShown(renderId, now);

    if (decision === "fresh") {
      // The refresh this stamp asked for has produced a new payload (or there never was one).
      pendingNavigation.endRefresh();
      return;
    }
    if (requested.current === renderId) return; // one request per payload, never a loop
    requested.current = renderId;
    pendingNavigation.beginRefresh(pathname, now);
    router.refresh();
  }, [renderId, pathname, router]);

  return null;
}
