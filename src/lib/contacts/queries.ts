import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactItems, contacts, nodes, taskDetails } from "@/db/schema";
import type { ContactItemKind } from "@/db/schema";
import { loadNotesForContact } from "@/lib/notes/queries";
import { noteSnippet } from "@/lib/notes/snippet";
import { compareContacts, displayNameOf, fileAsOf, primaryOf } from "./name";
import { GRID_CONTACT_ITEM_KINDS } from "./itemKinds";
import type {
  ContactDetail,
  ContactHistoryEntry,
  ContactItemView,
  ContactListRow,
  ContactOption,
  DiscussionItemSummary,
} from "./types";

/** A discussion item is open unless its task has been finished or abandoned. */
const SETTLED_STATES = ["completed", "cancelled"] as const;

function toItemView(row: typeof contactItems.$inferSelect): ContactItemView {
  return {
    id: row.id,
    contactId: row.contactId,
    kind: row.kind,
    sortKey: row.sortKey,
    label: row.label,
    value: row.value,
    displayName: row.displayName,
    isPrimary: row.isPrimary,
    notes: row.notes,
    streetAddress: row.streetAddress,
    extendedAddress: row.extendedAddress,
    poBox: row.poBox,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    countryCode: row.countryCode,
  };
}

/**
 * The Contacts grid's rows.
 *
 * **Three queries assembled in TypeScript, not one with lateral joins.** The rule for which
 * phone is "the" phone — flagged first, then lowest sort key — has to be identical here and
 * in the drawer, or the grid shows one number while the detail shows another and neither is
 * wrong enough to notice. Written once as `primaryOf`, it cannot drift; expressed a second
 * time as `DISTINCT ON … ORDER BY is_primary DESC` it is a second implementation in a second
 * language that no unit test covers. `listMetrics` assembles the same way.
 */
export async function loadContacts(userId: string): Promise<ContactListRow[]> {
  const [rows, items, openCounts] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.userId, userId)),

    db
      .select()
      .from(contactItems)
      .where(
        and(
          eq(contactItems.userId, userId),
          inArray(contactItems.kind, [...GRID_CONTACT_ITEM_KINDS]),
        ),
      )
      .orderBy(asc(contactItems.sortKey)),

    db
      .select({
        contactId: taskDetails.contactId,
        count: sql<number>`count(*)::int`,
      })
      .from(taskDetails)
      .innerJoin(nodes, eq(nodes.id, taskDetails.nodeId))
      .where(
        and(
          eq(nodes.userId, userId),
          sql`${taskDetails.contactId} is not null`,
          notInArray(nodes.state, [...SETTLED_STATES]),
        ),
      )
      .groupBy(taskDetails.contactId),
  ]);

  const byContact = new Map<string, Map<ContactItemKind, ContactItemView[]>>();
  for (const item of items) {
    let kinds = byContact.get(item.contactId);
    if (!kinds) {
      kinds = new Map();
      byContact.set(item.contactId, kinds);
    }
    const list = kinds.get(item.kind);
    if (list) list.push(toItemView(item));
    else kinds.set(item.kind, [toItemView(item)]);
  }

  const openByContact = new Map(
    openCounts.flatMap((row) => (row.contactId ? [[row.contactId, row.count]] : [])),
  );

  const list = rows.map((row): ContactListRow => {
    const kinds = byContact.get(row.id);
    const phone = primaryOf(kinds?.get("phone") ?? []);
    const email = primaryOf(kinds?.get("email") ?? []);
    const address = primaryOf(kinds?.get("address") ?? []);

    return {
      id: row.id,
      // The email fallback is why items are loaded before names are derived: a contact
      // captured as nothing but an address still needs something to click on.
      displayName: displayNameOf(row, email?.value),
      fileAs: fileAsOf(row),
      givenName: row.givenName,
      familyName: row.familyName,
      company: row.company,
      jobTitle: row.jobTitle,
      groupName: row.groupName,
      contexts: row.contexts,
      primaryPhone: phone?.value ?? "",
      primaryPhoneLabel: phone?.label ?? "",
      primaryEmail: email?.value ?? "",
      primaryEmailLabel: email?.label ?? "",
      primaryCity: address?.city ?? "",
      openItemCount: openByContact.get(row.id) ?? 0,
      updatedAt: row.updatedAt,
    };
  });

  return list.sort(compareContacts);
}

