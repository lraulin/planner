import type { NodeItem, NodeItemKind } from "@/db/schema";

/**
 * What each repeating list inside a detail form is made of.
 *
 * Achieve gives every one of these its own grid and its own editor dialog, but they share a
 * shape: an ordered list of priority + title + description rows, differing only in a handful
 * of extra columns. That is why they share one `node_items` table — and this file is what
 * makes one component able to render all fourteen.
 *
 * `columns` is what the list shows at a glance; `fields` is what its expanded editor offers.
 * A column is always also a field, since anything worth summarising is worth editing.
 */

/** Which editor control a field gets. The list renderer maps these onto `fields.tsx`. */
export type ItemFieldKind =
  "text" | "textarea" | "priority" | "number" | "select" | "check";

/** The editable columns a list row can draw on. */
export type ItemColumnKey =
  | "priority"
  | Extract<
      keyof NodeItem,
      | "title"
      | "description"
      | "criteria"
      | "stakeholders"
      | "itemType"
      | "stake"
      | "severity"
      | "probability"
      | "detection"
      | "prevention"
      | "mitigation"
      | "advantages"
      | "disadvantages"
      | "decision"
      | "idealCandidate"
      | "candidates"
      | "filled"
      | "filledBy"
      | "association"
      | "contact"
      | "source"
      | "resolution"
      | "resolved"
      | "url"
    >;

export type ItemField = {
  /** A column of `node_items`. `priority` covers the letter and rank pair together. */
  key: ItemColumnKey;
  label: string;
  kind: ItemFieldKind;
  /** For `select`. */
  options?: readonly string[];
  /** For `number`. */
  min?: number;
  max?: number;
  /** Rows for a `textarea`. */
  rows?: number;
};

export type ItemKindConfig = {
  /** Plural, for the section heading. */
  title: string;
  /** Singular, for the add button and the delete confirmation. */
  singular: string;
  /** Shown when the list is empty. */
  empty: string;
  /** Summary columns, left to right. */
  columns: ItemColumnKey[];
  /** Everything the expanded editor offers, in order. */
  fields: ItemField[];
};

const PRIORITY_FIELD: ItemField = {
  key: "priority",
  label: "Priority",
  kind: "priority",
};
const TITLE_FIELD: ItemField = { key: "title", label: "Title", kind: "text" };
const DESCRIPTION_FIELD: ItemField = {
  key: "description",
  label: "Description",
  kind: "textarea",
  rows: 3,
};

export const STAKEHOLDER_TYPES = [
  "Owner",
  "Sponsor",
  "Customer",
  "Supplier",
  "Indirect",
  "Investor",
  "Other",
] as const;

export const ROLE_TYPES = [
  "Worker",
  "Mentor",
  "Partner",
  "Support",
  "Talent",
  "Other",
] as const;

