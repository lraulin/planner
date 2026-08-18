/**
 * What Advanced Find can look in, and what each hit is called on screen.
 *
 * One registry, the way `modules.ts` and `pages.ts` are one registry each: the Sources
 * picker, the chip bar, the Type column and the `Where` column all read from here, so none of
 * them can hold a different opinion about what the app contains.
 */

import {
  FIND_FIELD_CLASSES,
  FIND_SOURCE_IDS,
  type FindFieldClass,
  type FindResultKind,
  type FindSourceId,
} from "./types";

export type FindSource = {
  id: FindSourceId;
  label: string;
  /**
   * The module these records live in. Printed as the first segment of `Where`, so a result
   * says where to go looking even before it is opened.
   */
  moduleLabel: string;
  /** Whether the `subrecord` field class reaches anything here. */
  hasSubrecords: boolean;
};

export const FIND_SOURCES: readonly FindSource[] = [
  { id: "outline", label: "Outline", moduleLabel: "Plan", hasSubrecords: true },
  { id: "notes", label: "Notes", moduleLabel: "Notes", hasSubrecords: false },
  {
    id: "appointments",
    label: "Appointments",
    moduleLabel: "Schedule",
    hasSubrecords: false,
  },
  { id: "contacts", label: "Contacts", moduleLabel: "Library", hasSubrecords: true },
  { id: "library", label: "Library", moduleLabel: "Library", hasSubrecords: false },
  { id: "metrics", label: "Metrics", moduleLabel: "Metrics", hasSubrecords: false },
  { id: "fitness", label: "Fitness", moduleLabel: "Fitness", hasSubrecords: true },
  { id: "finances", label: "Finances", moduleLabel: "Finances", hasSubrecords: false },
];

const SOURCE_BY_ID = new Map(FIND_SOURCES.map((source) => [source.id, source]));

export function findSource(id: FindSourceId): FindSource {
  const source = SOURCE_BY_ID.get(id);
  // Unreachable while the list above covers `FindSourceId`; the exhaustiveness is the point.
  if (!source) throw new Error(`Unknown find source "${id}"`);
  return source;
}

export function sourceLabel(id: FindSourceId): string {
  return findSource(id).label;
}

/** Everything, as Achieve had every Search In box ticked. */
export const DEFAULT_SOURCES: readonly FindSourceId[] = FIND_SOURCE_IDS;

/** Every field class, likewise. Narrowing is something you choose, not something you start in. */
export const DEFAULT_FIELD_CLASSES: readonly FindFieldClass[] = FIND_FIELD_CLASSES;

/** What the Type column prints. Singular, capitalised, the word the rest of the app uses. */
export const RESULT_KIND_LABELS: Record<FindResultKind, string> = {
  result_area: "Result Area",
  goal: "Goal",
  project: "Project",
  task: "Task",
  node_item: "Item",
  note: "Note",
  appointment: "Appointment",
  contact: "Contact",
  contact_item: "Contact detail",
  resource: "Resource",
  job: "Job",
  residence: "Residence",
  life_event: "Life event",
  metric: "Metric",
  exercise: "Exercise",
  workout_session: "Workout",
  transaction: "Transaction",
  finance_account: "Account",
  recurring_bill: "Bill",
  recurring_spend: "Recurring spend",
};

export function resultKindLabel(kind: FindResultKind): string {
  return RESULT_KIND_LABELS[kind];
}

export const FIELD_CLASS_LABELS: Record<FindFieldClass, string> = {
  name: "Names & titles",
  detail: "Detail text",
  subrecord: "Sub-records",
};

/**
 * Drop anything that is not a live source id, preserving registry order.
 *
 * Reached from stored settings and from a hand-edited URL, so it must degrade rather than
 * throw — a source removed in a later release must not make a saved preference unreadable.
 * An empty result means "search nothing", which the caller treats as "search everything";
 * see `normalizeFieldClasses` for the same rule one axis over.
 */
export function normalizeSources(values: readonly unknown[]): FindSourceId[] {
  const wanted = new Set(values);
  return FIND_SOURCE_IDS.filter((id) => wanted.has(id));
}

export function normalizeFieldClasses(values: readonly unknown[]): FindFieldClass[] {
  const wanted = new Set(values);
  return FIND_FIELD_CLASSES.filter((id) => wanted.has(id));
}
