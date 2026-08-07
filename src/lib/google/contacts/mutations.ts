import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contactItems, contacts, googleContactSyncs } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import type { RemoteContactItem, RemoteGoogleContact } from "./mapping";
import { planContactItems, planContactMirror } from "./mirror";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type AppliedContactSync = {
  inserted: number;
  updated: number;
  deleted: number;
};

async function nextItemSortKey(
  tx: Tx,
  userId: string,
  contactId: string,
  kind: RemoteContactItem["kind"],
): Promise<string> {
  const rows = await tx
    .select({ sortKey: contactItems.sortKey })
    .from(contactItems)
    .where(
      and(
        eq(contactItems.userId, userId),
        eq(contactItems.contactId, contactId),
        eq(contactItems.kind, kind),
      ),
    )
    .orderBy(asc(contactItems.sortKey));
  return between(rows.at(-1)?.sortKey ?? null, null);
}

async function syncContactItems(
  tx: Tx,
  userId: string,
  contactId: string,
  remote: RemoteContactItem[],
): Promise<void> {
  const local = await tx
    .select({
      id: contactItems.id,
      kind: contactItems.kind,
      value: contactItems.value,
      sortKey: contactItems.sortKey,
    })
    .from(contactItems)
    .where(and(eq(contactItems.userId, userId), eq(contactItems.contactId, contactId)));
  const plan = planContactItems(local, remote);

  // Remove every old flag first. A remote primary cannot be set while a now-unmatched row
  // still owns the partial unique index, and doing this inside the transaction keeps the
  // temporary no-primary state invisible.
  await tx
    .update(contactItems)
    .set({ isPrimary: false })
    .where(and(eq(contactItems.userId, userId), eq(contactItems.contactId, contactId)));

  if (plan.toDelete.length > 0) {
    await tx
      .delete(contactItems)
      .where(
        and(
          eq(contactItems.userId, userId),
          eq(contactItems.contactId, contactId),
          inArray(contactItems.id, plan.toDelete),
        ),
      );
  }

  for (const { id, fields } of plan.toUpdate) {
    await tx
      .update(contactItems)
      .set({ ...fields, updatedAt: new Date() })
      .where(
        and(
          eq(contactItems.id, id),
          eq(contactItems.userId, userId),
          eq(contactItems.contactId, contactId),
        ),
      );
  }

  for (const fields of plan.toInsert) {
    const sortKey = await nextItemSortKey(tx, userId, contactId, fields.kind);
    await tx.insert(contactItems).values({
      userId,
      contactId,
      sortKey,
      ...fields,
    });
  }
}

function googleOwnedContactFields(remote: RemoteGoogleContact) {
  return {
    ...remote.fields,
    externalSource: "google",
    externalId: remote.externalId,
    externalCalendarId: "connections",
    externalEtag: remote.externalEtag,
    externalUpdatedAt: remote.externalUpdatedAt,
  };
}

/** Apply one complete or delta People response and advance its cursor atomically. */
export async function applyGoogleContactSync(
  userId: string,
  input: {
    mode: "full" | "incremental";
    remote: RemoteGoogleContact[];
    nextSyncToken: string;
    syncedAt?: Date;
  },
): Promise<AppliedContactSync> {
  return db.transaction(async (tx) => {
    const local = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.userId, userId), eq(contacts.externalSource, "google")));
    const plan = planContactMirror(
      local.map((row) => ({
        id: row.id,
        externalId: row.externalId ?? "",
        externalEtag: row.externalEtag ?? "",
      })),
      input.remote,
      input.mode,
    );

    if (plan.toDelete.length > 0) {
      await tx
        .delete(contacts)
        .where(and(eq(contacts.userId, userId), inArray(contacts.id, plan.toDelete)));
    }

    const localById = new Map(local.map((row) => [row.id, row]));
    for (const { id, remote } of plan.toUpdate) {
      const existing = localById.get(id);
      if (!existing) continue;
      const googleOwned = googleOwnedContactFields(remote);
      // Biographies are the one Google-owned scalar that is also useful to edit here. A
      // blank remote biography never erases local prose; a nonblank one wins only when the
      // Google source update is newer than the last local write.
      const notes =
        remote.fields.notes &&
        remote.externalUpdatedAt &&
        remote.externalUpdatedAt > existing.updatedAt
          ? remote.fields.notes
          : existing.notes;
      await tx
        .update(contacts)
        .set({ ...googleOwned, notes, updatedAt: new Date() })
        .where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
      await syncContactItems(tx, userId, id, remote.items);
    }

    for (const remote of plan.toInsert) {
      const [row] = await tx
        .insert(contacts)
        .values({ userId, ...googleOwnedContactFields(remote) })
        .returning({ id: contacts.id });
      await syncContactItems(tx, userId, row.id, remote.items);
    }

    const syncedAt = input.syncedAt ?? new Date();
    await tx
      .insert(googleContactSyncs)
      .values({ userId, syncToken: input.nextSyncToken, lastSyncedAt: syncedAt })
      .onConflictDoUpdate({
        target: googleContactSyncs.userId,
        set: {
          syncToken: input.nextSyncToken,
          lastSyncedAt: syncedAt,
          updatedAt: syncedAt,
        },
      });

    return {
      inserted: plan.toInsert.length,
      updated: plan.toUpdate.length,
      deleted: plan.toDelete.length,
    };
  });
}

/** Remove only the local mirror and cursor; Google itself is never changed. */
export async function clearGoogleContactMirror(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(contacts)
      .where(and(eq(contacts.userId, userId), eq(contacts.externalSource, "google")));
    await tx.delete(googleContactSyncs).where(eq(googleContactSyncs.userId, userId));
  });
}
