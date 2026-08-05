"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ModalShell } from "@/components/detail/ModalShell";
import { MoreIcon } from "./navIcons";
import { sectionsWithViews, VIEWS, type ViewId } from "./views";

/**
 * The rest of the app, one tap below the bottom nav.
 *
 * The bar has five slots and the app has eleven views plus Settings and Sign out, so this is
 * where the rest live. Built on `ModalShell` per `modal-pattern.md`, which renders it as a
 * bottom sheet below `md` — the list lands under the thumb rather than in the middle of the
 * screen.
 *
 * It lists **every** view, grouped by the same `sectionsWithViews()` the desktop sidebar
 * renders, including the three already in the bar. Showing only the other eight was the
 * older behaviour and it made the section headings lie: a `Do` group with Chooser and
 * Schedule but no Day reads as though Day is somewhere else. The duplication costs three
 * rows in a sheet that scrolls; the missing rows cost you the map.
 *
 * There is no command palette here. `⌘K` has no touch equivalent, and commands reach the
 * phone through the `⋯` overflow on each view's own toolbar instead.
 */
export function MoreSheet({ active }: { active: ViewId }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  const sections = sectionsWithViews();

  // "More" is the current section whenever the bar itself is not showing where you are.
  const inBottomBar = VIEWS.some((view) => view.id === active && view.primary);

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
            All views
          </h2>

          <nav aria-label="All views">
            {sections.map((section) => (
              <div key={section.id} className="mb-2 last:mb-0">
                <h3 className="px-3 pb-0.5 pt-1 text-[0.625rem] font-semibold uppercase tracking-wider text-ink-faint">
                  {section.label}
                </h3>

                {section.views.map((view) => (
                  <Link
                    key={view.id}
                    href={view.href}
                    onClick={() => setOpen(false)}
                    aria-current={view.id === active ? "page" : undefined}
                    className={`flex min-h-tap items-center rounded px-3 text-[0.9375rem] ${
                      view.id === active ? "bg-select font-medium text-ink" : "text-ink"
                    }`}
                  >
                    {view.label}
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
