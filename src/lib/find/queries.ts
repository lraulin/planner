/**
 * Everything Advanced Find searches, loaded once per Find.
 *
 * **Why load-then-filter rather than pushing the match into SQL.** The matcher supports match
 * case, whole word and a user-supplied regex; expressing all three in SQL would mean a second
 * implementation of the one rule that decides what "matches" means, and the two would drift.
 * `src/lib/agent/search.ts` already takes this posture for the outline and says why: a personal
 * corpus is small enough, and a pure filter is testable without Postgres.
 *
 * `finance_transactions` is the one table with no natural ceiling. If Find gets slow, the fix
 * is an `ILIKE` **prefilter** for the non-regex case — a superset that narrows I/O while the JS
 * matcher stays the sole authority on what matched. That is a delta, not a hidden second rule.
 *
 * Only the requested sources are read: an unticked source costs nothing, and unticking
 * Sub-records skips the three child-list reads.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  contactItems,
  contacts,
  exercises,
  financeAccounts,
  financeBudgetCategories,
  financePayeeAliases,
  financePayees,
  financeTransactions,
  goalDetails,
  jobs,
  lifeEvents,
  metrics,
  nodeItems,
  nodes,
  notes,
  projectDetails,
  residences,
  resources,
  resultAreaDetails,
  taskDetails,
  workoutSessionExercises,
  workoutSessions,
} from "@/db/schema";
import type { ContactItemKind, NodeItemKind } from "@/db/schema";
import { loadOutline } from "@/lib/tree/queries";
import type { OutlineNode } from "@/lib/tree/types";
import type { FindFieldClass, FindSourceId } from "./types";
import { bankRows } from "@/lib/finances/splitRows";

export type NodeItemRow = {
  id: string;
  nodeId: string;
  kind: NodeItemKind;
  ownerName: string;
  title: string;
  description: string;
  criteria: string;
  stakeholders: string;
  stake: string;
  detection: string;
  prevention: string;
  mitigation: string;
  advantages: string;
  disadvantages: string;
  decision: string;
  idealCandidate: string;
  candidates: string;
  filledBy: string;
  association: string;
  contact: string;
  source: string;
  resolution: string;
  url: string;
  purpose: string;
  strategy: string;
  people: string;
  conditions: string;
  reason: string;
  category: string;
  question: string;
  target: string;
  assignedTo: string;
  comments: string;
};

/**
 * One non-empty text field from one of the four `*_details` tables.
 *
 * Flat rather than four row shapes because the consumer only ever asks "what text does this
 * node carry, and what is each piece called" — and because the labels differ per type, so a
 * merged row would be forty mostly-null columns.
 */
export type OutlineDetailField = {
  nodeId: string;
  /** What the Field column prints — the drawer's own label for this field. */
  label: string;
  value: string;
};

export type NoteRow = {
  id: string;
  title: string;
  subject: string;
  body: string;
  contexts: string[];
};

export type AppointmentRow = {
  id: string;
  subject: string;
  location: string;
  notes: string;
  contexts: string[];
  startAt: Date;
};

export type ContactRow = {
  id: string;
  fileAs: string;
  givenName: string;
  familyName: string;
  nickname: string;
  company: string;
  jobTitle: string;
  department: string;
  managerName: string;
  assistantName: string;
  groupName: string;
  notes: string;
  contexts: string[];
};

