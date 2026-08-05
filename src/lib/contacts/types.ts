import type { ContactItemKind, NodeState, PriorityLetter } from "@/db/schema";

/** One repeating sub-record of a contact, as the drawer edits it. */
export type ContactItemView = {
  id: string;
  contactId: string;
  kind: ContactItemKind;
  sortKey: string;
  label: string;
  value: string;
  displayName: string;
  isPrimary: boolean;
  notes: string;
  streetAddress: string;
  extendedAddress: string;
  poBox: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  countryCode: string;
};

/**
 * One row of the Contacts grid.
 *
 * Every display string here is **derived** — `displayNameOf`, `fileAsOf`, `primaryOf` — and
 * none of it is stored. A caller that rebuilds one of these from parts will eventually
 * disagree with the drawer showing the same contact.
 */
export type ContactListRow = {
  id: string;
  displayName: string;
  /** What the list sorts by. */
  fileAs: string;
  givenName: string;
  familyName: string;
  company: string;
  jobTitle: string;
  groupName: string;
  contexts: string[];
  primaryPhone: string;
  primaryPhoneLabel: string;
  primaryEmail: string;
  primaryEmailLabel: string;
  /** City of the primary address — the one address part worth a grid column. */
  primaryCity: string;
  /** Discussion-item tasks that are neither completed nor cancelled. */
  openItemCount: number;
  updatedAt: Date;
};

/** A discussion item, which is a task with a `contactId`. */
export type DiscussionItemSummary = {
  nodeId: string;
  name: string;
  priorityLetter: PriorityLetter | null;
  priorityRank: number | null;
  state: NodeState;
  deadline: Date | null;
  contexts: string[];
  description: string;
  /** Achieve's Resolved checkbox, which is the task's state. */
  resolved: boolean;
};

/** A note filed against a contact — Achieve's Contact History. */
export type ContactHistoryEntry = {
  id: string;
  title: string;
  subject: string;
  body: string;
  noteDate: Date | null;
  updatedAt: Date;
};

/** Everything the contact drawer needs, in one payload. */
export type ContactDetail = {
  id: string;
  namePrefix: string;
  givenName: string;
  middleName: string;
  familyName: string;
  nameSuffix: string;
  nickname: string;
  initials: string;
  fileAs: string;
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
  contexts: string[];
  /** Derived, so the drawer title and the grid row always agree. */
  displayName: string;
  updatedAt: Date;
  /** Every kind, ordered by kind then sort key. */
  items: ContactItemView[];
  discussionItems: DiscussionItemSummary[];
  history: ContactHistoryEntry[];
};

/** Scalar fields a caller may write. An absent key is left alone. */
export type ContactInput = {
  namePrefix?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  nameSuffix?: string;
  nickname?: string;
  initials?: string;
  fileAs?: string;
  company?: string;
  jobTitle?: string;
  department?: string;
  managerName?: string;
  assistantName?: string;
  groupName?: string;
  birthdayYear?: number | null;
  birthdayMonth?: number | null;
  birthdayDay?: number | null;
  notes?: string;
  contexts?: string[];
};

/** Fields of one repeating sub-record. An absent key is left alone. */
export type ContactItemInput = {
  label?: string;
  value?: string;
  displayName?: string;
  isPrimary?: boolean;
  notes?: string;
  streetAddress?: string;
  extendedAddress?: string;
  poBox?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
};

/** For the Task drawer's Contact field and the Tasks grid's Contact column. */
export type ContactOption = { id: string; displayName: string };
