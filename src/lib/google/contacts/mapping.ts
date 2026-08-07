import type { ContactItemKind } from "@/db/schema";

type FieldMetadata = { primary?: boolean };
type GoogleField = { metadata?: FieldMetadata };
type GoogleDate = { year?: number; month?: number; day?: number };

export type GooglePerson = {
  resourceName?: string;
  etag?: string;
  metadata?: {
    deleted?: boolean;
    previousResourceNames?: string[];
    sources?: { type?: string; updateTime?: string }[];
  };
  names?: (GoogleField & {
    honorificPrefix?: string;
    givenName?: string;
    middleName?: string;
    familyName?: string;
    honorificSuffix?: string;
  })[];
  nicknames?: (GoogleField & { value?: string; type?: string })[];
  organizations?: (GoogleField & {
    name?: string;
    title?: string;
    department?: string;
    current?: boolean;
  })[];
  relations?: (GoogleField & { person?: string; type?: string })[];
  memberships?: (GoogleField & {
    contactGroupMembership?: { contactGroupResourceName?: string };
  })[];
  birthdays?: (GoogleField & { date?: GoogleDate })[];
  photos?: (GoogleField & { url?: string; default?: boolean })[];
  biographies?: (GoogleField & { value?: string; contentType?: string })[];
  phoneNumbers?: (GoogleField & {
    value?: string;
    canonicalForm?: string;
    type?: string;
  })[];
  emailAddresses?: (GoogleField & {
    value?: string;
    displayName?: string;
    type?: string;
  })[];
  addresses?: (GoogleField & {
    formattedValue?: string;
    type?: string;
    streetAddress?: string;
    extendedAddress?: string;
    poBox?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
  })[];
  urls?: (GoogleField & { value?: string; type?: string })[];
  events?: (GoogleField & { date?: GoogleDate; type?: string })[];
  imClients?: (GoogleField & {
    username?: string;
    type?: string;
    protocol?: string;
  })[];
  userDefined?: (GoogleField & { key?: string; value?: string })[];
};

export type RemoteContactItem = {
  kind: ContactItemKind;
  label: string;
  value: string;
  displayName: string;
  isPrimary: boolean;
  streetAddress: string;
  extendedAddress: string;
  poBox: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  countryCode: string;
};

export type RemoteGoogleContact = {
  externalId: string;
  previousExternalIds: string[];
  externalEtag: string;
  externalUpdatedAt: Date | null;
  deleted: boolean;
  fields: {
    namePrefix: string;
    givenName: string;
    middleName: string;
    familyName: string;
    nameSuffix: string;
    nickname: string;
    initials: string;
    company: string;
    jobTitle: string;
    department: string;
    managerName: string;
    assistantName: string;
    groupName: string;
    birthdayYear: number | null;
    birthdayMonth: number | null;
    birthdayDay: number | null;
    photoUrl: string;
    notes: string;
  };
  items: RemoteContactItem[];
};

function primary<T extends GoogleField>(items: T[] | undefined): T | undefined {
  return items?.find((item) => item.metadata?.primary) ?? items?.[0];
}

function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

function item(
  kind: ContactItemKind,
  value: string | undefined,
  fields: Partial<Omit<RemoteContactItem, "kind" | "value">> = {},
): RemoteContactItem | null {
  const cleanValue = text(value);
  if (!cleanValue) return null;
  return {
    kind,
    value: cleanValue,
    label: fields.label ?? "",
    displayName: fields.displayName ?? "",
    isPrimary: fields.isPrimary ?? false,
    streetAddress: fields.streetAddress ?? "",
    extendedAddress: fields.extendedAddress ?? "",
    poBox: fields.poBox ?? "",
    city: fields.city ?? "",
    region: fields.region ?? "",
    postalCode: fields.postalCode ?? "",
    country: fields.country ?? "",
    countryCode: fields.countryCode ?? "",
  };
}

function compact<T>(values: (T | null)[]): T[] {
  return values.filter((value): value is T => value !== null);
}

function dateValue(value: GoogleDate | undefined): string {
  if (!value) return "";
  const year = Number.isInteger(value.year) ? String(value.year) : "";
  const month = Number.isInteger(value.month)
    ? String(value.month).padStart(2, "0")
    : "";
  const day = Number.isInteger(value.day) ? String(value.day).padStart(2, "0") : "";
  if (month && day) return year ? `${year}-${month}-${day}` : `--${month}-${day}`;
  return year;
}

function latestUpdate(person: GooglePerson): Date | null {
  let latest: Date | null = null;
  for (const source of person.metadata?.sources ?? []) {
    if (source.type && source.type !== "CONTACT") continue;
    if (!source.updateTime) continue;
    const parsed = new Date(source.updateTime);
    if (Number.isNaN(parsed.getTime())) continue;
    if (!latest || parsed > latest) latest = parsed;
  }
  return latest;
}

