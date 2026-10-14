"use client";

import { useEffect } from "react";
import { freshness } from "./freshness";

/**
 * Tells the tracker the client cache was emptied.
 *
 * Rendered by the shell layout with a fresh id each render. A layout above the pages is **not**
 * re-rendered by a navigation or served again from the cache — only by `router.refresh()` and
 * by an action that revalidates, which are exactly the two things that empty every cached page
 * (proved on a production build, plan.md Task 6). So a changed id *is* the signal, with no
 * need to intercept either call.
 */
export function CacheEpoch({ epoch }: { epoch: string }) {
  useEffect(() => {
    freshness.cacheEmptied(epoch);
  }, [epoch]);
  return null;
}
