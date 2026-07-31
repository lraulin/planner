import Link from "next/link";
import { CaptureNavButton } from "./CaptureNavButton";
import { MoreSheet } from "./MoreSheet";
import { DayIcon, NotesIcon, TasksIcon } from "./navIcons";
import type { TabId } from "./tabs";

/**
 * Phone navigation: a bottom tab bar, replacing the desktop `TabStrip` below `md`.
 *
 * Five slots, because that is what fits at 44px on a 390px screen — `Day · Tasks · ＋ ·
 * Notes · More`. The three named views are the ones this cycle designed for touch; the
 * remaining seven live in the More sheet.
 *
 * A normal flex child of `AppShell` rather than `position: fixed`, so the scroll container
 * above it ends where the bar begins and the last row is never hidden underneath.
 */
export function MobileNav({ active }: { active: TabId }) {
  return (
    <nav
      aria-label="Views"
      className="pb-safe flex-none border-t border-rule bg-shell shadow-[var(--elev-1)] md:hidden"
    >
      <div className="flex items-stretch">
        <NavLink href="/day" label="Day" icon={<DayIcon />} active={active === "day"} />
        <NavLink
          href="/tasks"
          label="Tasks"
          icon={<TasksIcon />}
          active={active === "tasks"}
        />
        <CaptureNavButton />
        <NavLink
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

function NavLink({
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
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 py-1.5 ${
        active ? "text-select-edge" : "text-ink-muted"
      }`}
    >
      {icon}
      <span className="text-[0.625rem] leading-none">{label}</span>
    </Link>
  );
}
