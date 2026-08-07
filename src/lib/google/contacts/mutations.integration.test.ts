import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contactItems, contacts, users } from "@/db/schema";
import {
  createContact,
  createContactItem,
  updateContact,
} from "@/lib/contacts/mutations";
import { loadContacts } from "@/lib/contacts/queries";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import type { RemoteContactItem, RemoteGoogleContact } from "./mapping";
import { applyGoogleContactSync, clearGoogleContactMirror } from "./mutations";
import { getGoogleContactSync } from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("google contacts sync");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `google-contacts-${crypto.randomUUID()}@localhost`,
      name: "Google Contacts Test",
    })
    .returning({ id: users.id });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

function remoteItem(
  kind: RemoteContactItem["kind"],
  value: string,
  patch: Partial<RemoteContactItem> = {},
): RemoteContactItem {
  return {
    kind,
    value,
    label: "",
    displayName: "",
    isPrimary: false,
    streetAddress: "",
    extendedAddress: "",
    poBox: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    countryCode: "",
    ...patch,
  };
}

function remote(
  externalId: string,
  givenName: string,
  patch: Partial<RemoteGoogleContact> = {},
): RemoteGoogleContact {
  return {
    externalId,
    previousExternalIds: [],
    externalEtag: "etag-1",
    externalUpdatedAt: new Date("2026-08-01T12:00:00Z"),
    deleted: false,
    fields: {
      namePrefix: "",
      givenName,
      middleName: "",
      familyName: "Lovelace",
      nameSuffix: "",
      nickname: "",
      initials: "",
      company: "Analytical",
      jobTitle: "Founder",
      department: "R&D",
      managerName: "",
      assistantName: "",
      groupName: "Friends",
      birthdayYear: 1815,
      birthdayMonth: 12,
      birthdayDay: 10,
      photoUrl: "https://example.com/photo.jpg",
      notes: "Remote biography",
    },
    items: [
      remoteItem("phone", "+1 (555) 0100", {
        label: "mobile",
        isPrimary: true,
      }),
      remoteItem("email", "ada@example.com", {
        label: "work",
        isPrimary: true,
      }),
    ],
    ...patch,
  };
}

