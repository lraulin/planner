import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contactItems, nodes, notes, taskDetails, users } from "@/db/schema";
import { databaseReachable, warnDatabaseSkipped } from "@/lib/testing/database";
import { createNote } from "@/lib/notes/mutations";
import {
  createContact,
  createContactItem,
  createDiscussionItem,
  deleteContact,
  deleteContactItem,
  moveContactItem,
  setPrimaryContactItem,
  updateContact,
  updateContactItem,
} from "./mutations";
import {
  getContactDetail,
  loadContactOptions,
  loadContacts,
  loadDiscussionItems,
} from "./queries";

const dbReachable = await databaseReachable();
const describeDb = dbReachable ? describe : describe.skip;
if (!dbReachable) warnDatabaseSkipped("contacts mutations");

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      email: `contacts-test-${crypto.randomUUID()}@localhost`,
      name: "Contacts Test",
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

describeDb("contacts mutations", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await makeUser();
  });

  it("creates a contact and derives its display name for the list", async () => {
    await createContact(userId, { givenName: "Ada", familyName: "King" });

    const rows = await loadContacts(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Ada King");
    expect(rows[0].fileAs).toBe("King, Ada");
  });

  it("writes only the keys it was given", async () => {
    const id = await createContact(userId, { givenName: "Ada", company: "Analytical" });
    await updateContact(userId, id, { jobTitle: "Analyst" });

    const detail = await getContactDetail(userId, id);
    expect(detail?.givenName).toBe("Ada");
    expect(detail?.company).toBe("Analytical");
    expect(detail?.jobTitle).toBe("Analyst");
  });

  it("refuses a birthday the CHECK forbids", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    // A day with no month is not a date. Enforced by the database, not only by the form.
    await expect(updateContact(userId, id, { birthdayDay: 4 })).rejects.toThrow();
    await expect(
      updateContact(userId, id, { birthdayMonth: 13, birthdayDay: 4 }),
    ).rejects.toThrow();

    // Month + day with no year is the common case and must be accepted.
    await updateContact(userId, id, { birthdayMonth: 12, birthdayDay: 10 });
    const detail = await getContactDetail(userId, id);
    expect(detail?.birthdayMonth).toBe(12);
    expect(detail?.birthdayYear).toBeNull();
  });

  it("makes the first item of a kind primary without being asked", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "+1 555 0100" });

    const detail = await getContactDetail(userId, id);
    expect(detail?.items[0].isPrimary).toBe(true);
  });

  it("keeps exactly one primary per kind when the choice moves", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    const first = await createContactItem(userId, id, "phone", { value: "111" });
    const second = await createContactItem(userId, id, "phone", { value: "222" });

    await setPrimaryContactItem(userId, second);

    const rows = await db
      .select()
      .from(contactItems)
      .where(and(eq(contactItems.contactId, id), eq(contactItems.isPrimary, true)));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(second);

    // And back again — the clear-then-set has to work in both directions, not just away
    // from whichever row happened to be created first.
    await setPrimaryContactItem(userId, first);
    const after = await db
      .select()
      .from(contactItems)
      .where(and(eq(contactItems.contactId, id), eq(contactItems.isPrimary, true)));
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(first);
  });

  it("does not let a plain update raise a second primary flag", async () => {
    // The path most likely to be written as a bare patch. If it ever stops routing through
    // clear-then-set, the partial unique index throws a raw constraint violation at the user.
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "111" });
    const second = await createContactItem(userId, id, "phone", { value: "222" });

    await updateContactItem(userId, second, { isPrimary: true, label: "work" });

    const rows = await db
      .select()
      .from(contactItems)
      .where(and(eq(contactItems.contactId, id), eq(contactItems.isPrimary, true)));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(second);
    expect(rows[0].label).toBe("work");
  });

  it("keeps primaries independent across kinds", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "111" });
    await createContactItem(userId, id, "email", { value: "ada@example.com" });

    const detail = await getContactDetail(userId, id);
    expect(detail?.items.filter((i) => i.isPrimary)).toHaveLength(2);
  });

  it("surfaces the primary phone and email on the list row", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "111", label: "home" });
    const work = await createContactItem(userId, id, "phone", {
      value: "222",
      label: "work",
    });
    await createContactItem(userId, id, "email", { value: "ada@example.com" });
    await setPrimaryContactItem(userId, work);

    const [row] = await loadContacts(userId);
    expect(row.primaryPhone).toBe("222");
    expect(row.primaryPhoneLabel).toBe("work");
    expect(row.primaryEmail).toBe("ada@example.com");
  });

  it("agrees with the drawer about which phone is primary", async () => {
    // The failure this guards is silent: grid shows one number, detail shows another, and
    // nothing anywhere looks wrong.
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "111" });
    const second = await createContactItem(userId, id, "phone", { value: "222" });
    await setPrimaryContactItem(userId, second);

    const [row] = await loadContacts(userId);
    const detail = await getContactDetail(userId, id);
    const drawerPrimary = detail?.items.find((i) => i.kind === "phone" && i.isPrimary);
    expect(row.primaryPhone).toBe(drawerPrimary?.value);
  });

  it("reorders items within a kind", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "a" });
    const b = await createContactItem(userId, id, "phone", { value: "b" });
    await createContactItem(userId, id, "phone", { value: "c" });

    await moveContactItem(userId, b, "up");

    const detail = await getContactDetail(userId, id);
    expect(detail?.items.map((i) => i.value)).toEqual(["b", "a", "c"]);
  });

  it("ignores a move off either end", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    const only = await createContactItem(userId, id, "phone", { value: "a" });

    await moveContactItem(userId, only, "up");
    await moveContactItem(userId, only, "down");

    const detail = await getContactDetail(userId, id);
    expect(detail?.items.map((i) => i.value)).toEqual(["a"]);
  });

  it("deletes a contact's items with it", async () => {
    const id = await createContact(userId, { givenName: "Ada" });
    await createContactItem(userId, id, "phone", { value: "111" });

    await deleteContact(userId, id);

    const left = await db
      .select()
      .from(contactItems)
      .where(eq(contactItems.contactId, id));
    expect(left).toHaveLength(0);
  });

  it("orders the list by file-as, ignoring diacritics", async () => {
    await createContact(userId, { familyName: "Zulu" });
    await createContact(userId, { familyName: "Ångström" });
    await createContact(userId, { familyName: "Anderson" });

    const rows = await loadContacts(userId);
    expect(rows.map((r) => r.fileAs)).toEqual(["Anderson", "Ångström", "Zulu"]);
  });
});

