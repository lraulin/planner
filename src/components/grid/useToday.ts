"use client";

import { useSyncExternalStore } from "react";
import { toDateKey } from "@/lib/schedule/geometry";

/**
 * Today's date as `YYYY-MM-DD` (local calendar day), or null on the server / before hydration.
 *
 * "Overdue" and schedule status depend on the reader's clock. Reading it through an
 * external store keeps the server and first client render agreeing on null, so nothing
 * flashes the wrong colour during hydration.
 *
 * Local, not UTC: after evening in the Americas, `toISOString().slice(0, 10)` is already
 * tomorrow while the user is still on today — which made deferred shelves and completed
 * dates look like they sat in the future.
 */
export function useToday(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => toDateKey(new Date()),
    () => null,
  );
}
