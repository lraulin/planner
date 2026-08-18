import type { ComponentType } from "react";
import {
  builtPageById,
  builtPagesForModule,
  defaultPageFor,
  hasPageBar,
  pageForPathname,
  pageHref,
  pagesForModule,
  type PageEntry,
  type PagedModuleId,
} from "@/lib/navigation/pages";
import {
  ChooserIcon,
  FinancesIcon,
  FindIcon,
  FitnessIcon,
  LibraryIcon,
  MetricsIcon,
  NotesIcon,
  PlanIcon,
  ScheduleIcon,
  TasksIcon,
} from "./navIcons";

/**
 * Every **module** the app has, and every one it is going to have.
 *
 * One list, read by five surfaces that must not drift: the desktop `Sidebar`, the phone
 * `MobileNav`, the `MoreSheet` behind it, `MobileHeader`'s "you are here" title, and the
 * command palette's go-to entries.
 *
 * This replaces the flat `TABS` array and the tab strip that rendered it. Achieve reached
 * its sixteen destinations through the **Go** menu (manual §1.3) and kept only the ones you
 * had opened as tabs; we inherited the tabs without the Go menu, so eleven of them had to be
 * permanent and a twelfth had nowhere to go. Sections plus a palette is that Go menu,
 * rendered the way this decade renders it.
 *
 * **Why "module" and not "view".** These were `VIEWS` until saved views spread to every grid,
 * at which point one word named two things: a destination in the sidebar, and a stored column
 * layout with filters inside one of them. Achieve called the in-grid presets Views — "Active
 * Task Status" — and so do our UI, `data-grid.md` and every grid call site, so `View` kept that
 * meaning and the destinations were renamed. Storage keys still say `tab`; renaming a persisted
 * scope key would be a migration bought for nothing.
 *
 * **There are no sections any more.** Modules were grouped into `Plan` / `Do` / `Track` /
 * `Library` so a sidebar could reach twenty destinations — _"vertical space is what we have and
 * horizontal space is what ran out"_. Then nine of those destinations turned out to be pages:
 * the seven Plan modules were one `loadOutline` drawn seven ways, and Library held two
 * reference lists and a Time Charts list whose editor already lived under Schedule. Eight
 * modules do not need headings, and `Plan` and `Library` would each have become a section
 * containing one module of the same name — the same chrome-that-teaches-nothing that the page
 * bar's two-page floor rejects one tier down. Re-grouping later is a field and a `groupBy`,
 * not a rebuild.
 */

type ModuleEntry = {
  id: string;
  label: string;
  href: string;
  /**
   * `reserved` is a module that should not appear in navigation — either not built yet, or
   * temporarily shelved. It renders nowhere and is not a navigation target; the route and
   * code may still exist. Adding or restoring it later is a one-word edit rather than another
   * argument about navigation. Deliberately *not* shown as a disabled entry: a menu full of
   * dead rows teaches you to stop reading the menu.
   */
  status: "built" | "reserved";
  /** Required on a built module; the collapsed rail is icons only. */
  icon?: ComponentType;
};

/**
 * Display order, top to bottom. Roughly: what you plan with, what you do today, what you
 * record, and what you look things up in.
 */
