"use client";

import { useSyncExternalStore } from "react";
import { localDateKey } from "@/lib/schedule/geometry";

/**
 * Today's date as `YYYY-MM-DD` (**local** wall-clock day), or null on the server / before
 * hydration.
 *
 * "Overdue" and schedule status depend on the reader's clock. Reading it through an
 * external store keeps the server and first client render agreeing on null, so nothing
 * flashes the wrong colour during hydration.
 *
 * Uses `localDateKey`, not `toDateKey`: the latter is for stored calendar fields (UTC noon
 * encoding). "Is it still Tuesday for me?" is always the browser's local day.
 */
export function useToday(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => localDateKey(new Date()),
    () => null,
  );
}
