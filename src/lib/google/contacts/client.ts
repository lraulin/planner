import { GoogleNotLinkedError, getGoogleAccessToken } from "../client";
import type { GooglePerson } from "./mapping";

const PEOPLE_API = "https://people.googleapis.com/v1";
const PERSON_FIELDS = [
  "metadata",
  "names",
  "nicknames",
  "organizations",
  "relations",
  "memberships",
  "birthdays",
  "photos",
  "biographies",
  "phoneNumbers",
  "emailAddresses",
  "addresses",
  "urls",
  "events",
  "imClients",
  "userDefined",
].join(",");

export class GooglePeopleSyncExpiredError extends Error {
  constructor() {
    super("The Google Contacts sync cursor expired.");
    this.name = "GooglePeopleSyncExpiredError";
  }
}

export class GooglePeopleApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GooglePeopleApiError";
    this.status = status;
  }
}

type GoogleErrorBody = {
  error?: {
    message?: string;
    details?: { reason?: string }[];
  };
};

async function peopleFetch(
  accessToken: string,
  path: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${PEOPLE_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (response.ok) return (await response.json()) as Record<string, unknown>;

  const raw = await response.text();
  let body: GoogleErrorBody = {};
  try {
    body = JSON.parse(raw) as GoogleErrorBody;
  } catch {
    // Keep Google's plain response as the fallback message below.
  }
  const reason = body.error?.details?.find((detail) => detail.reason)?.reason;
  const message = body.error?.message ?? (raw || "Google People API request failed.");

  if (reason === "EXPIRED_SYNC_TOKEN" || /expired.sync.token/i.test(message)) {
    throw new GooglePeopleSyncExpiredError();
  }
  if (
    response.status === 401 ||
    (response.status === 403 && /insufficient|permission|scope/i.test(message))
  ) {
    throw new GoogleNotLinkedError(
      "Google Contacts permission is missing. Reconnect Google in Settings to grant read-only Contacts access.",
    );
  }
  throw new GooglePeopleApiError(
    response.status,
    `Google People API ${response.status}: ${message}`,
  );
}

export type GoogleConnectionsResult = {
  people: GooglePerson[];
  nextSyncToken: string;
};

/** Fetch a complete page sequence or the changes after an existing cursor. */
export async function listGoogleConnections(
  userId: string,
  syncToken?: string,
): Promise<GoogleConnectionsResult> {
  const accessToken = await getGoogleAccessToken(userId);
  const people: GooglePerson[] = [];
  let pageToken: string | undefined;
  let nextSyncToken = "";

  do {
    const query = new URLSearchParams({
      pageSize: "1000",
      personFields: PERSON_FIELDS,
      requestSyncToken: "true",
    });
    query.append("sources", "READ_SOURCE_TYPE_CONTACT");
    if (syncToken) query.set("syncToken", syncToken);
    if (pageToken) query.set("pageToken", pageToken);

    const page = (await peopleFetch(
      accessToken,
      `/people/me/connections?${query}`,
    )) as {
      connections?: GooglePerson[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    people.push(...(page.connections ?? []));
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);

  if (!nextSyncToken) {
    throw new GooglePeopleApiError(
      502,
      "Google Contacts did not return the sync cursor required to keep the mirror current.",
    );
  }
  return { people, nextSyncToken };
}

type GoogleContactGroup = {
  resourceName?: string;
  name?: string;
  groupType?: string;
};

/** Resource-name → user-facing name for user-defined Google contact groups. */
export async function listGoogleContactGroups(
  userId: string,
): Promise<Map<string, string>> {
  const accessToken = await getGoogleAccessToken(userId);
  const names = new Map<string, string>();
  let pageToken: string | undefined;

  do {
    const query = new URLSearchParams({
      pageSize: "1000",
      groupFields: "name,groupType",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const page = (await peopleFetch(accessToken, `/contactGroups?${query}`)) as {
      contactGroups?: GoogleContactGroup[];
      nextPageToken?: string;
    };
    for (const group of page.contactGroups ?? []) {
      if (
        group.groupType === "USER_CONTACT_GROUP" &&
        group.resourceName &&
        group.name
      ) {
        names.set(group.resourceName, group.name);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return names;
}
