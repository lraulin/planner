import type { ContactItemKind } from "@/db/schema";

/**
 * What each repeating list on a contact is called, and which of `contact_items`' columns it
 * actually uses.
 *
 * The same idea as `src/lib/detail/itemKinds.ts` — one config record driving one
 * renderer — but for a different table, and pure so it can be tested without a DOM. The
 * editor (`ContactItemList`) reads `fields`; the collapsed summary line reads `summary`.
 */

/** Every column of `contact_items` a list can show or edit. */
export type ContactItemField =
  | "label"
  | "value"
  | "displayName"
  | "notes"
  | "streetAddress"
  | "extendedAddress"
  | "poBox"
  | "city"
  | "region"
  | "postalCode"
  | "country"
  | "countryCode";

export type ContactItemFieldKind = "text" | "textarea";

export type ContactItemFieldConfig = {
  key: ContactItemField;
  label: string;
  kind: ContactItemFieldKind;
  /** Suggestions for a combobox. The user may type anything — People allows custom types. */
  options?: string[];
  placeholder?: string;
  /** Fraction of the editor row this field takes. Defaults to a full row. */
  span?: "half" | "third" | "full";
};

export type ContactItemKindConfig = {
  title: string;
  singular: string;
  /** Shown in place of an empty list. A question, matching the node-item lists' tone. */
  empty: string;
  /**
   * Fields shown on the collapsed summary row, left to right. Always a subset of `fields`,
   * which the test enforces — a column with no editor is a value you can see and not fix.
   */
  summary: ContactItemField[];
  fields: ContactItemFieldConfig[];
  /** Whether this kind offers a "primary" choice. Every rendered one does. */
  hasPrimary: boolean;
  /** Kinds seeded in the enum for a future Google sync but not editable yet. */
  rendered: boolean;
};

/**
 * People's `type` suggestions. Not an enum anywhere: People accepts custom types and
 * returns them verbatim, so these are a starting point rather than a constraint.
 */
const PHONE_LABELS = [
  "mobile",
  "home",
  "work",
  "main",
  "workFax",
  "homeFax",
  "pager",
  "other",
];
const EMAIL_LABELS = ["home", "work", "other"];
const ADDRESS_LABELS = ["home", "work", "other"];
const URL_LABELS = ["homePage", "blog", "profile", "work", "ftp", "other"];

const NOTES_FIELD: ContactItemFieldConfig = {
  key: "notes",
  label: "Notes",
  kind: "textarea",
  placeholder: "Local only — never sent to Google.",
  span: "full",
};