export type ContactItemRow = {
  id: string;
  contactId: string;
  kind: ContactItemKind;
  ownerName: string;
  label: string;
  value: string;
  displayName: string;
  notes: string;
  streetAddress: string;
  extendedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type ResourceRow = { id: string; shortName: string; description: string };

export type JobRow = {
  id: string;
  employer: string;
  jobTitle: string;
  employmentType: string;
  duties: string;
  reasonForLeaving: string;
  supervisorName: string;
  supervisorTitle: string;
  city: string;
  region: string;
  notes: string;
};

export type ResidenceRow = {
  id: string;
  label: string;
  streetAddress: string;
  city: string;
  region: string;
  housingType: string;
  reasonForLeaving: string;
  landlordName: string;
  notes: string;
};

export type LifeEventRow = {
  id: string;
  title: string;
  category: string;
  notes: string;
  eventDate: string;
};

export type MetricRow = {
  id: string;
  title: string;
  category: string;
  question: string;
  description: string;
  reason: string;
  units: string;
};

export type ExerciseRow = { id: string; name: string; notes: string };

export type WorkoutSessionRow = {
  id: string;
  title: string;
  notes: string;
  performedAt: Date;
};

export type SessionExerciseRow = {
  id: string;
  sessionId: string;
  notes: string;
  exerciseName: string;
  sessionTitle: string;
};

export type TransactionRow = {
  id: string;
  description: string;
  notes: string;
  sourceCategory: string;
  eventLabel: string;
  transactionDate: string;
  accountName: string;
};

export type FinanceAccountRow = {
  id: string;
  name: string;
  institution: string;
  url: string;
};

export type BudgetEnvelopeRow = {
  id: string;
  name: string;
  notes: string;
  /** Empty for an ordinary envelope. */
  url: string;
  payees: string[];
};

export type FinancePayeeRow = {
  id: string;
  name: string;
  notes: string;
  aliases: string[];
};

/**
 * Every record the requested sources can offer, before any matching.
 *
 * Arrays are empty — never absent — for a source that was not requested, so the pure filter
 * downstream does not branch on whether a key exists.
 */
export type FindCorpus = {
  outline: OutlineNode[];
  outlineDetails: OutlineDetailField[];
  nodeItems: NodeItemRow[];
  notes: NoteRow[];
  appointments: AppointmentRow[];
  contacts: ContactRow[];
  contactItems: ContactItemRow[];
  resources: ResourceRow[];
  jobs: JobRow[];
  residences: ResidenceRow[];
  lifeEvents: LifeEventRow[];
  metrics: MetricRow[];
  exercises: ExerciseRow[];
  workoutSessions: WorkoutSessionRow[];
  sessionExercises: SessionExerciseRow[];
  transactions: TransactionRow[];
  financeAccounts: FinanceAccountRow[];
  financePayees: FinancePayeeRow[];
  budgetEnvelopes: BudgetEnvelopeRow[];
};

const EMPTY: FindCorpus = {
  outline: [],
  outlineDetails: [],
  nodeItems: [],
  notes: [],
  appointments: [],
  contacts: [],
  contactItems: [],
  resources: [],
  jobs: [],
  residences: [],
  lifeEvents: [],
  metrics: [],
  exercises: [],
  workoutSessions: [],
  sessionExercises: [],
  transactions: [],
  financeAccounts: [],
  financePayees: [],
  budgetEnvelopes: [],
};

/** One source's contribution. Everything it does not own is left to {@link EMPTY}. */
type CorpusPart = Partial<FindCorpus>;

/**
 * The prose on the four `*_details` tables, which `loadOutline` deliberately does not carry.
 *
 * `loadOutline` runs on every Plan page and selects only the columns a grid draws; adding
 * forty more would tax seven pages to serve one. So Find reads the rest itself, and only when
 * the Detail text field class is on.
 *
 * **These tables have no `user_id`.** They are keyed by `node_id` and inherit ownership
 * through `nodes`, so every one joins `nodes` and filters `nodes.user_id` — the pattern
 * `loadContacts` uses. Dropping that join is invisible in a one-user test, which is why
 * `crossUserReads.integration.test.ts` covers this reader.
 */
async function loadOutlineDetailText(userId: string): Promise<OutlineDetailField[]> {
  const scoped = eq(nodes.userId, userId);

  const [tasks, projects, goals, areas] = await Promise.all([
    db
      .select({
        nodeId: taskDetails.nodeId,
        description: taskDetails.description,
        source: taskDetails.source,
        place: taskDetails.place,
        wbs: taskDetails.wbs,
        company: taskDetails.company,
        billingInformation: taskDetails.billingInformation,
      })
      .from(taskDetails)
      .innerJoin(nodes, eq(nodes.id, taskDetails.nodeId))
      .where(scoped),
    db
      .select({
        nodeId: projectDetails.nodeId,
        description: projectDetails.description,
        purpose: projectDetails.purpose,
        idealVision: projectDetails.idealVision,
        sufficientVision: projectDetails.sufficientVision,
        strategy: projectDetails.strategy,
        assignedTo: projectDetails.assignedTo,
        place: projectDetails.place,
        company: projectDetails.company,
        billingInformation: projectDetails.billingInformation,
      })
      .from(projectDetails)
      .innerJoin(nodes, eq(nodes.id, projectDetails.nodeId))
      .where(scoped),
    db
      .select({
        nodeId: goalDetails.nodeId,
        definition: goalDetails.definition,
        purpose: goalDetails.purpose,
        vision: goalDetails.vision,
        affirmation: goalDetails.affirmation,
        question: goalDetails.question,
        values: goalDetails.values,
        range: goalDetails.range,
        kindOfPerson: goalDetails.kindOfPerson,
        personalChanges: goalDetails.personalChanges,
        baseline: goalDetails.baseline,
        limitingFactor: goalDetails.limitingFactor,
        strategy: goalDetails.strategy,
      })
      .from(goalDetails)
      .innerJoin(nodes, eq(nodes.id, goalDetails.nodeId))
      .where(scoped),
    db
      .select({
        nodeId: resultAreaDetails.nodeId,
        description: resultAreaDetails.description,
        reason: resultAreaDetails.reason,
        mission: resultAreaDetails.mission,
        idealOuterVision: resultAreaDetails.idealOuterVision,
        idealInnerVision: resultAreaDetails.idealInnerVision,
        strengths: resultAreaDetails.strengths,
        weaknesses: resultAreaDetails.weaknesses,
        opportunities: resultAreaDetails.opportunities,
        threats: resultAreaDetails.threats,
      })
      .from(resultAreaDetails)
      .innerJoin(nodes, eq(nodes.id, resultAreaDetails.nodeId))
      .where(scoped),
  ]);

  const LABELS: Record<string, string> = {
    description: "Description",
    source: "Source",
    place: "Place",
    wbs: "WBS",
    company: "Company",
    billingInformation: "Billing information",
    purpose: "Purpose",
    idealVision: "Ideal vision",
    sufficientVision: "Sufficient vision",
    strategy: "Strategy",
    assignedTo: "Assigned to",
    definition: "Definition",
    vision: "Vision",
    affirmation: "Affirmation",
    question: "Question",
    values: "Values",
    range: "Range",
    kindOfPerson: "Kind of person",
    personalChanges: "Personal changes",
    baseline: "Baseline",
    limitingFactor: "Limiting factor",
    reason: "Reason",
    mission: "Mission",
    idealOuterVision: "Ideal outer vision",
    idealInnerVision: "Ideal inner vision",
    strengths: "Strengths",
    weaknesses: "Weaknesses",
    opportunities: "Opportunities",
    threats: "Threats",
  };

  const fields: OutlineDetailField[] = [];
  for (const row of [...tasks, ...projects, ...goals, ...areas]) {
    const { nodeId, ...rest } = row;
    for (const [key, value] of Object.entries(rest)) {
      // Empty columns are the overwhelming majority — these tables are wide and sparsely
      // filled — and carrying them would multiply the payload for nothing to match against.
      if (value) fields.push({ nodeId, label: LABELS[key] ?? key, value });
    }
  }
  return fields;
}

async function loadOutlineSource(
  userId: string,
  detailText: boolean,
  subrecords: boolean,
): Promise<CorpusPart> {
  const [outline, details, items] = await Promise.all([
    loadOutline(userId),
    detailText ? loadOutlineDetailText(userId) : [],
    subrecords
      ? db
          .select({
            id: nodeItems.id,
            nodeId: nodeItems.nodeId,
            kind: nodeItems.kind,
            ownerName: nodes.name,
            title: nodeItems.title,
            description: nodeItems.description,
            criteria: nodeItems.criteria,
            stakeholders: nodeItems.stakeholders,
            stake: nodeItems.stake,
            detection: nodeItems.detection,
            prevention: nodeItems.prevention,
            mitigation: nodeItems.mitigation,
            advantages: nodeItems.advantages,
            disadvantages: nodeItems.disadvantages,
            decision: nodeItems.decision,
            idealCandidate: nodeItems.idealCandidate,
            candidates: nodeItems.candidates,
            filledBy: nodeItems.filledBy,
            association: nodeItems.association,
            contact: nodeItems.contact,
            source: nodeItems.source,
            resolution: nodeItems.resolution,
            url: nodeItems.url,
            purpose: nodeItems.purpose,
            strategy: nodeItems.strategy,
            people: nodeItems.people,
            conditions: nodeItems.conditions,
            reason: nodeItems.reason,
            category: nodeItems.category,
            question: nodeItems.question,
            target: nodeItems.target,
            assignedTo: nodeItems.assignedTo,
            comments: nodeItems.comments,
          })
          .from(nodeItems)
          .innerJoin(nodes, eq(nodes.id, nodeItems.nodeId))
          // Both sides scoped. The child's own `user_id` is the authority; constraining the
          // joined parent too means a row whose `node_id` somehow points across users cannot
          // leak the owner's name into the Where column.
          .where(and(eq(nodeItems.userId, userId), eq(nodes.userId, userId)))
      : [],
  ]);

  return { outline, outlineDetails: details, nodeItems: items };
}

async function loadNotesSource(userId: string): Promise<CorpusPart> {
  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      subject: notes.subject,
      body: notes.body,
      contexts: notes.contexts,
    })
    .from(notes)
    .where(eq(notes.userId, userId));
  return { notes: rows };
}

