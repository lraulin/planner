import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs, type ExternalRef } from "@/db/schema";
import {
  dateKeyOrNull,
  moneyOrNull,
  patchText,
  requireOrderedDates,
} from "@/lib/history/fields";
import type { JobInput } from "./types";

/** Jobs are standalone records. Every write scopes by `userId`. */

const TEXT_FIELDS = [
  "employer",
  "jobTitle",
  "employmentType",
  "duties",
  "reasonForLeaving",
  "payPeriod",
  "phone",
  "streetAddress",
  "extendedAddress",
  "city",
  "region",
  "postalCode",
  "country",
  "countryCode",
  "supervisorName",
  "supervisorTitle",
  "supervisorPhone",
  "supervisorEmail",
  "notes",
] as const;

const DATE_LABELS = { start: "Start date", end: "End date" };

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

async function requireJob(tx: Executor, userId: string, jobId: string) {
  const [row] = await tx
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  if (!row) throw new Error("Job not found.");
  return row;
}

export async function createJob(userId: string, input: JobInput = {}): Promise<string> {
  return (await createJobOnce(userId, input)).id;
}

export async function createJobOnce(
  userId: string,
  input: JobInput = {},
  external?: ExternalRef,
): Promise<{ id: string; created: boolean }> {
  const startDate = dateKeyOrNull(input.startDate, DATE_LABELS.start);
  const endDate = dateKeyOrNull(input.endDate, DATE_LABELS.end);
  requireOrderedDates(startDate, endDate, DATE_LABELS);

  const text: Record<string, unknown> = {};
  patchText(text, input, TEXT_FIELDS);

  return db.transaction(async (tx) => {
    if (external) {
      const [existing] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.userId, userId),
            eq(jobs.externalSource, external.source),
            eq(jobs.externalId, external.id),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false };
    }

    const [row] = await tx
      .insert(jobs)
      .values({
        userId,
        ...text,
        startDate,
        endDate,
        startingPay: moneyOrNull(input.startingPay, "Starting pay"),
        endingPay: moneyOrNull(input.endingPay, "Ending pay"),
        mayContactSupervisor: input.mayContactSupervisor ?? true,
        externalSource: external?.source ?? null,
        externalId: external?.id ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: jobs.id });

    if (row) return { id: row.id, created: true };
    if (!external) throw new Error("Job could not be created.");
    const [existing] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, userId),
          eq(jobs.externalSource, external.source),
          eq(jobs.externalId, external.id),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Job could not be created.");
    return { id: existing.id, created: false };
  });
}

export async function updateJob(
  userId: string,
  jobId: string,
  input: JobInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await requireJob(tx, userId, jobId);

    // The ordering rule is checked against the record as it will be, not as it was — an edit
    // that only moves the end date still has to clear the start date it is being compared to.
    const startDate =
      input.startDate === undefined
        ? existing.startDate
        : dateKeyOrNull(input.startDate, DATE_LABELS.start);
    const endDate =
      input.endDate === undefined
        ? existing.endDate
        : dateKeyOrNull(input.endDate, DATE_LABELS.end);
    requireOrderedDates(startDate, endDate, DATE_LABELS);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    patchText(patch, input, TEXT_FIELDS);
    if (input.startDate !== undefined) patch.startDate = startDate;
    if (input.endDate !== undefined) patch.endDate = endDate;
    if (input.startingPay !== undefined) {
      patch.startingPay = moneyOrNull(input.startingPay, "Starting pay");
    }
    if (input.endingPay !== undefined) {
      patch.endingPay = moneyOrNull(input.endingPay, "Ending pay");
    }
    if (input.mayContactSupervisor !== undefined) {
      patch.mayContactSupervisor = input.mayContactSupervisor;
    }

    await tx
      .update(jobs)
      .set(patch)
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  });
}

export async function deleteJob(userId: string, jobId: string): Promise<void> {
  const deleted = await db
    .delete(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .returning({ id: jobs.id });
  if (deleted.length === 0) throw new Error("Job not found.");
}