export const CONTACT_ITEM_KINDS: Record<ContactItemKind, ContactItemKindConfig> = {
  phone: {
    title: "Phone Numbers",
    singular: "phone number",
    empty: "How do you call this person?",
    summary: ["label", "value", "notes"],
    fields: [
      {
        key: "label",
        label: "Type",
        kind: "text",
        options: PHONE_LABELS,
        placeholder: "mobile",
        span: "third",
      },
      {
        key: "value",
        label: "Number",
        kind: "text",
        placeholder: "+1 555 0100",
        span: "half",
      },
      NOTES_FIELD,
    ],
    hasPrimary: true,
    rendered: true,
  },

  email: {
    title: "E-mail",
    singular: "e-mail address",
    empty: "Where do you write to this person?",
    summary: ["label", "value", "displayName", "notes"],
    fields: [
      {
        key: "label",
        label: "Type",
        kind: "text",
        options: EMAIL_LABELS,
        placeholder: "home",
        span: "third",
      },
      {
        key: "value",
        label: "Address",
        kind: "text",
        placeholder: "name@example.com",
        span: "half",
      },
      // Achieve's "Display As" — the name a mail client shows beside the address.
      { key: "displayName", label: "Display as", kind: "text", span: "half" },
      NOTES_FIELD,
    ],
    hasPrimary: true,
    rendered: true,
  },

  address: {
    title: "Addresses",
    singular: "address",
    empty: "Where is this person?",
    summary: ["label", "city", "region", "notes"],
    fields: [
      {
        key: "label",
        label: "Type",
        kind: "text",
        options: ADDRESS_LABELS,
        placeholder: "home",
        span: "third",
      },
      { key: "streetAddress", label: "Street", kind: "text", span: "full" },
      { key: "extendedAddress", label: "Apt / Suite", kind: "text", span: "half" },
      { key: "poBox", label: "PO Box", kind: "text", span: "half" },
      { key: "city", label: "City", kind: "text", span: "half" },
      { key: "region", label: "State / Region", kind: "text", span: "half" },
      { key: "postalCode", label: "Postal code", kind: "text", span: "third" },
      { key: "country", label: "Country", kind: "text", span: "half" },
      NOTES_FIELD,
    ],
    hasPrimary: true,
    rendered: true,
  },

  url: {
    title: "Web URLs",
    singular: "link",
    empty: "Anything of theirs worth keeping a link to?",
    summary: ["label", "value", "notes"],
    fields: [
      {
        key: "label",
        label: "Name",
        kind: "text",
        options: URL_LABELS,
        placeholder: "homePage",
        span: "third",
      },
      {
        key: "value",
        label: "Web address",
        kind: "text",
        placeholder: "https://",
        span: "half",
      },
      NOTES_FIELD,
    ],
    hasPrimary: true,
    rendered: true,
  },

  // ── Seeded for a future Google People sync; nothing renders these yet. They exist as enum
  // values so landing `relations`, `events`, `imClients` and `userDefined` later needs no
  // ALTER TYPE on a live enum — a statement that fails on Neon's transaction-mode pooler.
  relation: {
    title: "Relations",
    singular: "relation",
    empty: "",
    summary: ["label", "value"],
    fields: [
      { key: "label", label: "Relation", kind: "text", span: "third" },
      { key: "value", label: "Person", kind: "text", span: "half" },
    ],
    hasPrimary: false,
    rendered: false,
  },

  event: {
    title: "Dates",
    singular: "date",
    empty: "",
    summary: ["label", "value"],
    fields: [
      { key: "label", label: "Occasion", kind: "text", span: "third" },
      { key: "value", label: "Date", kind: "text", span: "half" },
    ],
    hasPrimary: false,
    rendered: false,
  },

  im: {
    title: "Instant Messaging",
    singular: "account",
    empty: "",
    summary: ["label", "value"],
    fields: [
      { key: "label", label: "Service", kind: "text", span: "third" },
      { key: "value", label: "Handle", kind: "text", span: "half" },
    ],
    hasPrimary: false,
    rendered: false,
  },

  user_defined: {
    title: "Custom Fields",
    singular: "field",
    empty: "",
    summary: ["label", "value"],
    fields: [
      { key: "label", label: "Name", kind: "text", span: "third" },
      { key: "value", label: "Value", kind: "text", span: "half" },
    ],
    hasPrimary: false,
    rendered: false,
  },
};

/** The kinds a contact drawer actually shows, in the order Achieve's tabs show them. */
export const RENDERED_CONTACT_ITEM_KINDS = (
  ["phone", "email", "address", "url"] as const
).filter((kind) => CONTACT_ITEM_KINDS[kind].rendered);

/** The kinds the Contacts grid needs loaded to fill its primary phone/email/city columns. */
export const GRID_CONTACT_ITEM_KINDS = ["phone", "email", "address"] as const;

/**
 * A one-line rendering of an item, for a collapsed summary row or a compact phone card.
 * An address is its parts rather than its stored `formattedValue`, which is output-only in
 * People and therefore blank on anything we created ourselves.
 */
export function summarizeContactItem(
  kind: ContactItemKind,
  item: {
    value: string;
    streetAddress: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  },
): string {
  if (kind !== "address") return item.value.trim();

  const cityLine = [item.city, item.region]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
  return [item.streetAddress, cityLine, item.postalCode, item.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
