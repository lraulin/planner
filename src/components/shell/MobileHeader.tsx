"use client";

import { usePathname } from "next/navigation";
import { isFocusedFlow } from "@/lib/navigation/pages";
import { destinationLabel } from "./modules";
import { OverflowMenu } from "./OverflowMenu";

/**
 * The phone's "you are here".
 *
 * The bottom nav names only three destinations, so for everywhere else — reached through the
 * More sheet — this bar is the only thing that says which one you are looking at. There is no
 * desktop equivalent, and deliberately so: above `md` the sidebar's highlight already answers
 * the question, and a full-width title row would cost grid rows on every module forever.
 *
 * **It names the page, not the module.** `destinationLabel` returns `Tasks` on `/plan/tasks`
 * and falls back to the module's own name where there are no pages — which is the whole point
 * after the consolidation, since the module label alone would print `Plan` on all seven of
 * Plan's pages and say nothing.
 *
 * It also carries the safe-area inset for the notch, so modules below it can ignore it.
 */
export function MobileHeader() {
  const pathname = usePathname();

  return (
    <header className="pt-safe flex-none border-b border-rule bg-shell md:hidden">
      <div className="flex h-11 items-center gap-2 px-3">
        <h1 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tracking-tight text-ink">
          {destinationLabel(pathname, "Planner")}
        </h1>
        {!isFocusedFlow(pathname) && <OverflowMenu label="More commands" />}
      </div>
    </header>
  );
}
