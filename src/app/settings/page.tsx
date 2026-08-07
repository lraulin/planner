import Link from "next/link";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { GoogleCalendarPanel } from "@/components/settings/GoogleCalendarPanel";
import { AchieveTransferPanel } from "@/components/settings/AchieveTransferPanel";
import { RedNotebookImportPanel } from "@/components/settings/RedNotebookImportPanel";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getCurrentAccount } from "@/lib/auth";
import { googleConfigured } from "@/lib/auth/server";
import { isGoogleLinked, listCalendarLinks } from "@/lib/google/queries";
import { getGoogleContactSync } from "@/lib/google/contacts/queries";

export const dynamic = "force-dynamic";

/**
 * Preference reset surface. Not a view — reached from the Settings link pinned below the
 * sidebar's sections — so it keeps its own slim header rather than sitting in `AppShell`.
 * Nothing in the sidebar would be highlighted while you are here, and a rail with no active
 * entry looks broken.
 */
export default async function SettingsRoute() {
  const account = await getCurrentAccount();
  const [linked, calendars, contactSync] = await Promise.all([
    isGoogleLinked(account.id),
    listCalendarLinks(account.id),
    getGoogleContactSync(account.id),
  ]);

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
          {/* Which account this is matters more than it looks: the signed-in account is
              the one whose Google Calendar the app reads and writes. */}
          <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-ink-muted">
            <span className="truncate">{account.email}</span>
            {account.viaDevBypass && (
              <span
                title="AUTH_DEV_BYPASS is on — no one signed in; requests are served as this account."
                className="flex-none rounded border border-rule px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-wide text-ink-faint"
              >
                dev bypass
              </span>
            )}
          </span>
          <Link
            href="/outline"
            className="text-[0.8125rem] text-ink-muted hover:text-ink"
          >
            Back to app
          </Link>
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        <SettingsPage />
        <div className="mx-auto w-full max-w-2xl px-6 pb-8">
          <GoogleCalendarPanel
            configured={googleConfigured}
            linked={linked}
            calendars={calendars}
            contactSyncLastSyncedAt={contactSync?.lastSyncedAt.toISOString() ?? null}
          />
          <AchieveTransferPanel />
          <RedNotebookImportPanel />
        </div>
      </div>
    </div>
  );
}