describeDb("discussion items", () => {
  let userId: string;
  let contactId: string;

  beforeEach(async () => {
    userId = await makeUser();
    contactId = await createContact(userId, {
      givenName: "Johnny",
      familyName: "Yuel",
    });
  });

  it("creates a real task, parented to the Inbox", async () => {
    // Not cosmetic: a root-level task inherits no result-area importance and scores
    // strangely in the Task Chooser, weeks later and far from this function.
    const nodeId = await createDiscussionItem(userId, contactId, {
      name: "Owes me 1 million won",
    });

    const [row] = await db
      .select()
      .from(taskDetails)
      .where(eq(taskDetails.nodeId, nodeId));
    expect(row.contactId).toBe(contactId);

    const items = await loadDiscussionItems(userId, contactId);
    expect(items.map((i) => i.name)).toEqual(["Owes me 1 million won"]);
    expect(items[0].resolved).toBe(false);
  });

  it("survives the contact being deleted, with a null link", async () => {
    const nodeId = await createDiscussionItem(userId, contactId, {
      name: "Ask about X",
    });
    const noteId = await createNote({
      userId,
      values: { title: "Sent 250,000 won", contactId },
    });

    await deleteContact(userId, contactId);

    // Deleting a person must never delete the work, or the record of having done it.
    const [task] = await db
      .select()
      .from(taskDetails)
      .where(eq(taskDetails.nodeId, nodeId));
    expect(task).toBeDefined();
    expect(task.contactId).toBeNull();

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
    expect(note).toBeDefined();
    expect(note.contactId).toBeNull();
  });

  it("counts only unsettled items on the list row", async () => {
    await createDiscussionItem(userId, contactId, { name: "Open one" });
    const done = await createDiscussionItem(userId, contactId, { name: "Done one" });
    await db.update(nodes).set({ state: "completed" }).where(eq(nodes.id, done));

    const [row] = await loadContacts(userId);
    expect(row.openItemCount).toBe(1);
  });

  it("files a note against a contact as history", async () => {
    await createNote({
      userId,
      values: { title: "Sent 400,000 won", contactId },
    });

    const detail = await getContactDetail(userId, contactId);
    expect(detail?.history.map((h) => h.title)).toEqual(["Sent 400,000 won"]);
  });
});

