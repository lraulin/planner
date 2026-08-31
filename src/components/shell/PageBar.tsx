"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Command } from "@/lib/commands/registry";
import { moduleById, modulePages } from "./modules";
import type { ModuleId } from "./modules";
import { movePage, placePage } from "@/lib/navigation/pageOrder";
import { pageForPathname } from "@/lib/navigation/pages";
import { useRegisterCommands } from "./CommandProvider";
import { NavLink } from "./NavLink";
import { useIsCompact } from "./useIsCompact";
import { useShellSettings } from "./useShellSettings";

/** Marks a page-bar drag so a URL drop (the browser default for a link) is never mistaken for one. */
const PAGE_MIME = "application/x-planner-page";

/** Shared by both branches, so an arranged tab sits exactly where its link sat. */
const TAB_LABEL =
  "flex min-h-tap flex-none items-center px-2 text-[0.8125rem] whitespace-nowrap transition-colors md:min-h-0 md:py-1.5";

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
 * **Rearranging is a mode, not something every tab is permanently armed for.** A tab's primary
 * action is navigation, so by default it is a plain link with a link cursor — the rule
 * `ColumnHeader` already follows for a header that is both sortable and draggable. View ▸
 * Rearrange pages (and `⋯` on the phone, from the same registration) swaps the bar for a row of
 * buttons that select rather than navigate: drag cannot yank the page out from under you,
 * because while arranging the tabs do not go anywhere. Desktop reorders by drag or by `←`/`→`;
 * the phone, which has no HTML5 drag, has the same `←`/`→` buttons.
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
  /*
   * The mode is held *per module* and compared, rather than stored as a boolean and cleared
   * when `active` changes: switching modules then exits arranging for free, with no
   * setState-in-effect to fight React over. Deliberately not a `ShellSettings` field —
   * reloading into a bar whose tabs do not navigate is a trap, and only the *order* is worth
   * persisting.
   */
  const [arrangingModule, setArrangingModule] = useState<ModuleId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement | null>());

  const ids = pages.map(({ page }) => page.id);
  /** Below two pages there is no bar, and so nothing to rearrange. */
  const hasBar = ids.length >= 2;
  const arranging = active !== null && arrangingModule === active;
  // Derived for the same reason the mode is: a page that left the list is no selection.
  const selected = selectedId && ids.includes(selectedId) ? selectedId : null;
  const canDrag = !compact && arranging;

  const setOrder = useCallback(
    (moduleId: ModuleId, next: readonly string[]) => {
      patch((currentSettings) => ({
        ...currentSettings,
        pageOrder: { ...currentSettings.pageOrder, [moduleId]: [...next] },
      }));
    },
    [patch],
  );

  const resetOrder = useCallback(
    (moduleId: ModuleId) => {
      patch((currentSettings) => {
        const next = { ...currentSettings.pageOrder };
        delete next[moduleId];
        return { ...currentSettings, pageOrder: next };
      });
    },
    [patch],
  );

  /*
   * Registered above the `pages.length < 2` return, because hooks cannot be conditional. The
   * bar-less case yields a memoised empty array rather than skipping the call: `CommandProvider`
   * errors on a command list rebuilt every render, empty or not.
   */
  const arrangeCommands = useMemo<Command[]>(() => {
    if (!active || !hasBar) return [];
    return [
      {
        id: "view.arrange-pages",
        label: arranging ? "Done rearranging pages" : "Rearrange pages",
        group: "view",
        menu: "view",
        section: "Page bar",
        icon: "fields",
        keywords: "reorder move tabs page bar arrange sort",
        title: arranging
          ? "Leave rearrange mode and go back to navigating"
          : "Reorder this module's page tabs by dragging or with the arrow buttons",
        run: () => {
          setArrangingModule((currentModule) =>
            currentModule === active ? null : active,
          );
        },
      },
      {
        id: "view.reset-page-order",
        label: "Reset page order",
        group: "view",
        menu: "view",
        section: "Page bar",
        icon: "reset",
        keywords: "default original order tabs page bar",
        disabled: !stored || stored.length === 0,
        title: "Put this module's tabs back in their built-in order",
        run: () => resetOrder(active),
      },
    ];
  }, [active, arranging, hasBar, resetOrder, stored]);
  useRegisterCommands(arrangeCommands);

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
    const next = placePage(ids, id, target);
    if (next.every((pageId, i) => pageId === ids[i])) return;
    setOrder(active, next);
  }

  function move(direction: "left" | "right") {
    if (!active || !selected) return;
    const next = movePage(ids, selected, direction);
    if (next.every((pageId, i) => pageId === ids[i])) return;
    setOrder(active, next);
    // The tab keeps the keyboard after it moves: re-parenting a focused node drops focus in
    // some browsers, and losing it after one press makes the second press go nowhere.
    const id = selected;
    window.requestAnimationFrame(() => tabRefs.current.get(id)?.focus());
  }

  if (!active || !entry || pages.length < 2) return null;

  if (arranging) {
    const at = selected ? ids.indexOf(selected) : -1;

    return (
      <div
        role="toolbar"
        aria-label={`Rearrange ${entry.label} pages`}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setArrangingModule(null);
            return;
          }
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            if (!selected) return;
            event.preventDefault();
            move(event.key === "ArrowLeft" ? "left" : "right");
          }
        }}
        className="relative flex flex-none items-stretch gap-1 overflow-x-auto border-b border-rule bg-select/40 px-3 outline-1 -outline-offset-2 outline-dashed outline-select-edge md:z-50 md:overflow-x-visible"
      >
        {pages.map(({ page }, index) => {
          const isSelected = page.id === selected;

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
              <button
                type="button"
                ref={(node) => {
                  tabRefs.current.set(page.id, node);
                }}
                aria-pressed={isSelected}
                draggable={canDrag}
                title={
                  canDrag
                    ? "Drag to reorder, or select and use the arrows"
                    : "Select, then use the arrows to move it"
                }
                onClick={() => setSelectedId(page.id)}
                onDragStart={(event) => {
                  if (!canDrag) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData(PAGE_MIME, page.id);
                  event.dataTransfer.setData("text/plain", page.id);
                  event.dataTransfer.effectAllowed = "move";
                  setSelectedId(page.id);
                  setDragId(page.id);
                }}
                onDragEnd={endDrag}
                className={[
                  TAB_LABEL,
                  "gap-1.5 rounded",
                  canDrag ? "cursor-grab active:cursor-grabbing" : "",
                  isSelected
                    ? "bg-select font-medium text-ink"
                    : "text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                <span
                  aria-hidden
                  className="flex-none text-[0.6875rem] leading-none text-ink-faint"
                >
                  ⋮⋮
                </span>
                {page.label}
              </button>
            </div>
          );
        })}

        <div className="ml-auto flex flex-none items-center gap-1 pl-2">
          <ArrangeButton
            label="←"
            title="Move the selected page left"
            disabled={at < 1}
            onClick={() => move("left")}
          />
          <ArrangeButton
            label="→"
            title="Move the selected page right"
            disabled={at < 0 || at === ids.length - 1}
            onClick={() => move("right")}
          />
          <ArrangeButton
            label="Reset"
            title="Put the tabs back in their built-in order"
            disabled={!stored || stored.length === 0}
            onClick={() => resetOrder(active)}
          />
          <ArrangeButton
            label="Done"
            title="Leave rearrange mode"
            onClick={() => setArrangingModule(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <nav
      aria-label={`${entry.label} pages`}
      className="relative flex flex-none items-stretch gap-1 overflow-x-auto border-b border-rule bg-surface px-3 md:z-50 md:overflow-x-visible"
    >
      {pages.map(({ page, href }) => {
        const isActive = page.id === current?.id;

        return (
          <div key={page.id} className="relative flex items-stretch">
            <NavLink
              href={search ? `${href}?${search}` : href}
              aria-current={isActive ? "page" : undefined}
              // Anchors are draggable by default in HTML, and a tab outside rearrange mode is
              // only ever a link — omitting the attribute would still start a URL drag.
              draggable={false}
              className={[
                // `after:` draws the underline over the row's own hairline rather than beside it;
                // a real bottom border would push the label up by 2px only when active.
                TAB_LABEL,
                "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:content-['']",
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

/** A trailing control in rearrange mode — the phone's only way to move a tab. */
function ArrangeButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-tap flex-none items-center rounded border border-rule bg-surface px-2 text-[0.8125rem] text-ink transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0 md:py-0.5"
    >
      {label}
    </button>
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
