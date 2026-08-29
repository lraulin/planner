"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { moduleById, modulePages } from "./modules";
import type { ModuleId } from "./modules";
import { pageForPathname } from "@/lib/navigation/pages";
import { NavLink } from "./NavLink";
import { useShellSettings } from "./useShellSettings";

/**
 * The **page** bar: where you can go *inside* the module you are already in.
 *
 * Four modules used to answer this question four ways — Fitness with one bordered segment,
 * Schedule and Notes with a differently-styled one, Day with a bare pair of links — because the
 * shell owned modules and commands and nothing owned the tier between them. It is owned here
 * now, rendered from one registry, so a fifth module cannot invent a fifth look.
 *
 * **Its own row, below the application menu, above the page toolbars.** `TabToolbar` split verbs from lens controls because one
 * row of identically-bordered boxes said nothing about which was which; this is the same
 * argument one tier up. Navigation sits at the rank of the sidebar, not among the verbs — and
 * it is the row that has to survive below `md`, where the command row is hidden and the bar is
 * the only path to a sibling page.
 *
 * **Renders nothing below two built pages**, which is most modules and all of Finances until
 * Insights lands. A single tab spends a row to say "you are in the only place there is".
 *
 * The active page comes from `usePathname()` rather than from a prop, for two reasons: no page
 * file has to remember to pass it, and the bar cannot end up disagreeing with the address bar —
 * which is the failure a hand-passed `active` eventually produces.
 */
export function PageBar({ active }: { active: ModuleId | null }) {
  const pathname = usePathname();
  /*
   * Carried across the switch, because the query is *where you are looking* and the page is
   * *how it is drawn*: flipping Calendar → Agenda must not throw away the week you had scrolled
   * to. Every page validates its own params already (`anchorKeyFrom` rejects a malformed date),
   * so a param the destination cannot use is ignored rather than fatal.
   */
  const search = useSearchParams().toString();

  const entry = active ? moduleById(active) : undefined;
  const pages = active ? modulePages(active) : [];
  const current =
    active && entry ? pageForPathname(active, entry.href, pathname) : null;

  useRememberPage(active, current?.id ?? null);

  if (!active || !entry || pages.length < 2) return null;

  return (
    <nav
      aria-label={`${entry.label} pages`}
      className="relative z-50 flex flex-none items-stretch gap-1 overflow-x-auto border-b border-rule bg-surface px-3 md:overflow-x-visible"
    >
      {pages.map(({ page, href }) => {
        const isActive = page.id === current?.id;

        return (
          <NavLink
            key={page.id}
            href={search ? `${href}?${search}` : href}
            aria-current={isActive ? "page" : undefined}
            className={[
              // `after:` draws the underline over the row's own hairline rather than beside it;
              // a real bottom border would push the label up by 2px only when active.
              "flex min-h-tap flex-none items-center px-2 text-[0.8125rem] whitespace-nowrap transition-colors",
              "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:content-['']",
              "md:min-h-0 md:py-1.5",
              isActive
                ? "font-medium text-ink after:bg-select-edge"
                : "text-ink-muted after:bg-transparent hover:text-ink",
            ].join(" ")}
          >
            {page.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Records the page you are on, so the bare module path can send you back to it.
 *
 * Written from the page rather than from the link that got you there, because plenty of arrivals
 * are not clicks on this bar: a palette entry, a bookmark, Back, a deep link from another
 * module. Storing on arrival is the only version that catches all of them.
 *
 * Skipped when the module has no pages and when the pathname resolves to none — a focused flow
 * like the time-chart editor must not overwrite the page you will return to.
 */
function useRememberPage(active: ModuleId | null, pageId: string | null) {
  const { value, patch } = useShellSettings();
  const stored = active ? value.lastPage[active] : undefined;

  useEffect(() => {
    if (!active || !pageId || stored === pageId) return;
    patch((current) => ({
      ...current,
      lastPage: { ...current.lastPage, [active]: pageId },
    }));
  }, [active, pageId, stored, patch]);
}
