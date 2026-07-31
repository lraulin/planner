import Link from "next/link";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

/**
 * Preference reset surface. Not a main tab — reached from the shell's Settings link —
 * so it uses a slim header rather than the full TabStrip.
 */
export default function SettingsRoute() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      {/* Reached from the More sheet on a phone, so it carries its own notch inset — there
          is no MobileHeader above it. "Back to app" is the way out; no bottom nav here. */}
      <header className="pt-safe flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-shell px-4 py-2.5">
        <Link
          href="/outline"
          className="text-[0.8125rem] font-semibold tracking-tight text-ink-muted hover:text-ink"
        >
          Planner
        </Link>
        <span className="text-[0.8125rem] text-ink-faint">/</span>
        <span className="text-[0.8125rem] font-medium text-ink">Settings</span>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/outline"
            className="text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            Back to app
          </Link>
          <LogoutButton />
        </div>
      </header>
      <SettingsPage />
    </div>
  );
}
