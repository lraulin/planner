import type { ComponentType } from "react";
import {
  ChooserIcon,
  ContactsIcon,
  DayIcon,
  FitnessIcon,
  GoalsIcon,
  MetricsIcon,
  NotesIcon,
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
   * `reserved` is a module we have decided the home of but not built. It renders nowhere and
   * is not a navigation target — it exists so that adding it later is a one-word edit rather
   * than another argument about navigation. Deliberately *not* shown as a disabled entry: a
   * menu full of dead rows teaches you to stop reading the menu.
   */
  status: "built" | "reserved";
  /** Required on a built module; the collapsed rail is icons only. */
  icon?: ComponentType;
};

export const MODULES = [
  // Plan — the outline and the things in it, in Achieve's own order.
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
  {
    id: "life-plan",
    label: "Life Plan",
    href: "/life-plan",
    section: "plan",
    primary: false,
    status: "reserved",
  },

  // Do — what you are working on now, this day, this week.
  {
    id: "day",
    label: "Day",
    href: "/day",
    section: "do",
    primary: true,
    status: "built",
    icon: DayIcon,
  },
  {
    id: "chooser",
    label: "Task Chooser",
    href: "/chooser",
    section: "do",
    primary: false,
    status: "built",
    icon: ChooserIcon,
  },
  {
    id: "schedule",
    label: "Weekly Schedule",
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