describeDb("user isolation", () => {
  let ownerId: string;
  let intruderId: string;
  let contactId: string;
  let itemId: string;

  beforeEach(async () => {
    ownerId = await makeUser();
    intruderId = await makeUser();
    contactId = await createContact(ownerId, { givenName: "Ada", familyName: "King" });
    itemId = await createContactItem(ownerId, contactId, "phone", { value: "111" });
  });

  it("does not let a second user read another's contacts", async () => {
    expect(await loadContacts(intruderId)).toEqual([]);
    expect(await getContactDetail(intruderId, contactId)).toBeNull();
    expect(await loadContactOptions(intruderId)).toEqual([]);
  });

  it("does not let a second user change another's contact", async () => {
    await expect(
      updateContact(intruderId, contactId, { givenName: "Stolen" }),
    ).rejects.toThrow();

    const detail = await getContactDetail(ownerId, contactId);
    expect(detail?.givenName).toBe("Ada");
  });

  it("does not let a second user delete another's contact", async () => {
    await expect(deleteContact(intruderId, contactId)).rejects.toThrow();
    expect(await getContactDetail(ownerId, contactId)).not.toBeNull();
  });

  it("does not let a second user read another's contact items", async () => {
    const detail = await getContactDetail(intruderId, contactId);
    expect(detail).toBeNull();
  });

  it("does not let a second user change another's contact item", async () => {
    await expect(
      updateContactItem(intruderId, itemId, { value: "stolen" }),
    ).rejects.toThrow();

    const detail = await getContactDetail(ownerId, contactId);
    expect(detail?.items[0].value).toBe("111");
  });

  it("does not let a second user delete another's contact item", async () => {
    await expect(deleteContactItem(intruderId, itemId)).rejects.toThrow();
    const detail = await getContactDetail(ownerId, contactId);
    expect(detail?.items).toHaveLength(1);
  });

  it("does not let a second user reorder or re-primary another's items", async () => {
    await expect(moveContactItem(intruderId, itemId, "down")).rejects.toThrow();
    await expect(setPrimaryContactItem(intruderId, itemId)).rejects.toThrow();
  });

  it("does not let a second user add an item to another's contact", async () => {
    await expect(
      createContactItem(intruderId, contactId, "phone", { value: "stolen" }),
    ).rejects.toThrow();
  });

  it("does not let a second user hang a discussion item off another's contact", async () => {
    await expect(
      createDiscussionItem(intruderId, contactId, { name: "Stolen" }),
    ).rejects.toThrow();
  });

  it("does not let a second user read another's discussion items", async () => {
    await createDiscussionItem(ownerId, contactId, { name: "Private" });
    expect(await loadDiscussionItems(intruderId, contactId)).toEqual([]);
  });
});
