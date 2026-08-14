"use server";

import { createJob, deleteJob, updateJob } from "@/lib/jobs/mutations";
import { getJobDetail, listJobs } from "@/lib/jobs/queries";
import type { JobDetail, JobInput, JobListRow } from "@/lib/jobs/types";
import { run, runQuery, type ActionResult, type QueryResult } from "../../actionResult";

export async function createJobAction(input?: JobInput): Promise<ActionResult> {
  return run((userId) => createJob(userId, input));
}

export async function updateJobAction(
  jobId: string,
  input: JobInput,
): Promise<ActionResult> {
  return run((userId) => updateJob(userId, jobId, input));
}

export async function deleteJobAction(jobId: string): Promise<ActionResult> {
  return run((userId) => deleteJob(userId, jobId));
}

export async function listJobsAction(): Promise<QueryResult<JobListRow[]>> {
  return runQuery(listJobs);
}

export async function getJobDetailAction(
  jobId: string,
): Promise<QueryResult<JobDetail | null>> {
  return runQuery((userId) => getJobDetail(userId, jobId));
}
