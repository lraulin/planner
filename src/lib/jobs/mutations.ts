import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
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
  const startDate = dateKeyOrNull(input.startDate, DATE_LABELS.start);
  const endDate = dateKeyOrNull(input.endDate, DATE_LABELS.end);
  requireOrderedDates(startDate, endDate, DATE_LABELS);

  const text: Record<string, unknown> = {};
  patchText(text, input, TEXT_FIELDS);

  const [row] = await db
    .insert(jobs)
    .values({
      userId,
      ...text,
      startDate,
      endDate,
      startingPay: moneyOrNull(input.startingPay, "Starting pay"),
      endingPay: moneyOrNull(input.endingPay, "Ending pay"),
      mayContactSupervisor: input.mayContactSupervisor ?? true,
    })
    .returning({ id: jobs.id });
  return row.id;
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
