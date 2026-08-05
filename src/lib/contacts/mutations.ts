import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { contactItems, contacts } from "@/db/schema";
import type { ContactItemKind, PriorityLetter } from "@/db/schema";
import { between } from "@/lib/tree/sortKey";
import { ensureInbox } from "@/lib/capture/mutations";
import { createNode } from "@/lib/tree/mutations";
import { saveNodeDetail } from "@/lib/detail/mutations";
import type { ContactInput, ContactItemInput } from "./types";

/**
 * Contacts domain writes. Every function takes `userId` and scopes on it, so a caller
 * cannot reach another user's rows by guessing an id. Items cascade with the contact;
 * discussion-item tasks and history notes never do — deleting a person must not delete the
 * work or the record of it.
 */

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireContact(tx: Executor, userId: string, contactId: string) {
  const [row] = await tx
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Contact not found.");
  return row;
}

async function requireItem(tx: Executor, userId: string, itemId: string) {
  const [row] = await tx
    .select()
    .from(contactItems)
    .where(and(eq(contactItems.id, itemId), eq(contactItems.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Contact detail not found.");
  return row;
}

async function nextSortKey(
  tx: Executor,
  userId: string,
  contactId: string,
  kind: ContactItemKind,
): Promise<string> {
  const siblings = await tx
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
  return between(siblings[siblings.length - 1]?.sortKey ?? null, null);
}

/** A birthday part, or null. Range is enforced by a CHECK; this only rejects nonsense. */
function birthdayPart(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Number.isInteger(value))
    throw new Error("Birthday parts must be whole numbers.");
  return value;
}

/** Copies only the keys the caller actually supplied. */
function scalarPatch(input: ContactInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const text = [
    "namePrefix",
    "givenName",
    "middleName",
    "familyName",
    "nameSuffix",
    "nickname",
    "initials",
    "fileAs",
    "company",
    "jobTitle",
    "department",
    "managerName",
    "assistantName",
    "groupName",
    "notes",
  ] as const;

  for (const key of text) {
    const value = input[key];
    if (value !== undefined) patch[key] = value;
  }
  if (input.contexts !== undefined) patch.contexts = input.contexts;

  const year = birthdayPart(input.birthdayYear);
  const month = birthdayPart(input.birthdayMonth);
  const day = birthdayPart(input.birthdayDay);
  if (year !== undefined) patch.birthdayYear = year;
  if (month !== undefined) patch.birthdayMonth = month;
  if (day !== undefined) patch.birthdayDay = day;

  return patch;
}

export async function createContact(
  userId: string,
  input: ContactInput = {},
): Promise<string> {
  const [row] = await db
    .insert(contacts)
    .values({ userId, ...scalarPatch(input) })
    .returning({ id: contacts.id });
  return row.id;
}

export async function updateContact(
  userId: string,
  contactId: string,
  input: ContactInput,
): Promise<void> {
  const patch = scalarPatch(input);
  if (Object.keys(patch).length === 0) return;

  const updated = await db
    .update(contacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });
  if (updated.length === 0) throw new Error("Contact not found.");
}

export async function deleteContact(userId: string, contactId: string): Promise<void> {
  const deleted = await db
    .delete(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .returning({ id: contacts.id });
  if (deleted.length === 0) throw new Error("Contact not found.");
}

/** The columns of one repeating sub-record a caller may write. */
function itemPatch(input: ContactItemInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const keys = [
    "label",
    "value",
    "displayName",
    "notes",
    "streetAddress",
    "extendedAddress",
    "poBox",
    "city",
    "region",
    "postalCode",
    "country",
    "countryCode",
  ] as const;

  for (const key of keys) {
    const value = input[key];
    if (value !== undefined) patch[key] = value;
  }
  return patch;
}

/**
 * Clear whichever row currently holds primary for this (contact, kind), so the caller can
 * set a new one. **Must run before the set, inside the same transaction** — the partial
 * unique index rejects a second flagged row, and a plain patch would surface as a raw
 * Postgres constraint violation in the user's face.
 */
async function clearPrimary(
  tx: Executor,
  userId: string,
  contactId: string,
  kind: ContactItemKind,
  exceptItemId?: string,
): Promise<void> {
  const where = [
    eq(contactItems.userId, userId),
    eq(contactItems.contactId, contactId),
    eq(contactItems.kind, kind),
    eq(contactItems.isPrimary, true),
  ];
  if (exceptItemId) where.push(ne(contactItems.id, exceptItemId));

  await tx
    .update(contactItems)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(and(...where));
}

export async function createContactItem(
  userId: string,
  contactId: string,
  kind: ContactItemKind,
  input: ContactItemInput = {},
): Promise<string> {
  return db.transaction(async (tx) => {
    await requireContact(tx, userId, contactId);
    const sortKey = await nextSortKey(tx, userId, contactId, kind);

    // First of its kind is primary by default — a contact with one phone has a primary
    // phone, and making the user click a radio to say so is busywork.
    const existing = await tx
      .select({ id: contactItems.id })
      .from(contactItems)
      .where(
        and(
          eq(contactItems.userId, userId),
          eq(contactItems.contactId, contactId),
          eq(contactItems.kind, kind),
        ),
      )
      .limit(1);
    const isPrimary = input.isPrimary ?? existing.length === 0;

    if (isPrimary) await clearPrimary(tx, userId, contactId, kind);

    const [row] = await tx
      .insert(contactItems)
      .values({
        userId,
        contactId,
        kind,
        sortKey,
        isPrimary,
        ...itemPatch(input),
      })
      .returning({ id: contactItems.id });
    return row.id;
  });
}

export async function updateContactItem(
  userId: string,
  itemId: string,
  input: ContactItemInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, userId, itemId);
    const patch = itemPatch(input);

    // Every path that can raise the flag goes through the same clear-then-set, including
    // this one. Two paths is how the second one forgets.
    if (input.isPrimary === true) {
      await clearPrimary(tx, userId, item.contactId, item.kind, itemId);
      patch.isPrimary = true;
    } else if (input.isPrimary === false) {
      patch.isPrimary = false;
    }

    if (Object.keys(patch).length === 0) return;

    await tx
      .update(contactItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(contactItems.id, itemId), eq(contactItems.userId, userId)));
  });
}

