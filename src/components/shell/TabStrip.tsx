import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { CaptureButton } from "@/components/capture/CaptureButton";
import { TABS, type TabId } from "./tabs";

export type { TabId };

/**
 * The tab strip from Achieve — the desktop navigation.
 *
 * Hidden below `md`, where a single non-wrapping row of ten tabs has nowhere to go; the phone
 * navigates through `MobileNav` instead. Both read `TABS` so they cannot drift.
 */
export function TabStrip({ active }: { active: TabId }) {
  return (
    <header className="hidden flex-none items-end gap-px border-b border-rule bg-shell px-3 pt-2 md:flex">
      <h1 className="mr-4 pb-2 text-[0.8125rem] font-semibold tracking-tight text-ink-muted">
        Planner
      </h1>

      <nav className="flex items-end gap-px" aria-label="Views">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          const className = [
            "px-3 py-1.5 text-[0.8125rem] leading-none",
            isActive
              ? "rounded-t border-x border-t border-rule bg-surface font-medium text-ink"
              : "text-ink-muted hover:text-ink",
          ].join(" ");

          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={className}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3 pb-1.5">
        <CaptureButton />
        <Link
          href="/settings"
          className="text-[0.8125rem] text-ink-muted hover:text-ink"
        >
          Settings
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
