/**
 * The pure half of Advanced Find: loaded rows in, ranked results out.
 *
 * Every per-entity decision lives here — which fields each record exposes, what each is
 * called, and where the record says it lives. `queries.ts` knows only how to read the rows;
 * this module knows what they mean. No database, so the interesting reasoning is testable
 * without one (`development/testing.md`).
 *
 * **One result per record, not per matching field.** Achieve's dialog lists a record once per
 * hit, so a note matching in both its subject and its body appears twice. We collapse that:
 * `hits` names every field that matched, and the record occupies one row. Recorded as a
 * deliberate divergence in the spec.
 */

import { CONTACT_ITEM_KINDS } from "@/lib/contacts/itemKinds";
import { ITEM_KINDS } from "@/lib/detail/itemKinds";
import { toDateKey } from "@/lib/schedule/geometry";
import { shelfHolds } from "@/lib/tree/shelving";
import type { OutlineNode } from "@/lib/tree/types";
import { snippet, type Matcher } from "./matcher";
import type { FindCorpus } from "./queries";
import { resultKindLabel } from "./sources";
import {
  FIND_RESULT_CAP,
  type FieldHit,
  type FindFieldClass,
  type FindIncludeOptions,
  type FindOutcome,
  type FindResult,
  type FindResultKind,
  type FindSourceId,
} from "./types";

/** One searchable field of one record, before anything has been matched against it. */
type Field = {
  label: string;
  fieldClass: FindFieldClass;
  value: string | null | undefined;
};

const UNTITLED = "(untitled)";
const SEP = " ▸ ";

function name(label: string, value: string | null | undefined): Field {
  return { label, fieldClass: "name", value };
}

function detail(label: string, value: string | null | undefined): Field {
  return { label, fieldClass: "detail", value };
}

function sub(label: string, value: string | null | undefined): Field {
  return { label, fieldClass: "subrecord", value };
}

/** A tag list reads as one field — `@errands @phone` — so a hit prints as the user wrote it. */
function contexts(values: string[] | null | undefined): Field {
  return detail("Contexts", values?.length ? values.join(" ") : "");
}

function firstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value && value.trim()) return value;
  }
  return UNTITLED;
}

/**
 * The fields that matched, in field order.
 *
 * Order matters twice over: the Field column reads left to right, and the Match column shows
 * the first hit's snippet — so a record whose name matched should show the name, not whatever
 * detail field happened to be declared first.
 */
function hitsFor(
  fields: readonly Field[],
  match: Matcher,
  classes: ReadonlySet<FindFieldClass>,
): FieldHit[] {
  const hits: FieldHit[] = [];
  for (const field of fields) {
    if (!classes.has(field.fieldClass)) continue;
    if (!field.value) continue;
    const span = match(field.value);
    if (!span) continue;
    hits.push({
      label: field.label,
      fieldClass: field.fieldClass,
      snippet: snippet(field.value, span),
    });
  }
  return hits;
}

/**
 * The ancestor names above a node, root first.
 *
 * Built from `parentId` rather than from `depth`, and defended against a cycle: a corrupt
 * parent chain would otherwise spin forever inside a search that has no timeout.
 */
function ancestorPath(
  node: OutlineNode,
  byId: ReadonlyMap<string, OutlineNode>,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name || UNTITLED);
    parentId = parent.parentId;
  }
  return names;
}

const SETTLED_STATES = new Set(["completed", "cancelled"]);

/**
 * Whether a node is filtered out by the include toggles.
 *
 * Result Areas carry no state at all (`2026-08-09-0915-result-areas-without-state`), so the
 * Completed toggle cannot hide one — `state === null` falls through both branches, which is
 * the behaviour and not an oversight.
 */
function nodeExcluded(
  node: OutlineNode,
  include: FindIncludeOptions,
  today: string | null,
): boolean {
  if (!include.completed && node.state && SETTLED_STATES.has(node.state)) return true;
  if (!include.shelved && shelfHolds(node.shelf, today)) return true;
  return false;
}

type ResultSeed = {
  kind: FindResultKind;
  typeLabel?: string;
  source: FindSourceId;
  recordId: string;
  ownerId?: string | null;
  name: string;
  where: string;
  fields: readonly Field[];
};

/**
 * Walk the corpus once per source, matching and collecting.
 *
 * Results are ordered by how good the hit is, then by source, so the cap keeps the ones worth
 * keeping: a name match on a project outranks a body match buried in an imported journal.
 */
