/**
 * The app's views, in Achieve's tab order.
 *
 * One list, read by four surfaces that must not drift: the desktop `TabStrip`, the phone
 * `MobileNav`, the `MoreSheet` behind it, and `MobileHeader`'s "you are here" title.
 *
 * `primary` marks the three views that earn a slot in the bottom nav's five. Everything else
 * is one tap deeper, in the More sheet — the same restraint the weekly-schedule spec applied
 * to top-level tabs, applied to a bar with far less room.
 */
export const TABS = [
  { id: "outline", label: "Outline", href: "/outline", primary: false },
  { id: "projects", label: "Projects", href: "/projects", primary: false },
  { id: "tasks", label: "Tasks", href: "/tasks", primary: true },
  { id: "goals", label: "Goals", href: "/goals", primary: false },
  { id: "wishes", label: "Wish List", href: "/wishes", primary: false },
  { id: "metrics", label: "Metrics", href: "/metrics", primary: false },
  { id: "day", label: "Day", href: "/day", primary: true },
  { id: "schedule", label: "Weekly Schedule", href: "/schedule", primary: false },
  { id: "notes", label: "Notes", href: "/notes", primary: true },
  { id: "chooser", label: "Task Chooser", href: "/chooser", primary: false },
  { id: "fitness", label: "Fitness", href: "/fitness", primary: false },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function tabLabel(id: TabId): string {
  return TABS.find((tab) => tab.id === id)?.label ?? "Planner";
}
