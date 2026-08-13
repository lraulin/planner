import type { ComponentType } from "react";
import {
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
  ContactsIcon,
  FinancesIcon,
  FitnessIcon,
  GoalsIcon,
  MetricsIcon,
  NotesIcon,
  OverviewIcon,
  OutlineIcon,
  ProjectsIcon,
  ResultAreasIcon,
  ResourcesIcon,
  ScheduleIcon,
  TasksIcon,
  TimeChartsIcon,
  WishesIcon,
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
 * `primary` still marks the modules that earn a slot in the phone bottom nav's five —
 * unchanged from `TABS`, and unrelated to `section`, which is a desktop grouping.
 */

/**
 * Section order is display order. A section renders only when it holds at least one
 * **built** module. That rule let `Library` sit here fully specified and completely
 * invisible for a cycle; Time Charts is what finally made it appear.
 */
export const SECTIONS = [
  { id: "plan", label: "Plan" },
  { id: "do", label: "Do" },
  { id: "track", label: "Track" },
  { id: "library", label: "Library" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

type ModuleEntry = {
  id: string;
  label: string;
  href: string;
  section: SectionId;
  /** Bottom-nav slot on the phone. Three of them, plus capture and More, make five. */
  primary: boolean;
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

export const MODULES = [
  // Plan — the outline and the things in it, in Achieve's own order.
  {
    id: "overview",
    label: "Overview",
    href: "/overview",
    section: "plan",
    primary: false,
    status: "built",
    icon: OverviewIcon,
  },
  {
    id: "outline",
    label: "Outline",
    href: "/outline",
    section: "plan",
    primary: false,
    status: "built",
    icon: OutlineIcon,
  },
  {
    id: "projects",
    label: "Projects",
    href: "/projects",
    section: "plan",
    primary: false,
    status: "built",
    icon: ProjectsIcon,
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    section: "plan",
    primary: true,
    status: "built",
    icon: TasksIcon,
  },
  {
    id: "goals",
    label: "Goals",
    href: "/goals",
    section: "plan",
    primary: false,
    status: "built",
    icon: GoalsIcon,
  },
  {
    id: "wishes",
    label: "Wish List",
    href: "/wishes",
    section: "plan",
    primary: false,
    status: "built",
    icon: WishesIcon,
  },
  {
    id: "result-areas",
    label: "Result Areas",
    href: "/result-areas",
    section: "plan",
    primary: false,
    status: "built",
    icon: ResultAreasIcon,
  },
  // Do — what you are working on now, this day, this week.
  //
  // Day is not here: it folded into Schedule as two of its pages (`/schedule/day`,
  // `/schedule/week-plan`). It had been shelved because Task Chooser covers the daily-pick
  // job better and Day still feels half-finished, and this comment used to say folding it in
  // was the alternative to deleting it. That is what happened. Its future is still open; what
  // changed is that an unfinished surface beside Calendar and Agenda does not read as a broken
  // top-level destination the way a shelved module did.
  {
    id: "chooser",
    label: "Task Chooser",
    href: "/chooser",
    section: "do",
    primary: true,
    status: "built",
    icon: ChooserIcon,
  },
  {
    // "Weekly Schedule" while it was one week drawn one way. It holds a Day page and a Week
    // Plan page now, and a name that promised a week would be wrong on half of them.
    id: "schedule",
    label: "Schedule",
    href: "/schedule",
    section: "do",
    primary: false,
    status: "built",
    icon: ScheduleIcon,
  },
  {
    id: "focus",
    label: "Focus Timer",
    href: "/focus",
    section: "do",
    primary: false,
    status: "reserved",
  },

  // Track — the record of what happened.
  {
    id: "metrics",
    label: "Metrics",
    href: "/metrics",
    section: "track",
    primary: false,
    status: "built",
    icon: MetricsIcon,
  },
  {
    id: "fitness",
    label: "Fitness",
    href: "/fitness",
    section: "track",
    primary: false,
    status: "built",
    icon: FitnessIcon,
  },
  {
    id: "finances",
    label: "Finances",
    href: "/finances",
    section: "track",
    primary: false,
    status: "built",
    icon: FinancesIcon,
  },
  {
    id: "notes",
    label: "Notes",
    href: "/notes",
    section: "track",
    primary: true,
    status: "built",
    icon: NotesIcon,
  },
  {
    id: "time-log",
    label: "Time Log",
    href: "/time-log",
    section: "track",
    primary: false,
    status: "reserved",
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    section: "track",
    primary: false,
    status: "reserved",
  },

  // Library — reference data you maintain but rarely sit in.
  {
    id: "time-charts",
    label: "Time Charts",
    href: "/time-charts",
    section: "library",
    primary: false,
    status: "built",
    icon: TimeChartsIcon,
  },
  {
    id: "resources",
    label: "Resources",
    href: "/resources",
    section: "library",
    primary: false,
    status: "built",
    icon: ResourcesIcon,
  },
  {
    id: "contacts",
    label: "Contacts",
    href: "/contacts",
    section: "library",
    primary: false,
    status: "built",
    icon: ContactsIcon,
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
 * Sections paired with their built modules, skipping any section that has none.
 *
 * Both the sidebar and the More sheet render from this, so the phone and the desktop group
 * the app identically — the one thing a second grouping implementation would get wrong.
 */
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
 * Falls back to the module's own name, and then to "Back" for a path in no module at all.
 */
export function destinationLabel(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? path;

  const entry = MODULES.filter((item) => item.status === "built").find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (!entry) return "Back";

  const page = pageForPathname(entry.id, entry.href, pathname);
  return page && hasPageBar(entry.id) ? page.label : entry.label;
}

export function sectionsWithModules(): {
  id: SectionId;
  label: string;
  modules: readonly BuiltModule[];
}[] {
  return SECTIONS.map((section) => ({
    ...section,
    modules: BUILT_MODULES.filter((entry) => entry.section === section.id),
  })).filter((section) => section.modules.length > 0);
}
