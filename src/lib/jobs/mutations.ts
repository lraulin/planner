import { db } from "@/db";
import type { DbExecutor } from "@/db/executor";
import { jobs, type ExternalRef } from "@/db/schema";
import { findByExternalRef, ownedRow, requireOwnedRow } from "@/lib/db/owned";
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

async function requireJob(tx: DbExecutor, userId: string, jobId: string) {
  return requireOwnedRow(tx, jobs, jobId, userId, "Job not found.");
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
      const existing = await findByExternalRef(tx, jobs, userId, external);
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
    const existing = await findByExternalRef(tx, jobs, userId, external);
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
      .where(ownedRow(jobs, jobId, userId));
  });
}

export async function deleteJob(userId: string, jobId: string): Promise<void> {
  const deleted = await db
    .delete(jobs)
    .where(ownedRow(jobs, jobId, userId))
    .returning({ id: jobs.id });
  if (deleted.length === 0) throw new Error("Job not found.");
}
