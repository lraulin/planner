import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadContacts } from "@/lib/contacts/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ContactsView } from "@/components/contacts/ContactsView";
import {
  CONTACT_SYNC_MAX_AGE_MS,
  type GoogleContactSyncStatus,
} from "@/lib/google/contacts/sync";
import {
  getGoogleContactSync,
  googleContactSyncIsStale,
} from "@/lib/google/contacts/queries";

export const dynamic = "force-dynamic";

/**
 * Local-first freshness for Contacts. Never awaits Google on the page path — the client
 * starts one background sync when the mirror is stale.
 */
async function contactsFreshness(userId: string): Promise<GoogleContactSyncStatus> {
  const state = await getGoogleContactSync(userId);
  if (!state) return { state: "off" };
  if (await googleContactSyncIsStale(userId, CONTACT_SYNC_MAX_AGE_MS)) {
    return { state: "stale" };
  }
  return { state: "skipped" };
}

export default async function ContactsPage() {
  const userId = await getCurrentUserId();
  // Paint the local mirror immediately; stale Google work is client-side.
  const [contacts, syncStatus] = await Promise.all([
    loadContacts(userId),
    contactsFreshness(userId),
  ]);

  return (
    <AppShell active="library">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ContactsView initialContacts={contacts} initialSync={syncStatus} />
      </Suspense>
    </AppShell>
  );
}
