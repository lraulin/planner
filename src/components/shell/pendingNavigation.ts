"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  createPendingNavigationStore,
  presentedPathname,
  type PendingNavigation,
} from "@/lib/navigation/pendingNavigation";

/**
 * The shell's one pending-navigation record. Written by `NavLink` and the go-to commands,
 * read by everything that draws an active state and by `NavigationSurface`.
 *
 * Module-level on purpose: the writers are links and command handlers scattered across the
 * shell and the pages' own toolbars, and a provider would be a second thing every one of
 * them had to be under. The rules it follows are in `lib/navigation/pendingNavigation.ts`.
 */
export const pendingNavigation = createPendingNavigationStore();

export function usePendingNavigation(): PendingNavigation | null {
  return useSyncExternalStore(
    pendingNavigation.subscribe,
    pendingNavigation.get,
    () => null,
  );
}

/**
 * The pathname the chrome should light as "here": where a click is taking you, until the
 * address bar catches up or the navigation is abandoned.
 */
export function usePresentedPathname(): string {
  const pathname = usePathname();
  return presentedPathname(pathname, usePendingNavigation());
}
