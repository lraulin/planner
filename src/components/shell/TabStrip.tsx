import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { CaptureButton } from "@/components/capture/CaptureButton";
import { QuickCapture } from "@/components/capture/QuickCapture";

/**
 * The tab strip from Achieve. Built tabs navigate; the rest are shown so the shape of the
 * app is legible, and marked as not built rather than hidden.
 */
const TABS = [
  { id: "outline", label: "Outline", href: "/outline", built: true },
  { id: "projects", label: "Projects", href: "/projects", built: true },
  { id: "tasks", label: "Tasks", href: "/tasks", built: true },
  { id: "goals", label: "Goals", href: "/goals", built: true },
  { id: "wishes", label: "Wish List", href: "/wishes", built: true },
  { id: "day", label: "Day", href: "/day", built: true },
  { id: "schedule", label: "Weekly Schedule", href: "/schedule", built: true },
  { id: "notes", label: "Notes", href: "/notes", built: true },
  { id: "chooser", label: "Task Chooser", href: "/chooser", built: true },
  { id: "fitness", label: "Fitness", href: "/fitness", built: true },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function TabStrip({ active }: { active: TabId }) {
  return (
    <header className="flex flex-none items-end gap-px border-b border-rule bg-shell px-3 pt-2">
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
              : tab.built
                ? "text-ink-muted hover:text-ink"
                : "cursor-default text-ink-faint/60",
          ].join(" ");

          if (tab.built && tab.href) {
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
          }

          return (
            <span key={tab.id} title="Not built yet" className={className}>
              {tab.label}
            </span>
          );
        })}
      </nav>

      {/* Mounted here rather than in the root layout: every signed-in page renders the tab
          strip and the login page does not, so this is exactly the right scope for an
          app-wide shortcut. */}
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

      <QuickCapture />
    </header>
  );
}
