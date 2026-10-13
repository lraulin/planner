"use client";

import { usePathname } from "next/navigation";
import { moduleForPathname, type ModuleId } from "./modules";
import { usePresentedPathname } from "./pendingNavigation";

/**
 * The module the chrome should light: the sidebar row, the More sheet's row.
 *
 * Read from the pathname rather than passed down: the shell is one layout above every page, so
 * there is no page left to pass it, and a prop could only ever have restated the URL. While a
 * navigation is pending this is the *destination's* module, so the click is acknowledged at
 * once (`lib/navigation/pendingNavigation.ts`).
 */
export function useActiveModule(): ModuleId | null {
  return moduleForPathname(usePresentedPathname());
}

/**
 * The module the address bar is in — what is actually on screen. Use this for anything that
 * describes the current content rather than acknowledging a click: the page bar's tabs belong
 * to the module being shown, not the one being opened, and what to remember as `lastPage` is
 * where you have been, not where you clicked.
 */
export function useCurrentModule(): ModuleId | null {
  return moduleForPathname(usePathname());
}
