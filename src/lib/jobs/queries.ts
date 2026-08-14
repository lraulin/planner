import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { formatPostalAddress } from "@/lib/address";
import type { JobDetail, JobListRow } from "./types";

function toDetail(row: typeof jobs.$inferSelect): JobDetail {
  return {
    id: row.id,
    employer: row.employer,
    jobTitle: row.jobTitle,
    employmentType: row.employmentType,
    startDate: row.startDate,
    endDate: row.endDate,
    duties: row.duties,
    reasonForLeaving: row.reasonForLeaving,
    startingPay: row.startingPay,
    endingPay: row.endingPay,
    payPeriod: row.payPeriod,
    phone: row.phone,
    streetAddress: row.streetAddress,
    extendedAddress: row.extendedAddress,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    countryCode: row.countryCode,
    supervisorName: row.supervisorName,
    supervisorTitle: row.supervisorTitle,
    supervisorPhone: row.supervisorPhone,
    supervisorEmail: row.supervisorEmail,
    mayContactSupervisor: row.mayContactSupervisor,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toListRow(row: JobDetail): JobListRow {
  return {
    ...row,
    location: formatPostalAddress({ ...row, streetAddress: "", extendedAddress: "" }),
  };
}

/**
 * Every job, most recent first.
 *
 * A job with no start date sorts to the end rather than the beginning: an undated record is
 * one you have not filled in yet, and burying it under the current job is wrong in the other
 * direction — you want to see it, just not first.
 *
 * Duration is deliberately **not** computed here. An ongoing job is measured against today,
 * and the server does not know what day it is where the user is — see `lib/history/span.ts`.
 */
export async function listJobs(userId: string): Promise<JobListRow[]> {
  const rows = await db.select().from(jobs).where(eq(jobs.userId, userId));
  return rows
    .map((row) => toListRow(toDetail(row)))
    .sort((a, b) => {
      if (a.startDate === b.startDate) return a.employer.localeCompare(b.employer);
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return b.startDate.localeCompare(a.startDate);
    });
}

/** One job, scoped to the signed-in user. */
export async function getJobDetail(
  userId: string,
  jobId: string,
): Promise<JobDetail | null> {
  const [row] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
    .limit(1);
  return row ? toDetail(row) : null;
}

/** The dated fields the chronology needs, without dragging twenty-five columns through it. */
export async function listJobDates(userId: string) {
  return db
    .select({
      id: jobs.id,
      employer: jobs.employer,
      jobTitle: jobs.jobTitle,
      startDate: jobs.startDate,
      endDate: jobs.endDate,
    })
    .from(jobs)
    .where(eq(jobs.userId, userId));
}
