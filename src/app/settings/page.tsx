import Link from "next/link";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getCurrentAccount } from "@/lib/auth";
import { googleConfigured } from "@/lib/auth/server";
import { isGoogleLinked, listCalendarLinks } from "@/lib/google/queries";
import { getGoogleContactSync } from "@/lib/google/contacts/queries";

export const dynamic = "force-dynamic";

/** Category workspace outside AppShell, with one explicit route back to the Planner. */
export default async function SettingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const [account, params] = await Promise.all([getCurrentAccount(), searchParams]);
  const [linked, calendars, contactSync] = await Promise.all([
    isGoogleLinked(account.id),
    listCalendarLinks(account.id),
    getGoogleContactSync(account.id),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="pt-safe flex flex-none items-center gap-3 border-b border-rule bg-shell px-4 py-2 md:px-5">
        <Link
          href="/outline"
          className="flex min-h-tap items-center text-[0.8125rem] font-semibold tracking-tight text-ink-muted hover:text-ink md:min-h-0"
        >
          <span aria-hidden className="mr-1.5 font-mono text-ink-faint">
            ←
          </span>
          Back to Planner
        </Link>
        <span aria-hidden className="text-ink-faint">
          /
        </span>
        <span className="text-[0.8125rem] font-medium text-ink">Settings</span>
      </header>

      <SettingsPage
        initialSection={params.section}
        accountEmail={account.email}
        viaDevBypass={account.viaDevBypass}
        googleConfigured={googleConfigured}
        googleLinked={linked}
        calendars={calendars}
        contactSyncLastSyncedAt={contactSync?.lastSyncedAt.toISOString() ?? null}
      />
    </div>
  );
}