export const MODULES = [
  {
    /*
     * The outline and everything in it — Overview, Outline, Projects, Tasks, Goals, Wish List
     * and Result Areas, which were seven modules until it became clear they were seven
     * `pages.ts` entries: one `loadOutline(userId)`, seven grids.
     *
     * Not to be confused with `/schedule/plan`, the weekly planning wizard. Different verb.
     */
    id: "plan",
    label: "Plan",
    href: "/plan",
    status: "built",
    icon: PlanIcon,
  },
  {
    /*
     * A variant of Tasks taxonomically, and deliberately not one of Plan's pages: it is where
     * you go to decide what to do next, several times a day, and burying a most-used
     * destination one level down to satisfy a category boundary trades daily cost for tidiness.
     */
    id: "chooser",
    label: "Task Chooser",
    href: "/chooser",
    status: "built",
    icon: ChooserIcon,
  },
  {
    // "Weekly Schedule" while it was one week drawn one way. It holds Day, Calendar, Agenda,
    // Week Plan and now the Time Charts list, and a name promising a week would be wrong on
    // most of them. Day folded in here rather than being deleted; its future is still open.
    id: "schedule",
    label: "Schedule",
    href: "/schedule",
    status: "built",
    icon: ScheduleIcon,
  },
  {
    /*
     * Content search across every record family, as opposed to the palette, which searches
     * commands. Achieve reached this from Edit ▸ Advanced Find; we have no Edit menu, and it
     * is a place you go and come back to rather than a verb, so it is a destination and the
     * sidebar is its catalog. `agent-os/specs/2026-08-18-1012-advanced-find/`.
     */
    id: "find",
    label: "Find",
    href: "/find",
    status: "built",
    icon: FindIcon,
  },
  {
    id: "focus",
    label: "Focus Timer",
    href: "/focus",
    status: "reserved",
  },
  {
    id: "metrics",
    label: "Metrics",
    href: "/metrics",
    status: "built",
    icon: MetricsIcon,
  },
  {
    id: "fitness",
    label: "Fitness",
    href: "/fitness",
    status: "built",
    icon: FitnessIcon,
  },
  {
    id: "finances",
    label: "Finances",
    href: "/finances",
    status: "built",
    icon: FinancesIcon,
  },
  {
    id: "notes",
    label: "Notes",
    href: "/notes",
    status: "built",
    icon: NotesIcon,
  },
  {
    id: "time-log",
    label: "Time Log",
    href: "/time-log",
    status: "reserved",
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    status: "reserved",
  },
  {
    // Reference you keep and consult: Contacts and Resources. Was the `Library` *section*
    // holding those two plus the Time Charts list, which went to Schedule to join the editor
    // that had always lived there.
    id: "library",
    label: "Library",
    href: "/library",
    status: "built",
    icon: LibraryIcon,
  },
] as const satisfies readonly ModuleEntry[];

export type ModuleId = (typeof MODULES)[number]["id"];

/** A module that actually exists — the only kind anything renders or navigates to. */
export type BuiltModule = Extract<(typeof MODULES)[number], { status: "built" }>;

export const BUILT_MODULES: readonly BuiltModule[] = MODULES.filter(
  (entry): entry is BuiltModule => entry.status === "built",
);

export function moduleLabel(id: ModuleId): string {
  return MODULES.find((entry) => entry.id === id)?.label ?? "Planner";
}

/**
 * Compile-time proof that every module id keying the page registry is a real module.
 *
 * `pages.ts` keys by plain `string` because it may not import this file — it would drag React
 * icon components into `src/lib` and make the registry untestable. That leaves one gap a typo
 * fits through: `scheduel: [...]` would type-check happily and silently give Schedule no pages,
 * with the only symptom being a page bar that never appears. This closes it from the side that
 * can see both lists.
 */
type _PagesNameRealModules = PagedModuleId extends ModuleId ? true : never;
const _pagesNameRealModules: _PagesNameRealModules = true;

export function moduleById(id: ModuleId): (typeof MODULES)[number] | undefined {
  return MODULES.find((entry) => entry.id === id);
}

/**
 * A module's pages, ready to render: built only, each with the href it lives at.
 *
 * This is the single accessor `navigation.md` requires — the page bar, the palette's go-to
 * entries and the bare-path redirect all come through here, so none of them can hold a
 * different opinion about what a module contains.
 */
export function modulePages(
  id: ModuleId,
): { page: PageEntry; href: string; moduleLabel: string }[] {
  const entry = moduleById(id);
  if (!entry) return [];

  return builtPagesForModule(id).map((page) => ({
    page,
    href: pageHref(entry.href, page),
    moduleLabel: entry.label,
  }));
}

/** Whether this module shows a page bar at all — two or more built pages. */
export function moduleHasPageBar(id: ModuleId): boolean {
  return hasPageBar(id);
}

/** Where the bare module path lands when nothing is remembered. */
export function moduleDefaultPageHref(id: ModuleId): string | null {
  const entry = moduleById(id);
  const page = defaultPageFor(id);
  return entry && page ? pageHref(entry.href, page) : null;
}