async function loadAppointmentsSource(userId: string): Promise<CorpusPart> {
  const rows = await db
    .select({
      id: appointments.id,
      subject: appointments.subject,
      location: appointments.location,
      notes: appointments.notes,
      contexts: appointments.contexts,
      startAt: appointments.startAt,
    })
    .from(appointments)
    .where(eq(appointments.userId, userId));
  return { appointments: rows };
}

async function loadContactsSource(
  userId: string,
  subrecords: boolean,
): Promise<CorpusPart> {
  const [people, items] = await Promise.all([
    db
      .select({
        id: contacts.id,
        fileAs: contacts.fileAs,
        givenName: contacts.givenName,
        familyName: contacts.familyName,
        nickname: contacts.nickname,
        company: contacts.company,
        jobTitle: contacts.jobTitle,
        department: contacts.department,
        managerName: contacts.managerName,
        assistantName: contacts.assistantName,
        groupName: contacts.groupName,
        notes: contacts.notes,
        contexts: contacts.contexts,
      })
      .from(contacts)
      .where(eq(contacts.userId, userId)),
    subrecords
      ? db
          .select({
            id: contactItems.id,
            contactId: contactItems.contactId,
            kind: contactItems.kind,
            ownerName: contacts.fileAs,
            label: contactItems.label,
            value: contactItems.value,
            displayName: contactItems.displayName,
            notes: contactItems.notes,
            streetAddress: contactItems.streetAddress,
            extendedAddress: contactItems.extendedAddress,
            city: contactItems.city,
            region: contactItems.region,
            postalCode: contactItems.postalCode,
            country: contactItems.country,
          })
          .from(contactItems)
          .innerJoin(contacts, eq(contacts.id, contactItems.contactId))
          .where(and(eq(contactItems.userId, userId), eq(contacts.userId, userId)))
      : [],
  ]);

  return { contacts: people, contactItems: items };
}

