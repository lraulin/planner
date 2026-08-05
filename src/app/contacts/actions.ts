"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import type { ContactItemKind, PriorityLetter } from "@/db/schema";
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
} from "@/lib/contacts/mutations";
import {
  getContactDetail,
  loadContactOptions,
  loadContacts,
} from "@/lib/contacts/queries";
import type {
  ContactDetail,
  ContactInput,
  ContactItemInput,
  ContactListRow,
  ContactOption,
} from "@/lib/contacts/types";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Errors are returned rather than thrown, so a rejected save renders inline in the drawer
 * instead of taking the page down — `drawer-pattern.md`.
 */
async function run<T>(work: (userId: string) => Promise<T>): Promise<ActionResult> {
  try {
    const userId = await getCurrentUserId();
    const result = await work(userId);
    revalidatePath("/", "layout");
    return typeof result === "string" ? { ok: true, id: result } : { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

type QueryResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function runQuery<T>(
  work: (userId: string) => Promise<T>,
): Promise<QueryResult<T>> {
  try {
    const userId = await getCurrentUserId();
    return { ok: true, data: await work(userId) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export async function createContactAction(input?: ContactInput): Promise<ActionResult> {
  return run((userId) => createContact(userId, input));
}

export async function updateContactAction(
  contactId: string,
  input: ContactInput,
): Promise<ActionResult> {
  return run((userId) => updateContact(userId, contactId, input));
}

export async function deleteContactAction(contactId: string): Promise<ActionResult> {
  return run((userId) => deleteContact(userId, contactId));
}

export async function listContactsAction(): Promise<QueryResult<ContactListRow[]>> {
  return runQuery(loadContacts);
}

export async function getContactDetailAction(
  contactId: string,
): Promise<QueryResult<ContactDetail | null>> {
  return runQuery((userId) => getContactDetail(userId, contactId));
}

export async function listContactOptionsAction(): Promise<
  QueryResult<ContactOption[]>
> {
  return runQuery(loadContactOptions);
}

// ── Phones, e-mails, addresses, URLs ─────────────────────────────────────────

export async function createContactItemAction(
  contactId: string,
  kind: ContactItemKind,
  input?: ContactItemInput,
): Promise<ActionResult> {
  return run((userId) => createContactItem(userId, contactId, kind, input));
}

export async function updateContactItemAction(
  itemId: string,
  input: ContactItemInput,
): Promise<ActionResult> {
  return run((userId) => updateContactItem(userId, itemId, input));
}

export async function deleteContactItemAction(itemId: string): Promise<ActionResult> {
  return run((userId) => deleteContactItem(userId, itemId));
}

export async function moveContactItemAction(
  itemId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  return run((userId) => moveContactItem(userId, itemId, direction));
}

export async function setPrimaryContactItemAction(
  itemId: string,
): Promise<ActionResult> {
  return run((userId) => setPrimaryContactItem(userId, itemId));
}

// ── Discussion items ─────────────────────────────────────────────────────────

export async function createDiscussionItemAction(
  contactId: string,
  values?: {
    name?: string;
    priorityLetter?: PriorityLetter | null;
    priorityRank?: number | null;
    deadline?: Date | null;
    contexts?: string[];
    description?: string;
  },
): Promise<ActionResult> {
  return run((userId) => createDiscussionItem(userId, contactId, values));
}
