"use client";

import { usePathname } from "next/navigation";
import { requestQuickCapture } from "@/components/capture/event";
import { MoreSheet } from "./MoreSheet";
import { CaptureIcon, OrganizeIcon } from "./navIcons";
import { primaryDestinations, type ModuleId } from "./modules";
import { NavLink } from "./NavLink";

/**
 * Phone navigation: a bottom tab bar, standing in for the desktop `Sidebar` below `md`.
 *
 * A two-action utility band keeps Quick capture and Process Inbox visible. Beneath it,
 * `Chooser · Tasks · Notes · More` keeps the primary destinations within four equal slots;
 * the rest live in the More sheet, in the same order the sidebar uses.
 *
 * Day used to own the first slot; it is two pages of Schedule now, and Task Chooser took its
 * place as the daily "what am I working on" surface.
 *
 * **The three slots come from `primaryDestinations()`**, not from hrefs written here. They were
 * hard-coded while `navigation.md` was already counting this file among the surfaces that read
 * the registry, and the consolidation is what made that bill come due: Tasks is a page of Plan,
 * so `/tasks` is no longer even a real destination and `/plan` would open the wrong page.
 *
 * A normal flex child of `AppShell` rather than `position: fixed`, so the scroll container
 * above it ends where the bar begins and the last row is never hidden underneath.
 */
export function MobileNav({ active }: { active: ModuleId | null }) {
  const pathname = usePathname();

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
        {primaryDestinations().map(
          ({ moduleId, label, icon: Icon, href, isActive }) => (
            <TabLink
              key={moduleId}
              href={href}
              label={label}
              icon={<Icon />}
              active={isActive(pathname)}
            />
          ),
        )}
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
