import { db } from "@/db";
import { contacts } from "@/db/schema";
import { ownedRow } from "@/lib/db/owned";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Refuse a contact id that is missing or belongs to someone else.
 *
 * `undefined` and `null` are not a link — they mean "leave it" and "clear it" — so they
 * pass. A guessed id must not attach another user's person to this user's row.
 */
export async function assertContactOwned(
  tx: Executor,
  userId: string,
  contactId: string | null | undefined,
): Promise<void> {
  if (contactId === undefined || contactId === null) return;
  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(ownedRow(contacts, contactId, userId))
    .limit(1);
  if (!contact) throw new Error("Contact not found.");
}