/** Convert one People API Person into the Google-owned portion of a Planner contact. */
export function mapGooglePerson(
  person: GooglePerson,
  groupNames: ReadonlyMap<string, string> = new Map(),
): RemoteGoogleContact | null {
  const externalId = text(person.resourceName);
  if (!externalId) return null;

  const deleted = Boolean(person.metadata?.deleted);
  if (deleted) {
    return {
      externalId,
      previousExternalIds: person.metadata?.previousResourceNames ?? [],
      externalEtag: text(person.etag),
      externalUpdatedAt: latestUpdate(person),
      deleted: true,
      fields: {
        namePrefix: "",
        givenName: "",
        middleName: "",
        familyName: "",
        nameSuffix: "",
        nickname: "",
        initials: "",
        company: "",
        jobTitle: "",
        department: "",
        managerName: "",
        assistantName: "",
        groupName: "",
        birthdayYear: null,
        birthdayMonth: null,
        birthdayDay: null,
        photoUrl: "",
        notes: "",
      },
      items: [],
    };
  }

  const name = primary(person.names);
  const organization =
    person.organizations?.find((entry) => entry.current) ??
    primary(person.organizations);
  const birthday = primary(person.birthdays)?.date;
  const hasBirthdayDay =
    Number.isInteger(birthday?.month) && Number.isInteger(birthday?.day);
  const biography = primary(person.biographies);
  const photo =
    person.photos?.find((entry) => entry.metadata?.primary && !entry.default) ??
    person.photos?.find((entry) => !entry.default);
  const membership = (person.memberships ?? [])
    .map((entry) => entry.contactGroupMembership?.contactGroupResourceName)
    .find((resourceName) => resourceName && groupNames.has(resourceName));

  const phones = compact(
    (person.phoneNumbers ?? []).map((entry) =>
      item("phone", entry.value, {
        label: text(entry.type),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );
  const emails = compact(
    (person.emailAddresses ?? []).map((entry) =>
      item("email", entry.value, {
        label: text(entry.type),
        displayName: text(entry.displayName),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );
  const addresses = compact(
    (person.addresses ?? []).map((entry) =>
      item("address", entry.formattedValue, {
        label: text(entry.type),
        isPrimary: Boolean(entry.metadata?.primary),
        streetAddress: text(entry.streetAddress),
        extendedAddress: text(entry.extendedAddress),
        poBox: text(entry.poBox),
        city: text(entry.city),
        region: text(entry.region),
        postalCode: text(entry.postalCode),
        country: text(entry.country),
        countryCode: text(entry.countryCode),
      }),
    ),
  );
  const urls = compact(
    (person.urls ?? []).map((entry) =>
      item("url", entry.value, {
        label: text(entry.type),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );
  const relations = compact(
    (person.relations ?? []).map((entry) =>
      item("relation", entry.person, {
        label: text(entry.type),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );
  const events = compact(
    (person.events ?? []).map((entry) =>
      item("event", dateValue(entry.date), {
        label: text(entry.type),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );
  const ims = compact(
    (person.imClients ?? []).map((entry) =>
      item("im", entry.username, {
        label: text(entry.type) || text(entry.protocol),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );
  const userDefined = compact(
    (person.userDefined ?? []).map((entry) =>
      item("user_defined", entry.value, {
        label: text(entry.key),
        isPrimary: Boolean(entry.metadata?.primary),
      }),
    ),
  );

  return {
    externalId,
    previousExternalIds: person.metadata?.previousResourceNames ?? [],
    externalEtag: text(person.etag),
    externalUpdatedAt: latestUpdate(person),
    deleted: false,
    fields: {
      namePrefix: text(name?.honorificPrefix),
      givenName: text(name?.givenName),
      middleName: text(name?.middleName),
      familyName: text(name?.familyName),
      nameSuffix: text(name?.honorificSuffix),
      nickname: text(
        person.nicknames?.find((entry) => entry.type === "DEFAULT")?.value,
      ),
      initials: text(
        person.nicknames?.find((entry) => entry.type === "INITIALS")?.value,
      ),
      company: text(organization?.name),
      jobTitle: text(organization?.title),
      department: text(organization?.department),
      managerName: text(
        person.relations?.find((entry) => entry.type === "manager")?.person,
      ),
      assistantName: text(
        person.relations?.find((entry) => entry.type === "assistant")?.person,
      ),
      groupName: membership ? (groupNames.get(membership) ?? "") : "",
      birthdayYear: Number.isInteger(birthday?.year) ? (birthday?.year ?? null) : null,
      birthdayMonth: hasBirthdayDay ? (birthday?.month ?? null) : null,
      birthdayDay: hasBirthdayDay ? (birthday?.day ?? null) : null,
      photoUrl: text(photo?.url),
      notes: biography?.contentType === "TEXT_HTML" ? "" : text(biography?.value),
    },
    items: [
      ...phones,
      ...emails,
      ...addresses,
      ...urls,
      ...relations,
      ...events,
      ...ims,
      ...userDefined,
    ],
  };
}
