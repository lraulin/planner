"use client";

import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ModalShell } from "@/components/detail/ModalShell";
import { MoreIcon } from "./navIcons";
import { BUILT_MODULES, primaryDestinations, type ModuleId } from "./modules";
import { NavLink } from "./NavLink";

/**
 * The rest of the app, one tap below the bottom nav.
 *
 * The primary bar has four slots and the app has many more modules plus Settings and Sign out,
 * so this is where the rest live. Built on `ModalShell` per `modal-pattern.md`, which renders it as a
 * bottom sheet below `md` — the list lands under the thumb rather than in the middle of the
 * screen.
 *
 * It lists **every built** module in the same order the desktop sidebar does, including the
 * ones already in the bar. Showing only the others used to make the section headings lie — a
 * `Do` group with Schedule but no Chooser reads as though Chooser is somewhere else — and the
 * argument outlived the headings: a list missing three entries is not the map of the app.
 *
 * There is no command palette here. `⌘K` has no touch equivalent, and commands reach the
 * phone through the `⋯` overflow on each module's own toolbar instead.
 */
export function MoreSheet({ active }: { active: ModuleId | null }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pathname = usePathname();

  /*
   * "More" is where you are whenever the bar itself is not showing it — and that is now a
   * pathname question, because the Tasks slot means one page of Plan. On `/plan/goals` no slot
   * is lit, so More is, which a module-level comparison got wrong: it would have dimmed More
   * on all seven Plan pages while pointing at none of them.
   */
  const inBottomBar = primaryDestinations().some((slot) => slot.isActive(pathname));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className={`flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 py-1.5 ${
          inBottomBar ? "text-ink-muted" : "text-ink"
        }`}
      >
        <MoreIcon />
        <span className="text-[0.625rem] leading-none">More</span>
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        width="max-w-sm"
      >
        <div className="p-2">
          <h2
            id={titleId}
            className="px-3 py-2 text-[0.8125rem] font-semibold text-ink-muted"
          >
            Everywhere
          </h2>

          <nav aria-label="All modules">
            {BUILT_MODULES.map((entry) => (
              <NavLink
                key={entry.id}
                href={entry.href}
                onClick={() => setOpen(false)}
                aria-current={entry.id === active ? "page" : undefined}
                className={`flex min-h-tap items-center rounded px-3 text-[0.9375rem] ${
                  entry.id === active ? "bg-select font-medium text-ink" : "text-ink"
                }`}
              >
                {entry.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-2 flex items-center justify-between border-t border-rule px-3 pt-2">
            <NavLink
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex min-h-tap items-center text-[0.9375rem] text-ink"
            >
              Settings
            </NavLink>
            <LogoutButton />
          </div>
        </div>
      </ModalShell>
    </>
  );
}
