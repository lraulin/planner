import { Suspense } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { loadContacts } from "@/lib/contacts/queries";
import { AppShell } from "@/components/shell/AppShell";
import { ContactsView } from "@/components/contacts/ContactsView";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const userId = await getCurrentUserId();
  const contacts = await loadContacts(userId);

  return (
    <AppShell active="contacts">
      <Suspense fallback={<div className="min-h-0 flex-1" />}>
        <ContactsView initialContacts={contacts} />
      </Suspense>
    </AppShell>
  );
}