async function loadLibrarySource(userId: string): Promise<CorpusPart> {
  const [resourceRows, jobRows, residenceRows, eventRows] = await Promise.all([
    db
      .select({
        id: resources.id,
        shortName: resources.shortName,
        description: resources.description,
      })
      .from(resources)
      .where(eq(resources.userId, userId)),
    db
      .select({
        id: jobs.id,
        employer: jobs.employer,
        jobTitle: jobs.jobTitle,
        employmentType: jobs.employmentType,
        duties: jobs.duties,
        reasonForLeaving: jobs.reasonForLeaving,
        supervisorName: jobs.supervisorName,
        supervisorTitle: jobs.supervisorTitle,
        city: jobs.city,
        region: jobs.region,
        notes: jobs.notes,
      })
      .from(jobs)
      .where(eq(jobs.userId, userId)),
    db
      .select({
        id: residences.id,
        label: residences.label,
        streetAddress: residences.streetAddress,
        city: residences.city,
        region: residences.region,
        housingType: residences.housingType,
        reasonForLeaving: residences.reasonForLeaving,
        landlordName: residences.landlordName,
        notes: residences.notes,
      })
      .from(residences)
      .where(eq(residences.userId, userId)),
    db
      .select({
        id: lifeEvents.id,
        title: lifeEvents.title,
        category: lifeEvents.category,
        notes: lifeEvents.notes,
        eventDate: lifeEvents.eventDate,
      })
      .from(lifeEvents)
      .where(eq(lifeEvents.userId, userId)),
  ]);

  return {
    resources: resourceRows,
    jobs: jobRows,
    residences: residenceRows,
    lifeEvents: eventRows,
  };
}