/** Every declared page, reserved included. For settings and diagnostics, not for rendering. */
export function moduleDeclaredPages(id: ModuleId): readonly PageEntry[] {
  return pagesForModule(id);
}

/**
 * What to call a destination in a "← Back to …" control, given only its path.
 *
 * Named from the registry rather than by the caller, because the caller does not reliably know:
 * the time-chart editor is reached from two places and used to print its label from a hardcoded
 * `returnTo === "/time-charts" ? "Time Charts" : "Schedule"`, which was already wrong for one
 * destination and would silently mislabel every one added after it.
 *
 * Falls back to the module's own name, and then to `fallback` for a path in no module at all —
 * "Back" for the back-links this was written for, "Planner" for `MobileHeader`, which asks the
 * same question ("what is this place called?") and would look absurd answering it with a verb.
 */
export function destinationLabel(path: string, fallback = "Back"): string {
  const pathname = path.split(/[?#]/)[0] ?? path;

  const entry = MODULES.filter((item) => item.status === "built").find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (!entry) return fallback;

  const page = pageForPathname(entry.id, entry.href, pathname);
  return page && hasPageBar(entry.id) ? page.label : entry.label;
}

/**
 * The phone bottom bar's three destinations, in slot order.
 *
 * **A slot may name a page, and Tasks does.** This replaced a `primary: boolean` on the module
 * entry, which could no longer say what it needed to: Tasks is a page of Plan now, and pointing
 * the slot at `/plan` would open whatever page you last used — a button labelled Tasks landing
 * on Goals. A flag cannot express "this module, that page".
 *
 * It also closes a hole `navigation.md` did not know it had. The standard lists the bottom nav
 * among the surfaces reading this registry and says never hard-code a module elsewhere;
 * `MobileNav` hard-coded all three hrefs, so this list is where they were always supposed to be.
 *
 * Icons live here rather than in `pages.ts` for the reason the registries are split at all:
 * `pages.ts` stays React-free so it can be unit-tested, and a bottom bar is icons.
 */
type PrimarySlot = {
  moduleId: ModuleId;
  /** Omitted for a module you enter at its remembered page; named where the slot means one page. */
  pageId?: string;
  label: string;
  icon: ComponentType;
};

const PRIMARY_DESTINATIONS: readonly PrimarySlot[] = [
  { moduleId: "chooser", label: "Chooser", icon: ChooserIcon },
  { moduleId: "plan", pageId: "tasks", label: "Tasks", icon: TasksIcon },
  { moduleId: "notes", label: "Notes", icon: NotesIcon },
];

export type PrimaryDestination = {
  moduleId: ModuleId;
  label: string;
  icon: ComponentType;
  href: string;
  /** Whether the current pathname is this destination — page-precise where a page is named. */
  isActive: (pathname: string) => boolean;
};

/**
 * The bottom bar's slots, resolved to hrefs and to a "you are here" test.
 *
 * A page slot is active only on its own page, so Tasks does not light up while you are on
 * Plan's other six — the failure a module-level comparison would produce, and the reason this
 * returns a predicate rather than a module id for the caller to compare.
 */
export function primaryDestinations(): PrimaryDestination[] {
  return PRIMARY_DESTINATIONS.map((slot) => {
    const entry = moduleById(slot.moduleId);
    if (!entry) throw new Error(`Unknown module "${slot.moduleId}"`);

    const page = slot.pageId ? builtPageById(slot.moduleId, slot.pageId) : null;
    if (slot.pageId && !page) {
      throw new Error(`Unknown page "${slot.moduleId}/${slot.pageId}"`);
    }

    return {
      moduleId: slot.moduleId,
      label: slot.label,
      icon: slot.icon,
      href: page ? pageHref(entry.href, page) : entry.href,
      isActive: (pathname: string) =>
        page
          ? pageForPathname(slot.moduleId, entry.href, pathname)?.id === page.id
          : pathname === entry.href || pathname.startsWith(`${entry.href}/`),
    };
  });
}
