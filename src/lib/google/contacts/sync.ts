import { GoogleNotLinkedError } from "../client";
import {
  GooglePeopleSyncExpiredError,
  listGoogleConnections,
  listGoogleContactGroups,
} from "./client";
import { mapGooglePerson } from "./mapping";
import { applyGoogleContactSync } from "./mutations";
import { getGoogleContactSync, googleContactSyncIsStale } from "./queries";

export const CONTACT_SYNC_MAX_AGE_MS = 5 * 60_000;

export type GoogleContactSyncStatus =
  | { state: "off" }
  | { state: "skipped" }
  | { state: "ok"; inserted: number; updated: number; deleted: number }
  | { state: "not_linked"; message: string }
  | { state: "failed"; message: string };

async function fetchAndApply(
  userId: string,
  syncToken?: string,
): Promise<GoogleContactSyncStatus> {
  const mode = syncToken ? "incremental" : "full";
  const [result, groupNames] = await Promise.all([
    listGoogleConnections(userId, syncToken),
    listGoogleContactGroups(userId),
  ]);
  const remote = result.people.flatMap((person) => {
    const mapped = mapGooglePerson(person, groupNames);
    return mapped ? [mapped] : [];
  });
  const counts = await applyGoogleContactSync(userId, {
    mode,
    remote,
    nextSyncToken: result.nextSyncToken,
  });
  return { state: "ok", ...counts };
}

/** Run now, enabling the mirror on the first successful full response. */
export async function syncGoogleContacts(
  userId: string,
): Promise<GoogleContactSyncStatus> {
  const state = await getGoogleContactSync(userId);
  try {
    try {
      return await fetchAndApply(userId, state?.syncToken);
    } catch (error) {
      if (!(error instanceof GooglePeopleSyncExpiredError)) throw error;
      // Google cursors expire after seven days. A full response is the recovery protocol,
      // not a failure: it also repairs any missed remote tombstone.
      return await fetchAndApply(userId);
    }
  } catch (error) {
    if (error instanceof GoogleNotLinkedError) {
      return { state: "not_linked", message: error.message };
    }
    return {
      state: "failed",
      message:
        error instanceof Error ? error.message : "Could not reach Google Contacts.",
    };
  }
}

/** Opportunistic refresh for `/contacts`; no cursor means the feature stays off. */
export async function syncGoogleContactsIfStale(
  userId: string,
): Promise<GoogleContactSyncStatus> {
  if (!(await getGoogleContactSync(userId))) return { state: "off" };
  if (!(await googleContactSyncIsStale(userId, CONTACT_SYNC_MAX_AGE_MS))) {
    return { state: "skipped" };
  }
  return syncGoogleContacts(userId);
}