async function loadMetricsSource(userId: string): Promise<CorpusPart> {
  const rows = await db
    .select({
      id: metrics.id,
      title: metrics.title,
      category: metrics.category,
      question: metrics.question,
      description: metrics.description,
      reason: metrics.reason,
      units: metrics.units,
    })
    .from(metrics)
    .where(eq(metrics.userId, userId));
  return { metrics: rows };
}

async function loadFitnessSource(
  userId: string,
  subrecords: boolean,
): Promise<CorpusPart> {
  const [exerciseRows, sessionRows, sessionExerciseRows] = await Promise.all([
    db
      .select({ id: exercises.id, name: exercises.name, notes: exercises.notes })
      .from(exercises)
      .where(eq(exercises.userId, userId)),
    db
      .select({
        id: workoutSessions.id,
        title: workoutSessions.title,
        notes: workoutSessions.notes,
        performedAt: workoutSessions.performedAt,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId)),
    subrecords
      ? db
          .select({
            id: workoutSessionExercises.id,
            sessionId: workoutSessionExercises.sessionId,
            notes: workoutSessionExercises.notes,
            exerciseName: exercises.name,
            sessionTitle: workoutSessions.title,
          })
          .from(workoutSessionExercises)
          .innerJoin(exercises, eq(exercises.id, workoutSessionExercises.exerciseId))
          .innerJoin(
            workoutSessions,
            eq(workoutSessions.id, workoutSessionExercises.sessionId),
          )
          .where(
            and(
              eq(workoutSessionExercises.userId, userId),
              eq(exercises.userId, userId),
              eq(workoutSessions.userId, userId),
            ),
          )
      : [],
  ]);

  return {
    exercises: exerciseRows,
    workoutSessions: sessionRows,
    sessionExercises: sessionExerciseRows,
  };
}

