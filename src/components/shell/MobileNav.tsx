"use client";

import { requestQuickCapture } from "@/components/capture/event";
import { MoreSheet } from "./MoreSheet";
import {
  CaptureIcon,
  ChooserIcon,
  NotesIcon,
  OrganizeIcon,
  TasksIcon,
} from "./navIcons";
import type { ModuleId } from "./modules";
import { NavLink } from "./NavLink";

/**
 * Phone navigation: a bottom tab bar, standing in for the desktop `Sidebar` below `md`.
 *
 * A two-action utility band keeps Quick capture and Process Inbox visible. Beneath it,
 * `Chooser · Tasks · Notes · More` keeps the primary destinations within four equal slots;
 * the rest live in the More sheet, grouped by the same sections the sidebar uses.
 *
 * Day used to own the first slot; it is shelved in `modules.ts` for now, and Task Chooser
 * took its place as the daily "what am I working on" surface.
 *
 * A normal flex child of `AppShell` rather than `position: fixed`, so the scroll container
 * above it ends where the bar begins and the last row is never hidden underneath.
 */
export function MobileNav({ active }: { active: ModuleId | null }) {
  return (
    <nav
      aria-label="Modules"
      className="pb-safe flex-none border-t border-rule bg-shell shadow-[var(--elev-1)] md:hidden"
    >
      <div className="grid grid-cols-2 gap-px border-b border-rule bg-rule">
        <button
          type="button"
          onClick={requestQuickCapture}
          className="flex min-h-tap items-center justify-center gap-2 bg-shell text-[0.75rem] font-medium text-ink"
        >
          <CaptureIcon />
          Quick capture
        </button>
        <NavLink
          href="/organize"
          className="flex min-h-tap items-center justify-center gap-2 bg-shell text-[0.75rem] font-medium text-ink"
        >
          <OrganizeIcon />
          Process Inbox
        </NavLink>
      </div>
      <div className="flex items-stretch">
        <TabLink
          href="/chooser"
          label="Chooser"
          icon={<ChooserIcon />}
          active={active === "chooser"}
        />
        <TabLink
          href="/tasks"
          label="Tasks"
          icon={<TasksIcon />}
          active={active === "tasks"}
        />
        <TabLink
          href="/notes"
          label="Notes"
          icon={<NotesIcon />}
          active={active === "notes"}
        />
        <MoreSheet active={active} />
      </div>
    </nav>
  );
}

function TabLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <NavLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 py-1.5 ${
        active ? "text-select-edge" : "text-ink-muted"
      }`}
    >
      {icon}
      <span className="text-[0.625rem] leading-none">{label}</span>
    </NavLink>
  );
}
