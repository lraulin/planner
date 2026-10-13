"use client";

import { usePathname } from "next/navigation";
import { moduleForPathname, type ModuleId } from "./modules";

/**
 * The module the address bar is in — the sidebar row, page bar and bottom nav's "you are here".
 *
 * Read from the pathname rather than passed down: the shell is one layout above every page now,
 * so there is no page left to pass it, and a prop could only ever have restated the URL.
 */
export function useActiveModule(): ModuleId | null {
  return moduleForPathname(usePathname());
}