async function loadFinancesSource(userId: string): Promise<CorpusPart> {
  const [transactionRows, accountRows, envelopeRows, payeeRows, aliasRows] =
    await Promise.all([
      db
        .select({
          id: financeTransactions.id,
          description: financeTransactions.description,
          notes: financeTransactions.notes,
          sourceCategory: financeTransactions.sourceCategory,
          eventLabel: financeTransactions.eventLabel,
          transactionDate: financeTransactions.transactionDate,
          accountName: financeAccounts.name,
        })
        .from(financeTransactions)
        .innerJoin(
          financeAccounts,
          eq(financeAccounts.id, financeTransactions.accountId),
        )
        .where(
          and(
            eq(financeTransactions.userId, userId),
            eq(financeAccounts.userId, userId),
            // Children do not participate in search (D8); a hit on one would open a row the
            // register cannot scroll to.
            bankRows,
          ),
        ),
      db
        .select({
          id: financeAccounts.id,
          name: financeAccounts.name,
          institution: financeAccounts.institution,
          url: financeAccounts.url,
        })
        .from(financeAccounts)
        .where(eq(financeAccounts.userId, userId)),
      db
        .select({
          id: financeBudgetCategories.id,
          name: financeBudgetCategories.name,
          notes: financeBudgetCategories.notes,
          url: financeBudgetCategories.url,
        })
        .from(financeBudgetCategories)
        .where(eq(financeBudgetCategories.userId, userId)),
      db
        .select({
          id: financePayees.id,
          name: financePayees.name,
          notes: financePayees.notes,
          envelopeId: financePayees.claimedBudgetCategoryId,
        })
        .from(financePayees)
        .where(eq(financePayees.userId, userId)),
      db
        .select({
          payeeId: financePayeeAliases.payeeId,
          alias: financePayeeAliases.alias,
        })
        .from(financePayeeAliases)
        .where(eq(financePayeeAliases.userId, userId)),
    ]);

  const aliasesByPayee = new Map<string, string[]>();
  for (const row of aliasRows) {
    const aliases = aliasesByPayee.get(row.payeeId) ?? [];
    aliases.push(row.alias);
    aliasesByPayee.set(row.payeeId, aliases);
  }
  const namesByEnvelope = new Map<string, string[]>();
  for (const payee of payeeRows) {
    if (payee.envelopeId) {
      namesByEnvelope.set(payee.envelopeId, [
        ...(namesByEnvelope.get(payee.envelopeId) ?? []),
        payee.name,
      ]);
    }
  }

  return {
    transactions: transactionRows,
    financeAccounts: accountRows,
    financePayees: payeeRows.map((payee) => ({
      id: payee.id,
      name: payee.name,
      notes: payee.notes,
      aliases: aliasesByPayee.get(payee.id) ?? [],
    })),
    budgetEnvelopes: envelopeRows.map((envelope) => ({
      ...envelope,
      payees: namesByEnvelope.get(envelope.id) ?? [],
    })),
  };
}

/**
 * Load the corpus for one Find.
 *
 * `userId` first and scoped in every arm — `development/security.md`. The four `*_details`
 * tables have no `user_id` of their own; they arrive through `loadOutline`, whose recursive
 * CTE constrains `nodes.user_id` in both arms and joins the detail tables to it.
 *
 * An unrequested source is not read at all, and unticking Sub-records skips the three
 * child-list reads.
 */
export async function loadFindCorpus(
  userId: string,
  sources: readonly FindSourceId[],
  fieldClasses: readonly FindFieldClass[],
): Promise<FindCorpus> {
  const wanted = new Set(sources);
  const detailText = fieldClasses.includes("detail");
  const subrecords = fieldClasses.includes("subrecord");

  const loaders: Record<FindSourceId, () => Promise<CorpusPart>> = {
    outline: () => loadOutlineSource(userId, detailText, subrecords),
    notes: () => loadNotesSource(userId),
    appointments: () => loadAppointmentsSource(userId),
    contacts: () => loadContactsSource(userId, subrecords),
    library: () => loadLibrarySource(userId),
    metrics: () => loadMetricsSource(userId),
    fitness: () => loadFitnessSource(userId, subrecords),
    finances: () => loadFinancesSource(userId),
  };

  const parts = await Promise.all([...wanted].map((source) => loaders[source]()));

  return parts.reduce<FindCorpus>((corpus, part) => ({ ...corpus, ...part }), EMPTY);
}
