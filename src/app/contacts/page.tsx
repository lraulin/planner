import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadContacts } from "@/lib/contacts/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ContactsView } from "@/components/contacts/ContactsView";
import { syncGoogleContactsIfStale } from "@/lib/google/contacts/sync";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const userId = await getCurrentUserId();
  const syncStatus = await syncGoogleContactsIfStale(userId);
  const contacts = await loadContacts(userId);
  const syncError =
    syncStatus.state === "not_linked" || syncStatus.state === "failed"
      ? syncStatus.message
      : null;

  return (
    <AppShell active="contacts">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ContactsView initialContacts={contacts} initialError={syncError} />
      </Suspense>
    </AppShell>
  );
}
