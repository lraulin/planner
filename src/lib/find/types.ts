/**
 * The vocabulary of Advanced Find: what you can search, where in a record, and what a hit
 * looks like once found.
 *
 * Two independent axes, which is how Achieve's dialog was laid out and the part of it worth
 * keeping. **Sources** say which records to consider; **field classes** say which part of a
 * record to look at. `agent-os/specs/2026-08-18-1012-advanced-find/`.
 */

/**
 * The record families a search can reach.
 *
 * `node_items`, `contact_items` and `workout_session_exercises` are deliberately **not**
 * sources. They are sub-records of a node, a contact and a session, so they belong to the
 * `outline`, `contacts` and `fitness` sources and are reached through the `subrecord` field
 * class — the same split Achieve drew, with record type on one row and Subrecords on the other.
 */
export const FIND_SOURCE_IDS = [
  "outline",
  "notes",
  "appointments",
  "contacts",
  "library",
  "metrics",
  "fitness",
  "finances",
] as const;

export type FindSourceId = (typeof FIND_SOURCE_IDS)[number];

/**
 * Which part of a record to look in.
 *
 * A reconstruction, not Achieve parity: its `Quick Fields / Text Fields / Date Fields /
 * Note Fields / Subrecords` are undocumented (see the spec's Context) and map badly onto our
 * schema. Date fields are dropped outright — ours are typed columns under
 * `product/date-model.md`, not free text, so matching a word against one means nothing.
 */
export const FIND_FIELD_CLASSES = ["name", "detail", "subrecord"] as const;

export type FindFieldClass = (typeof FIND_FIELD_CLASSES)[number];

/** What a result row is, and therefore which icon and label the Type column shows. */
export type FindResultKind =
  // Outline
  | "result_area"
  | "goal"
  | "project"
  | "task"
  | "node_item"
  // Notes, schedule, contacts
  | "note"
  | "appointment"
  | "contact"
  | "contact_item"
  // Library
  | "resource"
  | "job"
  | "residence"
  | "life_event"
  // Metrics and fitness
  | "metric"
  | "exercise"
  | "workout_session"
  // Finances
  | "transaction"
  | "finance_account"
  | "finance_payee"
  | "budget_envelope";

export type FindMatchOptions = {
  matchCase: boolean;
  wholeWord: boolean;
  /** Treat the query as a regular expression rather than literal text. */
  regex: boolean;
};

export type FindIncludeOptions = {
  /** Achieve's "Completed Items". Completed and cancelled nodes. */
  completed: boolean;
  /** Achieve's "Past Items". Shelved nodes and appointments that have already happened. */
  shelved: boolean;
};

export type FindRequest = {
  query: string;
  sources: readonly FindSourceId[];
  fieldClasses: readonly FindFieldClass[];
  match: FindMatchOptions;
  include: FindIncludeOptions;
};

/** One matching field on one record. */
export type FieldHit = {
  /** What the Field column prints — `Notes`, `Description`, `Purpose`. */
  label: string;
  fieldClass: FindFieldClass;
  /** Text around the hit, whitespace collapsed, elided at both ends. */
  snippet: string;
};

export type FindResult = {
  /** Stable grid row id. Unique across kinds, which share an id space only by accident. */
  id: string;
  kind: FindResultKind;
  /**
   * What the Type column prints. Usually `resultKindLabel(kind)`, but a sub-record says what
   * it actually is — "Objective", "Risk", "Email" — which is far more use than "Item".
   */
  typeLabel: string;
  source: FindSourceId;
  /** The record's own id. */
  recordId: string;
  /**
   * For a sub-record, the record whose drawer opens — the owning node, contact or session.
   * Null when the result *is* the openable record.
   */
  ownerId: string | null;
  /** The headline. Never empty: an unnamed record reads "(untitled)". */
  name: string;
  /** Where it lives — the ancestor path for a node, the module and page for everything else. */
  where: string;
  /** Every field that matched, name-class hits first. At least one. */
  hits: readonly FieldHit[];
};

export type FindOutcome = {
  results: readonly FindResult[];
  /** Matches found before the cap was applied. Equals `results.length` when under the cap. */
  totalMatched: number;
  /** True when `totalMatched` exceeded {@link FIND_RESULT_CAP} and results were trimmed. */
  capped: boolean;
};

/**
 * The most results we will hand a grid.
 *
 * A one-letter query against a real corpus matches nearly everything, and a grid holding
 * every row of every table is slow to render and useless to read. The cap is visible in the
 * UI ("narrow your search") rather than silent — a truncated list that does not say it is
 * truncated is the failure mode this number exists to avoid.
 */
export const FIND_RESULT_CAP = 1000;

/** Below this, a query is treated as not yet asked rather than as matching everything. */
export const FIND_MIN_QUERY_LENGTH = 2;

export const DEFAULT_MATCH_OPTIONS: FindMatchOptions = {
  matchCase: false,
  wholeWord: false,
  regex: false,
};

/** Both off, as Achieve had them: finished and shelved work is noise until you ask for it. */
export const DEFAULT_INCLUDE_OPTIONS: FindIncludeOptions = {
  completed: false,
  shelved: false,
};