/** Make this item the primary of its kind. The clear and the set are one transaction. */
export async function setPrimaryContactItem(
  userId: string,
  itemId: string,
): Promise<void> {
  await updateContactItem(userId, itemId, { isPrimary: true });
}

export async function deleteContactItem(userId: string, itemId: string): Promise<void> {
  const deleted = await db
    .delete(contactItems)
    .where(and(eq(contactItems.id, itemId), eq(contactItems.userId, userId)))
    .returning({ id: contactItems.id });
  if (deleted.length === 0) throw new Error("Contact detail not found.");
}

/** Swap an item with its neighbour of the same kind. */
export async function moveContactItem(
  userId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<void> {
  await db.transaction(async (tx) => {
    const item = await requireItem(tx, userId, itemId);
    const siblings = await tx
      .select({ id: contactItems.id, sortKey: contactItems.sortKey })
      .from(contactItems)
      .where(
        and(
          eq(contactItems.userId, userId),
          eq(contactItems.contactId, item.contactId),
          eq(contactItems.kind, item.kind),
        ),
      )
      .orderBy(asc(contactItems.sortKey));

    const index = siblings.findIndex((s) => s.id === itemId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= siblings.length) return;

    // Land between the neighbour and whatever is on its far side, the same way the outline
    // reorders — no renumbering pass, so a move is one row's write.
    const beyond = direction === "up" ? target - 1 : target + 1;
    const [before, after] =
      direction === "up"
        ? [siblings[beyond]?.sortKey ?? null, siblings[target].sortKey]
        : [siblings[target].sortKey, siblings[beyond]?.sortKey ?? null];

    await tx
      .update(contactItems)
      .set({ sortKey: between(before, after), updatedAt: new Date() })
      .where(and(eq(contactItems.id, itemId), eq(contactItems.userId, userId)));
  });
}

/**
 * Create a discussion item for a contact — Achieve's Discussion Items grid, which is a task
 * list in everything but name.
 *
 * Composes the existing pieces rather than touching tables: the Inbox, `createNode`, and
 * `saveNodeDetail`'s allowlist. **Parented to the Inbox, not to nothing** — a root-level
 * task inherits no result-area importance and scores strangely in the Task Chooser, which
 * shows up weeks later as "why is this ranked oddly" rather than as a bug in this function.
 */
export async function createDiscussionItem(
  userId: string,
  contactId: string,
  values: {
    name?: string;
    priorityLetter?: PriorityLetter | null;
    priorityRank?: number | null;
    deadline?: Date | null;
    contexts?: string[];
    description?: string;
  } = {},
): Promise<string> {
  await requireContact(db, userId, contactId);

  const inboxId = await ensureInbox(userId);
  const nodeId = await createNode({
    userId,
    parentId: inboxId,
    type: "task",
    name: values.name?.trim() || "New discussion item",
  });

  await saveNodeDetail(userId, nodeId, {
    priorityLetter: values.priorityLetter ?? null,
    priorityRank: values.priorityRank ?? null,
    deadline: values.deadline ?? null,
    task: {
      contactId,
      contexts: values.contexts ?? [],
      description: values.description ?? "",
    },
  });

  return nodeId;
}