export function searchCorpus(
  corpus: FindCorpus,
  match: Matcher,
  options: {
    sources: readonly FindSourceId[];
    fieldClasses: readonly FindFieldClass[];
    include: FindIncludeOptions;
    /** The reader's local day, for shelf expiry. Null never expires a shelf. */
    today: string | null;
  },
): FindOutcome {
  const wanted = new Set(options.sources);
  const classes = new Set(options.fieldClasses);
  const { include, today } = options;

  const seeds: ResultSeed[] = [];

  if (wanted.has("outline")) {
    const byId = new Map(corpus.outline.map((node) => [node.id, node]));
    const excluded = new Set<string>();
    const detailsByNode = new Map<string, Field[]>();

    for (const field of corpus.outlineDetails) {
      const list = detailsByNode.get(field.nodeId);
      const entry = detail(field.label, field.value);
      if (list) list.push(entry);
      else detailsByNode.set(field.nodeId, [entry]);
    }

    for (const node of corpus.outline) {
      if (nodeExcluded(node, include, today)) {
        excluded.add(node.id);
        continue;
      }
      seeds.push({
        kind: node.type,
        source: "outline",
        recordId: node.id,
        name: node.name || UNTITLED,
        where: ["Plan", ...ancestorPath(node, byId)].join(SEP),
        fields: [
          name("Name", node.name),
          detail("Notes", node.notes),
          contexts(node.contexts),
          ...(detailsByNode.get(node.id) ?? []),
        ],
      });
    }

    for (const item of corpus.nodeItems) {
      // A sub-record of a hidden node is hidden with it. Otherwise unticking Completed would
      // still surface the objectives of a finished project.
      if (excluded.has(item.nodeId)) continue;
      // `kind` is a database enum, so the registry always has a config for it.
      const config = ITEM_KINDS[item.kind];
      const owner = byId.get(item.nodeId);
      seeds.push({
        kind: "node_item",
        typeLabel: capitalize(config.singular),
        source: "outline",
        recordId: item.id,
        ownerId: item.nodeId,
        name: firstNonEmpty(item.title, item.description),
        where: [
          "Plan",
          ...(owner ? ancestorPath(owner, byId) : []),
          item.ownerName || UNTITLED,
          config.title,
        ].join(SEP),
        // Every field of a sub-record is sub-record text, its title included. The class says
        // "look inside child lists at all", which is the question Achieve's checkbox asked.
        fields: [
          sub("Title", item.title),
          sub("Description", item.description),
          sub("Criteria", item.criteria),
          sub("Stakeholders", item.stakeholders),
          sub("Stake", item.stake),
          sub("Detection", item.detection),
          sub("Prevention", item.prevention),
          sub("Mitigation", item.mitigation),
          sub("Advantages", item.advantages),
          sub("Disadvantages", item.disadvantages),
          sub("Decision", item.decision),
          sub("Ideal candidate", item.idealCandidate),
          sub("Candidates", item.candidates),
          sub("Filled by", item.filledBy),
          sub("Association", item.association),
          sub("Contact", item.contact),
          sub("Source", item.source),
          sub("Resolution", item.resolution),
          sub("URL", item.url),
          sub("Purpose", item.purpose),
          sub("Strategy", item.strategy),
          sub("People", item.people),
          sub("Conditions", item.conditions),
          sub("Reason", item.reason),
          sub("Category", item.category),
          sub("Question", item.question),
          sub("Target", item.target),
          sub("Assigned to", item.assignedTo),
          sub("Comments", item.comments),
        ],
      });
    }
  }

  if (wanted.has("notes")) {
    for (const note of corpus.notes) {
      seeds.push({
        kind: "note",
        source: "notes",
        recordId: note.id,
        name: firstNonEmpty(note.title),
        where: note.subject ? ["Notes", note.subject].join(SEP) : "Notes",
        fields: [
          name("Title", note.title),
          detail("Subject", note.subject),
          detail("Body", note.body),
          contexts(note.contexts),
        ],
      });
    }
  }

  if (wanted.has("appointments")) {
    for (const appointment of corpus.appointments) {
      const day = toDateKey(appointment.startAt);
      if (!include.shelved && today && day < today) continue;
      seeds.push({
        kind: "appointment",
        source: "appointments",
        recordId: appointment.id,
        name: firstNonEmpty(appointment.subject),
        where: ["Schedule", day].join(SEP),
        fields: [
          name("Subject", appointment.subject),
          detail("Location", appointment.location),
          detail("Notes", appointment.notes),
          contexts(appointment.contexts),
        ],
      });
    }
  }

  if (wanted.has("contacts")) {
    for (const contact of corpus.contacts) {
      seeds.push({
        kind: "contact",
        source: "contacts",
        recordId: contact.id,
        name: firstNonEmpty(
          contact.fileAs,
          `${contact.givenName} ${contact.familyName}`.trim(),
          contact.company,
        ),
        where: ["Library", "Contacts"].join(SEP),
        fields: [
          name("Name", contact.fileAs),
          name("Given name", contact.givenName),
          name("Family name", contact.familyName),
          name("Nickname", contact.nickname),
          detail("Company", contact.company),
          detail("Job title", contact.jobTitle),
          detail("Department", contact.department),
          detail("Manager", contact.managerName),
          detail("Assistant", contact.assistantName),
          detail("Group", contact.groupName),
          detail("Notes", contact.notes),
          contexts(contact.contexts),
        ],
      });
    }

    for (const item of corpus.contactItems) {
      const config = CONTACT_ITEM_KINDS[item.kind];
      seeds.push({
        kind: "contact_item",
        typeLabel: capitalize(config.singular),
        source: "contacts",
        recordId: item.id,
        ownerId: item.contactId,
        name: firstNonEmpty(item.displayName, item.value, item.label),
        where: ["Library", "Contacts", item.ownerName || UNTITLED].join(SEP),
        fields: [
          sub("Value", item.value),
          sub("Label", item.label),
          sub("Display name", item.displayName),
          sub("Notes", item.notes),
          sub("Street", item.streetAddress),
          sub("Address line 2", item.extendedAddress),
          sub("City", item.city),
          sub("Region", item.region),
          sub("Postal code", item.postalCode),
          sub("Country", item.country),
        ],
      });
    }
  }

  if (wanted.has("library")) {
    for (const resource of corpus.resources) {
      seeds.push({
        kind: "resource",
        source: "library",
        recordId: resource.id,
        name: firstNonEmpty(resource.shortName),
        where: ["Library", "Resources"].join(SEP),
        fields: [
          name("Short name", resource.shortName),
          detail("Description", resource.description),
        ],
      });
    }

    for (const job of corpus.jobs) {
      seeds.push({
        kind: "job",
        source: "library",
        recordId: job.id,
        name: firstNonEmpty(job.employer, job.jobTitle),
        where: ["Library", "Jobs"].join(SEP),
        fields: [
          name("Employer", job.employer),
          name("Job title", job.jobTitle),
          detail("Employment type", job.employmentType),
          detail("Duties", job.duties),
          detail("Reason for leaving", job.reasonForLeaving),
          detail("Supervisor", job.supervisorName),
          detail("Supervisor title", job.supervisorTitle),
          detail("City", job.city),
          detail("Region", job.region),
          detail("Notes", job.notes),
        ],
      });
    }

    for (const residence of corpus.residences) {
      seeds.push({
        kind: "residence",
        source: "library",
        recordId: residence.id,
        name: firstNonEmpty(residence.label, residence.streetAddress, residence.city),
        where: ["Library", "Residences"].join(SEP),
        fields: [
          name("Label", residence.label),
          name("Street", residence.streetAddress),
          detail("City", residence.city),
          detail("Region", residence.region),
          detail("Housing type", residence.housingType),
          detail("Reason for leaving", residence.reasonForLeaving),
          detail("Landlord", residence.landlordName),
          detail("Notes", residence.notes),
        ],
      });
    }

    for (const event of corpus.lifeEvents) {
      seeds.push({
        kind: "life_event",
        source: "library",
        recordId: event.id,
        name: firstNonEmpty(event.title),
        where: ["Library", "Timeline", event.eventDate].join(SEP),
        fields: [
          name("Title", event.title),
          detail("Category", event.category),
          detail("Notes", event.notes),
        ],
      });
    }
  }

  if (wanted.has("metrics")) {
    for (const metric of corpus.metrics) {
      seeds.push({
        kind: "metric",
        source: "metrics",
        recordId: metric.id,
        name: firstNonEmpty(metric.title),
        where: "Metrics",
        fields: [
          name("Title", metric.title),
          detail("Category", metric.category),
          detail("Question", metric.question),
          detail("Description", metric.description),
          detail("Reason", metric.reason),
          detail("Units", metric.units),
        ],
      });
    }
  }

  if (wanted.has("fitness")) {
    for (const exercise of corpus.exercises) {
      seeds.push({
        kind: "exercise",
        source: "fitness",
        recordId: exercise.id,
        name: firstNonEmpty(exercise.name),
        where: ["Fitness", "Exercises"].join(SEP),
        fields: [name("Name", exercise.name), detail("Notes", exercise.notes)],
      });
    }

    for (const session of corpus.workoutSessions) {
      const day = toDateKey(session.performedAt);
      seeds.push({
        kind: "workout_session",
        source: "fitness",
        recordId: session.id,
        name: firstNonEmpty(session.title, day),
        where: ["Fitness", "Sessions", day].join(SEP),
        fields: [name("Title", session.title), detail("Notes", session.notes)],
      });
    }

    for (const entry of corpus.sessionExercises) {
      seeds.push({
        kind: "workout_session",
        typeLabel: "Session exercise",
        source: "fitness",
        recordId: entry.id,
        ownerId: entry.sessionId,
        name: firstNonEmpty(entry.exerciseName),
        where: ["Fitness", "Sessions", firstNonEmpty(entry.sessionTitle)].join(SEP),
        fields: [sub("Notes", entry.notes)],
      });
    }
  }

  if (wanted.has("finances")) {
    for (const transaction of corpus.transactions) {
      seeds.push({
        kind: "transaction",
        source: "finances",
        recordId: transaction.id,
        name: firstNonEmpty(transaction.description),
        where: ["Finances", transaction.accountName, transaction.transactionDate].join(
          SEP,
        ),
        fields: [
          name("Description", transaction.description),
          detail("Notes", transaction.notes),
          detail("Category", transaction.category),
          detail("Source category", transaction.sourceCategory),
          detail("Derived category", transaction.derivedCategory),
          detail("Event", transaction.eventLabel),
        ],
      });
    }

    for (const account of corpus.financeAccounts) {
      seeds.push({
        kind: "finance_account",
        source: "finances",
        recordId: account.id,
        name: firstNonEmpty(account.name),
        where: ["Finances", "Accounts"].join(SEP),
        fields: [
          name("Name", account.name),
          detail("Institution", account.institution),
          detail("URL", account.url),
        ],
      });
    }

    for (const bill of corpus.recurringBills) {
      seeds.push({
        kind: "recurring_bill",
        source: "finances",
        recordId: bill.id,
        name: firstNonEmpty(bill.name),
        where: ["Finances", "Commitments"].join(SEP),
        fields: [
          name("Name", bill.name),
          detail("Notes", bill.notes),
          detail("URL", bill.url),
          detail("Matchers", bill.matchers.join(" ")),
        ],
      });
    }

    for (const spend of corpus.recurringSpend) {
      seeds.push({
        kind: "recurring_spend",
        source: "finances",
        recordId: spend.id,
        name: firstNonEmpty(spend.name),
        where: ["Finances", "Commitments"].join(SEP),
        fields: [
          name("Name", spend.name),
          detail("Notes", spend.notes),
          detail("Matchers", spend.matchers.join(" ")),
        ],
      });
    }
  }

  const matched: FindResult[] = [];
  for (const seed of seeds) {
    const hits = hitsFor(seed.fields, match, classes);
    if (hits.length === 0) continue;
    matched.push({
      id: `${seed.kind}:${seed.recordId}`,
      kind: seed.kind,
      typeLabel: seed.typeLabel ?? resultKindLabel(seed.kind),
      source: seed.source,
      recordId: seed.recordId,
      ownerId: seed.ownerId ?? null,
      name: seed.name,
      where: seed.where,
      hits,
    });
  }

  matched.sort(compareResults);

  return {
    results: matched.slice(0, FIND_RESULT_CAP),
    totalMatched: matched.length,
    capped: matched.length > FIND_RESULT_CAP,
  };
}

const CLASS_RANK: Record<FindFieldClass, number> = { name: 0, detail: 1, subrecord: 2 };

/**
 * Best hit first, so the cap trims the least useful end of the list.
 *
 * A hit on a record's name beats one buried in prose, whatever the record is: searching a
 * project's name should not be outranked by the same word appearing in an imported journal
 * entry. Ties fall back to the name so the order is stable between identical searches.
 */
function compareResults(a: FindResult, b: FindResult): number {
  const rank = CLASS_RANK[a.hits[0].fieldClass] - CLASS_RANK[b.hits[0].fieldClass];
  if (rank !== 0) return rank;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