describeDb("applyGoogleContactSync", () => {
  it("imports a contact, its repeated fields, and the next cursor", async () => {
    const userId = await makeUser();
    const result = await applyGoogleContactSync(userId, {
      mode: "full",
      remote: [remote("people/c1", "Ada")],
      nextSyncToken: "sync-1",
      syncedAt: new Date("2026-08-07T12:00:00Z"),
    });

    expect(result).toEqual({ inserted: 1, updated: 0, deleted: 0 });
    expect(await loadContacts(userId)).toEqual([
      expect.objectContaining({
        displayName: "Ada Lovelace",
        company: "Analytical",
        primaryPhone: "+1 (555) 0100",
        primaryEmail: "ada@example.com",
      }),
    ]);
    expect(await getGoogleContactSync(userId)).toMatchObject({
      syncToken: "sync-1",
      lastSyncedAt: new Date("2026-08-07T12:00:00Z"),
    });
  });

  it("updates Google fields while preserving local contexts and item notes", async () => {
    const userId = await makeUser();
    await applyGoogleContactSync(userId, {
      mode: "full",
      remote: [remote("people/c1", "Ada")],
      nextSyncToken: "sync-1",
    });
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId));
    const [phone] = await db
      .select()
      .from(contactItems)
      .where(and(eq(contactItems.userId, userId), eq(contactItems.kind, "phone")));
    await updateContact(userId, contact.id, { contexts: ["VIP"] });
    await db
      .update(contactItems)
      .set({ notes: "Call after lunch" })
      .where(and(eq(contactItems.id, phone.id), eq(contactItems.userId, userId)));

    await applyGoogleContactSync(userId, {
      mode: "incremental",
      remote: [
        remote("people/c1", "Augusta", {
          externalEtag: "etag-2",
          externalUpdatedAt: new Date("2030-08-07T12:00:00Z"),
          fields: {
            ...remote("unused", "unused").fields,
            givenName: "Augusta",
            notes: "New remote biography",
          },
          items: [
            remoteItem("phone", "+1 555 0100", {
              label: "main",
              isPrimary: true,
            }),
          ],
        }),
      ],
      nextSyncToken: "sync-2",
    });

    const [updated] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contact.id));
    const items = await db
      .select()
      .from(contactItems)
      .where(eq(contactItems.contactId, contact.id));
    expect(updated).toMatchObject({
      givenName: "Augusta",
      contexts: ["VIP"],
      notes: "New remote biography",
      externalEtag: "etag-2",
    });
    expect(items).toEqual([
      expect.objectContaining({
        id: phone.id,
        kind: "phone",
        label: "main",
        notes: "Call after lunch",
      }),
    ]);
  });

  it("a full sweep and disconnect remove only Google-origin contacts", async () => {
    const userId = await makeUser();
    const localId = await createContact(userId, { givenName: "Local" });
    await createContactItem(userId, localId, "email", { value: "local@example.com" });
    await applyGoogleContactSync(userId, {
      mode: "full",
      remote: [remote("people/c1", "Ada")],
      nextSyncToken: "sync-1",
    });

    const swept = await applyGoogleContactSync(userId, {
      mode: "full",
      remote: [],
      nextSyncToken: "sync-2",
    });
    expect(swept.deleted).toBe(1);
    expect((await loadContacts(userId)).map((row) => row.displayName)).toEqual([
      "Local",
    ]);

    await applyGoogleContactSync(userId, {
      mode: "incremental",
      remote: [remote("people/c2", "Grace")],
      nextSyncToken: "sync-3",
    });
    await clearGoogleContactMirror(userId);
    expect((await loadContacts(userId)).map((row) => row.displayName)).toEqual([
      "Local",
    ]);
    expect(await getGoogleContactSync(userId)).toBeNull();
  });

  it("applies an incremental tombstone without sweeping other contacts", async () => {
    const userId = await makeUser();
    await applyGoogleContactSync(userId, {
      mode: "full",
      remote: [remote("people/c1", "Ada"), remote("people/c2", "Grace")],
      nextSyncToken: "sync-1",
    });
    await applyGoogleContactSync(userId, {
      mode: "incremental",
      remote: [remote("people/c1", "", { deleted: true })],
      nextSyncToken: "sync-2",
    });
    expect((await loadContacts(userId)).map((row) => row.displayName)).toEqual([
      "Grace Lovelace",
    ]);
  });
});

describeDb("Google Contacts cross-user isolation", () => {
  it("does not let a second user read, change, or delete the first user's mirror", async () => {
    const ownerId = await makeUser();
    const intruderId = await makeUser();
    await applyGoogleContactSync(ownerId, {
      mode: "full",
      remote: [remote("people/shared", "Owner")],
      nextSyncToken: "owner-1",
    });

    // Read: the external id is identical, but the second user's list is still empty.
    expect(await loadContacts(intruderId)).toEqual([]);

    // Change: syncing the same Google id creates the intruder's own row.
    await applyGoogleContactSync(intruderId, {
      mode: "incremental",
      remote: [remote("people/shared", "Intruder")],
      nextSyncToken: "intruder-1",
    });
    expect((await loadContacts(ownerId))[0].givenName).toBe("Owner");
    expect((await loadContacts(intruderId))[0].givenName).toBe("Intruder");

    // Delete: the tombstone removes only the row under the acting user id.
    await applyGoogleContactSync(intruderId, {
      mode: "incremental",
      remote: [remote("people/shared", "", { deleted: true })],
      nextSyncToken: "intruder-2",
    });
    expect(await loadContacts(intruderId)).toEqual([]);
    expect((await loadContacts(ownerId))[0].givenName).toBe("Owner");
  });
});
