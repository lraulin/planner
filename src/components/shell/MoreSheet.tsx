"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ModalShell } from "@/components/detail/ModalShell";
import { MoreIcon } from "./navIcons";
import { sectionsWithModules, MODULES, type ModuleId } from "./modules";

/**
 * The rest of the app, one tap below the bottom nav.
 *
 * The primary bar has four slots and the app has many more modules plus Settings and Sign out,
 * so this is where the rest live. Built on `ModalShell` per `modal-pattern.md`, which renders it as a
 * bottom sheet below `md` — the list lands under the thumb rather than in the middle of the
 * screen.
 *
 * It lists **every built** module, grouped by the same `sectionsWithModules()` the desktop
 * sidebar renders, including the three already in the bar. Showing only the non-primary
 * ones made the section headings lie: a `Do` group with Schedule but no Chooser reads as
 * though Chooser is somewhere else. The duplication costs three rows in a sheet that
 * scrolls; the missing rows cost you the map.
 *
 * There is no command palette here. `⌘K` has no touch equivalent, and commands reach the
 * phone through the `⋯` overflow on each module's own toolbar instead.
 */
export function MoreSheet({ active }: { active: ModuleId | null }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const sections = sectionsWithModules();

  // "More" is the current section whenever the bar itself is not showing where you are.
  const inBottomBar = MODULES.some((entry) => entry.id === active && entry.primary);

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
            {sections.map((section) => (
              <div key={section.id} className="mb-2 last:mb-0">
                <h3 className="px-3 pb-0.5 pt-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
                  {section.label}
                </h3>

                {section.modules.map((entry) => (
                  <Link
                    key={entry.id}
                    href={entry.href}
                    onClick={() => setOpen(false)}
                    aria-current={entry.id === active ? "page" : undefined}
                    className={`flex min-h-tap items-center rounded px-3 text-[0.9375rem] ${
                      entry.id === active
                        ? "bg-select font-medium text-ink"
                        : "text-ink"
                    }`}
                  >
                    {entry.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="mt-2 flex items-center justify-between border-t border-rule px-3 pt-2">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex min-h-tap items-center text-[0.9375rem] text-ink"
            >
              Settings
            </Link>
            <LogoutButton />
          </div>
        </div>
      </ModalShell>
    </>
  );
}
