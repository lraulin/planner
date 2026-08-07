import type { ContactItemKind } from "@/db/schema";
import type { RemoteContactItem, RemoteGoogleContact } from "./mapping";

export type LocalGoogleContact = {
  id: string;
  externalId: string;
  externalEtag: string;
};

export type ContactMirrorPlan = {
  toInsert: RemoteGoogleContact[];
  toUpdate: { id: string; remote: RemoteGoogleContact }[];
  toDelete: string[];
};

/**
 * Decide which contact rows a full or incremental People response changes.
 *
 * A full response is the complete source of truth and sweeps missing Google rows. A delta
 * is not: only explicit tombstones delete. Previous resource names are aliases for the same
 * person and are resolved before deciding that a contact is new.
 */
export function planContactMirror(
  local: LocalGoogleContact[],
  remote: RemoteGoogleContact[],
  mode: "full" | "incremental",
): ContactMirrorPlan {
  const localByExternalId = new Map(local.map((row) => [row.externalId, row]));
  const seen = new Set<string>();
  const toInsert: RemoteGoogleContact[] = [];
  const toUpdate: { id: string; remote: RemoteGoogleContact }[] = [];
  const toDelete = new Set<string>();

  for (const contact of remote) {
    const matched =
      localByExternalId.get(contact.externalId) ??
      contact.previousExternalIds
        .map((id) => localByExternalId.get(id))
        .find((row) => row !== undefined);

    if (matched) seen.add(matched.id);
    if (contact.deleted) {
      if (matched) toDelete.add(matched.id);
      continue;
    }

    if (!matched) {
      toInsert.push(contact);
      continue;
    }

    if (
      matched.externalId !== contact.externalId ||
      matched.externalEtag !== contact.externalEtag
    ) {
      toUpdate.push({ id: matched.id, remote: contact });
    }
  }

  if (mode === "full") {
    for (const row of local) {
      if (!seen.has(row.id)) toDelete.add(row.id);
    }
  }

  return { toInsert, toUpdate, toDelete: [...toDelete] };
}

export type LocalContactItemForSync = {
  id: string;
  kind: ContactItemKind;
  value: string;
  sortKey: string;
};

export type ContactItemPlan = {
  toInsert: RemoteContactItem[];
  toUpdate: { id: string; fields: RemoteContactItem }[];
  toDelete: string[];
};

/** The stable-enough identity People does not provide for repeated contact fields. */
export function contactItemKey(item: { kind: ContactItemKind; value: string }): string {
  let value = item.value.trim().toLowerCase();
  if (item.kind === "phone") value = value.replace(/(?!^\+)[^0-9]/g, "");
  return `${item.kind}\u0000${value}`;
}

/**
 * Reconcile repeated fields without replacing matched rows. Keeping their ids and sort
 * keys is what keeps local-only per-row notes attached to the right phone or address.
 */
export function planContactItems(
  local: LocalContactItemForSync[],
  remote: RemoteContactItem[],
): ContactItemPlan {
  const queues = new Map<string, LocalContactItemForSync[]>();
  for (const row of local) {
    const key = contactItemKey(row);
    const queue = queues.get(key);
    if (queue) queue.push(row);
    else queues.set(key, [row]);
  }

  const matched = new Set<string>();
  const toInsert: RemoteContactItem[] = [];
  const toUpdate: { id: string; fields: RemoteContactItem }[] = [];

  for (const fields of remote) {
    const row = queues.get(contactItemKey(fields))?.shift();
    if (!row) {
      toInsert.push(fields);
      continue;
    }
    matched.add(row.id);
    toUpdate.push({ id: row.id, fields });
  }

  return {
    toInsert,
    toUpdate,
    toDelete: local.filter((row) => !matched.has(row.id)).map((row) => row.id),
  };
}