export const ITEM_KINDS: Record<NodeItemKind, ItemKindConfig> = {
  objective: {
    title: "Objectives",
    singular: "objective",
    empty: "What has to be true for this project to count as done?",
    columns: ["priority", "title", "description"],
    fields: [
      PRIORITY_FIELD,
      TITLE_FIELD,
      DESCRIPTION_FIELD,
      { key: "criteria", label: "Criteria", kind: "textarea", rows: 3 },
      { key: "stakeholders", label: "Stakeholders", kind: "text" },
    ],
  },

  constraint: {
    title: "Priorities / Constraints",
    singular: "constraint",
    empty: "What must this project respect — budget, quality, a fixed date?",
    columns: ["priority", "title", "description"],
    fields: [PRIORITY_FIELD, TITLE_FIELD, DESCRIPTION_FIELD],
  },

  strategy: {
    title: "Candidate Strategies",
    singular: "strategy",
    empty: "What are the different ways this could be approached?",
    columns: ["priority", "title", "decision"],
    fields: [
      PRIORITY_FIELD,
      TITLE_FIELD,
      DESCRIPTION_FIELD,
      { key: "advantages", label: "Advantages", kind: "textarea", rows: 3 },
      { key: "disadvantages", label: "Disadvantages", kind: "textarea", rows: 3 },
      { key: "decision", label: "Decision", kind: "textarea", rows: 2 },
    ],
  },

  stakeholder: {
    title: "Stakeholders",
    singular: "stakeholder",
    empty: "Who cares how this turns out?",
    columns: ["priority", "title", "itemType"],
    fields: [
      PRIORITY_FIELD,
      TITLE_FIELD,
      { key: "itemType", label: "Type", kind: "select", options: STAKEHOLDER_TYPES },
      DESCRIPTION_FIELD,
      { key: "stake", label: "Stake", kind: "textarea", rows: 2 },
    ],
  },

  risk: {
    title: "Risks",
    singular: "risk",
    empty: "What could go wrong?",
    columns: ["priority", "title", "severity", "probability"],
    fields: [
      PRIORITY_FIELD,
      TITLE_FIELD,
      { key: "severity", label: "Severity", kind: "number", min: 0, max: 10 },
      { key: "probability", label: "Probability", kind: "number", min: 0, max: 100 },
      DESCRIPTION_FIELD,
      { key: "detection", label: "Detection", kind: "textarea", rows: 2 },
      { key: "prevention", label: "Prevention", kind: "textarea", rows: 2 },
      { key: "mitigation", label: "Mitigation", kind: "textarea", rows: 2 },
    ],
  },

  role: {
    title: "Roles",
    singular: "role",
    empty: "Who needs to be involved, and in what capacity?",
    columns: ["priority", "title", "itemType", "filled"],
    fields: [
      PRIORITY_FIELD,
      TITLE_FIELD,
      { key: "itemType", label: "Type", kind: "select", options: ROLE_TYPES },
      DESCRIPTION_FIELD,
      { key: "idealCandidate", label: "Ideal candidate", kind: "textarea", rows: 2 },
      { key: "candidates", label: "Candidates", kind: "text" },
      { key: "filled", label: "Role filled", kind: "check" },
      { key: "filledBy", label: "Filled by", kind: "text" },
    ],
  },

  contact: {
    title: "Contacts",
    singular: "contact",
    empty: "Who do you need to be able to reach?",
    columns: ["title", "association", "contact"],
    fields: [
      { key: "title", label: "Name", kind: "text" },
      { key: "association", label: "Association", kind: "textarea", rows: 2 },
      { key: "contact", label: "Contact details", kind: "text" },
    ],
  },

  issue: {
    title: "Issues",
    singular: "issue",
    empty: "What is currently in the way?",
    columns: ["priority", "title", "resolved"],
    fields: [
      PRIORITY_FIELD,
      { key: "title", label: "Summary", kind: "text" },
      { key: "source", label: "Source", kind: "text" },
      DESCRIPTION_FIELD,
      { key: "resolution", label: "Resolution", kind: "textarea", rows: 2 },
      { key: "resolved", label: "Resolved", kind: "check" },
    ],
  },

  attachment: {
    title: "Attachments",
    singular: "attachment",
    empty: "Links to documents, folders, or pages this project depends on.",
    columns: ["priority", "title", "url"],
    fields: [
      PRIORITY_FIELD,
      { key: "title", label: "Name", kind: "text" },
      { key: "url", label: "URL", kind: "text" },
      DESCRIPTION_FIELD,
    ],
  },

  guiding_principle: {
    title: "Guiding Principles",
    singular: "principle",
    empty: "The rules you want to hold to in this area, whatever else changes.",
    columns: ["priority", "title", "description"],
    fields: [PRIORITY_FIELD, TITLE_FIELD, DESCRIPTION_FIELD],
  },

  wish_want_dont_have: {
    title: "Want and Don't Have",
    singular: "entry",
    empty: "What do you want here that you don't have yet?",
    columns: ["priority", "title"],
    fields: [PRIORITY_FIELD, TITLE_FIELD, DESCRIPTION_FIELD],
  },

  wish_dont_want_have: {
    title: "Don't Want and Have",
    singular: "entry",
    empty: "What is in your life here that you would rather not have?",
    columns: ["priority", "title"],
    fields: [PRIORITY_FIELD, TITLE_FIELD, DESCRIPTION_FIELD],
  },

  wish_want_have: {
    title: "Want and Have",
    singular: "entry",
    empty: "What do you already have here that you want to keep?",
    columns: ["priority", "title"],
    fields: [PRIORITY_FIELD, TITLE_FIELD, DESCRIPTION_FIELD],
  },

  wish_want_avoid: {
    title: "Want to Avoid",
    singular: "entry",
    empty: "What do you want to keep out of this area?",
    columns: ["priority", "title"],
    fields: [PRIORITY_FIELD, TITLE_FIELD, DESCRIPTION_FIELD],
  },
};

/**
 * Column header text for a list.
 *
 * A kind's own field label wins where it has one, so Contacts head their title column
 * "Name" and Issues head theirs "Summary" — the same column, named the way Achieve names
 * it in each form. `COLUMN_LABELS` is the fallback.
 */
export function columnLabel(config: ItemKindConfig, key: ItemColumnKey): string {
  const field = config.fields.find((f) => f.key === key);
  if (field && key !== "priority") return field.label;
  return COLUMN_LABELS[key];
}

/** Default column header text, used where a kind does not name the field itself. */
export const COLUMN_LABELS: Record<ItemColumnKey, string> = {
  priority: "Pri",
  title: "Title",
  description: "Description",
  criteria: "Criteria",
  stakeholders: "Stakeholders",
  itemType: "Type",
  stake: "Stake",
  severity: "Sev",
  probability: "Prob",
  detection: "Detection",
  prevention: "Prevention",
  mitigation: "Mitigation",
  advantages: "Advantages",
  disadvantages: "Disadvantages",
  decision: "Decision",
  idealCandidate: "Ideal candidate",
  candidates: "Candidates",
  filled: "Filled",
  filledBy: "Filled by",
  association: "Association",
  contact: "Contact",
  source: "Source",
  resolution: "Resolution",
  resolved: "Resolved",
  url: "URL",
};
