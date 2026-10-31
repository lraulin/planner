import type { DbExecutor } from "@/db/executor";
import { contacts } from "@/db/schema";
import { requireOwnedRow } from "@/lib/db/owned";

/**
 * Refuse a contact id that is missing or belongs to someone else.
 *
 * `undefined` and `null` are not a link — they mean "leave it" and "clear it" — so they
 * pass. A guessed id must not attach another user's person to this user's row.
 */
export async function assertContactOwned(
  tx: DbExecutor,
  userId: string,
  contactId: string | null | undefined,
): Promise<void> {
  if (contactId === undefined || contactId === null) return;
  await requireOwnedRow(tx, contacts, contactId, userId, "Contact not found.");
}
