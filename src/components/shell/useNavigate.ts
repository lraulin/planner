"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { pendingNavigation } from "./pendingNavigation";

/**
 * `router.push` that acknowledges itself: the destination takes the active look in the
 * sidebar, page bar and bottom nav at once, and the slow-navigation bar can show.
 *
 * For the go-to commands (palette, menu entries, chords), which are not links and so cannot
 * ride `NavLink`'s `useLinkStatus`. A `router.push` has no completion signal, so the record is
 * settled by the address bar moving (or abandoned after `NAVIGATION_ABANDON_MS`).
 *
 * Identity-stable, because command lists depend on it (`CommandProvider`).
 */
export function useNavigate(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      pendingNavigation.begin(window.location.pathname, href, Date.now());
      router.push(href);
    },
    [router],
  );
}
