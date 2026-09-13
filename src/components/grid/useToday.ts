"use client";

import { useSyncExternalStore } from "react";
import { msUntilNextLocalDay } from "@/lib/dateMath";
import { localDateKey } from "@/lib/schedule/geometry";

/**
 * Tell React when "today" may have changed: at the next local midnight, and whenever the tab
 * becomes visible again.
 *
 * `getSnapshot` below reads the clock, but React only re-reads it when something renders. With
 * nothing subscribed, a tab left open overnight — or the phone app brought back in the
 * morning — kept yesterday's date: routines due again stayed hidden and nothing turned Due
 * Today until some unrelated click. The visibility listener is the half that matters on a
 * phone, where a suspended page's midnight timer does not fire on time.
 */
function subscribeToDayChange(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    // A second past midnight, so the snapshot read on wake is unambiguously the new day.
    timer = setTimeout(
      () => {
        onChange();
        arm();
      },
      msUntilNextLocalDay(new Date()) + 1000,
    );
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  arm();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

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
    subscribeToDayChange,
    () => localDateKey(new Date()),
    () => null,
  );
}