/** Everything the contact drawer shows, for one contact. */
export async function getContactDetail(
  userId: string,
  contactId: string,
): Promise<ContactDetail | null> {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);
  if (!row) return null;

  const [items, discussionItems, notes] = await Promise.all([
    db
      .select()
      .from(contactItems)
      .where(
        and(eq(contactItems.userId, userId), eq(contactItems.contactId, contactId)),
      )
      .orderBy(asc(contactItems.kind), asc(contactItems.sortKey)),
    loadDiscussionItems(userId, contactId),
    loadNotesForContact(userId, contactId),
  ]);

  const views = items.map(toItemView);
  const primaryEmail = primaryOf(views.filter((item) => item.kind === "email"));

  const history: ContactHistoryEntry[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    noteDate: note.noteDate,
    snippet: noteSnippet(note.body),
    updatedAt: note.updatedAt,
  }));

  return {
    id: row.id,
    namePrefix: row.namePrefix,
    givenName: row.givenName,
    middleName: row.middleName,
    familyName: row.familyName,
    nameSuffix: row.nameSuffix,
    nickname: row.nickname,
    initials: row.initials,
    fileAs: row.fileAs,
    company: row.company,
    jobTitle: row.jobTitle,
    department: row.department,
    managerName: row.managerName,
    assistantName: row.assistantName,
    groupName: row.groupName,
    birthdayYear: row.birthdayYear,
    birthdayMonth: row.birthdayMonth,
    birthdayDay: row.birthdayDay,
    photoUrl: row.photoUrl,
    notes: row.notes,
    contexts: row.contexts,
    displayName: displayNameOf(row, primaryEmail?.value),
    updatedAt: row.updatedAt,
    items: views,
    discussionItems,
    history,
  };
}

/**
 * A contact's discussion items — the tasks that carry its id. Open ones first, then settled,
 * each block by priority, so the drawer opens on what still needs saying.
 */
export async function loadDiscussionItems(
  userId: string,
  contactId: string,
): Promise<DiscussionItemSummary[]> {
  const rows = await db
    .select({
      nodeId: nodes.id,
      name: nodes.name,
      priorityLetter: nodes.priorityLetter,
      priorityRank: nodes.priorityRank,
      state: nodes.state,
      deadline: nodes.deadline,
      contexts: taskDetails.contexts,
      description: taskDetails.description,
    })
    .from(taskDetails)
    .innerJoin(nodes, eq(nodes.id, taskDetails.nodeId))
    .where(and(eq(nodes.userId, userId), eq(taskDetails.contactId, contactId)))
    .orderBy(asc(nodes.priorityLetter), asc(nodes.priorityRank), asc(nodes.name));

  return rows.map((row) => ({
    nodeId: row.nodeId,
    name: row.name,
    priorityLetter: row.priorityLetter,
    priorityRank: row.priorityRank,
    state: row.state,
    deadline: row.deadline,
    contexts: row.contexts ?? [],
    description: row.description ?? "",
    resolved: (SETTLED_STATES as readonly string[]).includes(row.state),
  }));
}

/**
 * Names for a picker. Derived through `displayNameOf` like everything else, so the Task
 * drawer's Contact field reads the same string the Contacts grid does.
 */
export async function loadContactOptions(userId: string): Promise<ContactOption[]> {
  const [rows, emailRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.userId, userId)),
    db
      .select()
      .from(contactItems)
      .where(and(eq(contactItems.userId, userId), eq(contactItems.kind, "email")))
      .orderBy(asc(contactItems.sortKey)),
  ]);

  const emailsByContact = new Map<string, ContactItemView[]>();
  for (const row of emailRows) {
    const items = emailsByContact.get(row.contactId);
    if (items) items.push(toItemView(row));
    else emailsByContact.set(row.contactId, [toItemView(row)]);
  }

  return rows
    .map((row) => ({
      id: row.id,
      // This is a picker as well as a grid lookup. Preserve the same e-mail fallback the
      // Contacts page uses, or an e-mail-only person turns into an unhelpful "Unnamed
      // contact" everywhere except their own list.
      displayName: displayNameOf(
        row,
        primaryOf(emailsByContact.get(row.id) ?? [])?.value,
      ),
      fileAs: fileAsOf(row),
    }))
    .sort(compareContacts)
    .map(({ id, displayName }) => ({ id, displayName }));
}
