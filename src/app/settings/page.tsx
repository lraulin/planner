import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { getCurrentAccount } from "@/lib/auth";
import { googleConfigured } from "@/lib/auth/server";
import { isGoogleLinked, listCalendarLinks } from "@/lib/google/queries";
import { getGoogleContactSync } from "@/lib/google/contacts/queries";
import { listConnections, listLinks } from "@/lib/banksync/queries";
import { listAccounts } from "@/lib/finances/queries";

export const dynamic = "force-dynamic";

/** Category workspace outside AppShell, with one explicit route back to the Planner. */
export default async function SettingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  return (
    <SettingsFrame>
      <Suspense fallback={<SettingsPending />}>
        <SettingsBody initialSection={params.section} />
      </Suspense>
    </SettingsFrame>
  );
}

function SettingsFrame({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

function SettingsPending() {
  return (
    <div className="flex min-h-0 flex-1 bg-surface md:grid md:grid-cols-[13.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-rule bg-shell md:block" />
      <div className="px-4 py-4 text-[0.8125rem] text-ink-muted md:px-8 md:py-7">
        Loading settings…
      </div>
    </div>
  );
}

async function SettingsBody({ initialSection }: { initialSection?: string }) {
  const account = await getCurrentAccount();
  const [linked, calendars, contactSync, bankConnections, bankLinks, financeAccounts] =
    await Promise.all([
      isGoogleLinked(account.id),
      listCalendarLinks(account.id),
      getGoogleContactSync(account.id),
      listConnections(account.id),
      listLinks(account.id),
      listAccounts(account.id),
    ]);

  // Dates cross to the client component as ISO strings: a Date survives the Flight
  // serializer, but the panel only ever renders it as an age.
  const accountNameById = new Map(financeAccounts.map((a) => [a.id, a.name]));
  const bankLinked = bankLinks.map((link) => ({
    linkId: link.id,
    accountName: accountNameById.get(link.accountId) ?? "Unknown account",
    institution: link.institution,
    balanceCents: link.balanceCents,
    // The provider's own balance date, carried as an ISO string. The panel renders it as an
    // age, and it is deliberately not the time the refresh ran.
    balanceAsOf: link.balanceAsOf ? link.balanceAsOf.toISOString() : null,
  }));

  return (
    <SettingsPage
      initialSection={initialSection}
      accountEmail={account.email}
      viaDevBypass={account.viaDevBypass}
      googleConfigured={googleConfigured}
      bankConnections={bankConnections}
      bankLinked={bankLinked}
      googleLinked={linked}
      calendars={calendars}
      contactSyncLastSyncedAt={contactSync?.lastSyncedAt.toISOString() ?? null}
    />
  );
}
