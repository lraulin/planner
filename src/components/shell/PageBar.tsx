"use client";

import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { moduleById, modulePages } from "./modules";
import type { ModuleId } from "./modules";
import { placePage } from "@/lib/navigation/pageOrder";
import { pageForPathname } from "@/lib/navigation/pages";
import { NavLink } from "./NavLink";
import { useIsCompact } from "./useIsCompact";
import { useShellSettings } from "./useShellSettings";

/** Marks a page-bar drag so a URL drop (the browser default for a link) is never mistaken for one. */
const PAGE_MIME = "application/x-planner-page";

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
 *
 * Desktop tabs are HTML5-draggable so the labels can be rearranged. The `NavLink` stays a real
 * link: a click still navigates, modifier-click still opens a tab. Drag is off below `md`
 * (`responsive.md`); the phone still *shows* the order saved on desktop.
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
  const compact = useIsCompact();
  const { value, patch } = useShellSettings();

  const entry = active ? moduleById(active) : undefined;
  const stored = active ? value.pageOrder[active] : undefined;
  const pages = active ? modulePages(active, stored) : [];
  const current =
    active && entry ? pageForPathname(active, entry.href, pathname) : null;

  useRememberPage(active, current?.id ?? null);

  const [dragId, setDragId] = useState<string | null>(null);
  /** Slot the drop would land in (0…pages.length), measured against the current order. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const suppressClick = useRef(false);
  const canDrag = !compact && pages.length >= 2;

  function endDrag() {
    setDragId(null);
    setDropIndex(null);
  }

  function dropSlot(index: number, event: ReactDragEvent<HTMLElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX - rect.left > rect.width / 2 ? index + 1 : index;
  }

  function onTabDragOver(index: number, event: ReactDragEvent<HTMLElement>) {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(dropSlot(index, event));
  }

  function onTabDrop(index: number, event: ReactDragEvent<HTMLElement>) {
    if (!dragId || !active) return;
    event.preventDefault();
    const target = dropIndex ?? dropSlot(index, event);
    const id = dragId;
    endDrag();
    const ids = pages.map(({ page }) => page.id);
    const next = placePage(ids, id, target);
    if (next.every((pageId, i) => pageId === ids[i])) return;
    patch((currentSettings) => ({
      ...currentSettings,
      pageOrder: { ...currentSettings.pageOrder, [active]: next },
    }));
  }

  if (!active || !entry || pages.length < 2) return null;

  return (
    <nav
      aria-label={`${entry.label} pages`}
      className="relative flex flex-none items-stretch gap-1 overflow-x-auto border-b border-rule bg-surface px-3 md:z-50 md:overflow-x-visible"
    >
      {pages.map(({ page, href }, index) => {
        const isActive = page.id === current?.id;

        return (
          <div
            key={page.id}
            onDragOver={(event) => onTabDragOver(index, event)}
            onDrop={(event) => onTabDrop(index, event)}
            className={[
              "relative flex items-stretch",
              dragId === page.id ? "opacity-40" : "",
            ].join(" ")}
          >
            {dropIndex === index && <DropMark side="left" />}
            {dropIndex === index + 1 && <DropMark side="right" />}
            <NavLink
              href={search ? `${href}?${search}` : href}
              aria-current={isActive ? "page" : undefined}
              // Anchors are draggable by default in HTML. Compact must set false
              // explicitly — omitting the attribute would still start a URL drag.
              draggable={canDrag}
              title={canDrag ? "Drag to reorder" : undefined}
              onDragStart={(event) => {
                if (!canDrag || event.shiftKey || event.metaKey || event.ctrlKey) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData(PAGE_MIME, page.id);
                event.dataTransfer.setData("text/plain", page.id);
                event.dataTransfer.effectAllowed = "move";
                suppressClick.current = true;
                setDragId(page.id);
              }}
              onDragEnd={() => {
                endDrag();
                // Click, if the browser still fires one after a completed drag, runs
                // after dragend. Clear on the next turn so that click is swallowed and
                // the following click is not.
                window.setTimeout(() => {
                  suppressClick.current = false;
                }, 0);
              }}
              onClick={(event) => {
                if (!suppressClick.current) return;
                event.preventDefault();
              }}
              className={[
                // `after:` draws the underline over the row's own hairline rather than beside it;
                // a real bottom border would push the label up by 2px only when active.
                "flex min-h-tap flex-none items-center px-2 text-[0.8125rem] whitespace-nowrap transition-colors",
                "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:content-['']",
                "md:min-h-0 md:py-1.5",
                canDrag ? "cursor-grab active:cursor-grabbing" : "",
                isActive
                  ? "font-medium text-ink after:bg-select-edge"
                  : "text-ink-muted after:bg-transparent hover:text-ink",
              ].join(" ")}
            >
              {page.label}
            </NavLink>
          </div>
        );
      })}
    </nav>
  );
}

/** Where a dragged tab would land, drawn on the slot boundary rather than over a label. */
function DropMark({ side }: { side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={[
        "pointer-events-none absolute inset-y-1 z-30 w-0.5 rounded-full bg-select-edge",
        side === "left" ? "-left-0.5" : "-right-0.5",
      ].join(" ")}
    />
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
