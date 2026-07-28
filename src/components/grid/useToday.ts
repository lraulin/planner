"use client";

import { useSyncExternalStore } from "react";

/**
 * Today's date as `YYYY-MM-DD`, or null on the server / before hydration.
 *
 * "Overdue" and schedule status depend on the reader's clock. Reading it through an
 * external store keeps the server and first client render agreeing on null, so nothing
 * flashes the wrong colour during hydration.
 */
export function useToday(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => new Date().toISOString().slice(0, 10),
    () => null,
  );
}
