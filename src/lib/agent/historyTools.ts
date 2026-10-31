/**
 * Agent tools over jobs, residences, and typed life events.
 *
 * Duration is not computed here: an ongoing job or current home is measured against
 * today, and the server does not know the user's day.
 */

import { createJobOnce, updateJob } from "@/lib/jobs/mutations";
import { getJobDetail, listJobs } from "@/lib/jobs/queries";
import type { JobDetail, JobInput, JobListRow } from "@/lib/jobs/types";
import { createResidenceOnce, updateResidence } from "@/lib/residences/mutations";
import { getResidenceDetail, listResidences } from "@/lib/residences/queries";
import type {
  ResidenceDetail,
  ResidenceInput,
  ResidenceListRow,
} from "@/lib/residences/types";
import { createLifeEventOnce, updateLifeEvent } from "@/lib/timeline/mutations";
import { getLifeEvent, listLifeEvents } from "@/lib/timeline/queries";
import type { LifeEventDetail, LifeEventInput } from "@/lib/timeline/types";
import { AgentError } from "./errors";
import { pageBounds, paginate } from "./pagination";
import {
  optionalBoolean,
  optionalExternalRef,
  optionalNumber,
  optionalString,
  requireString,
  optionalDateKey,
  optionalMoney,
  parseDateKey,
  requireSomeField,
} from "./parse";

function inDateWindow(
  date: string | null,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesQuery(haystack: string, query: string | undefined): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query);
}

function jobSummary(row: JobListRow) {
  return {
    id: row.id,
    employer: row.employer,
    jobTitle: row.jobTitle,
    employmentType: row.employmentType,
    startDate: row.startDate,
    endDate: row.endDate,
    location: row.location,
  };
}

function jobDetail(row: JobDetail) {
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
  };
}

function residenceSummary(row: ResidenceListRow) {
  return {
    id: row.id,
    label: row.label,
    city: row.city,
    region: row.region,
    country: row.country,
    movedIn: row.movedIn,
    movedOut: row.movedOut,
    housingType: row.housingType,
    address: row.address,
  };
}

function residenceDetail(row: ResidenceDetail) {
  return {
    id: row.id,
    label: row.label,
    streetAddress: row.streetAddress,
    extendedAddress: row.extendedAddress,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    countryCode: row.countryCode,
    movedIn: row.movedIn,
    movedOut: row.movedOut,
    housingType: row.housingType,
    monthlyRent: row.monthlyRent,
    reasonForLeaving: row.reasonForLeaving,
    landlordName: row.landlordName,
    landlordPhone: row.landlordPhone,
    landlordEmail: row.landlordEmail,
    notes: row.notes,
  };
}

function lifeEventSummary(row: LifeEventDetail) {
  return {
    id: row.id,
    eventDate: row.eventDate,
    title: row.title,
    category: row.category,
  };
}

function lifeEventDetail(row: LifeEventDetail) {
  return {
    id: row.id,
    eventDate: row.eventDate,
    title: row.title,
    category: row.category,
    notes: row.notes,
  };
}

function jobInputFromArgs(args: Record<string, unknown>): JobInput {
  return {
    employer: optionalString(args, "employer"),
    jobTitle: optionalString(args, "jobTitle"),
    employmentType: optionalString(args, "employmentType"),
    startDate: optionalDateKey(args, "startDate"),
    endDate: optionalDateKey(args, "endDate"),
    duties: optionalString(args, "duties"),
    reasonForLeaving: optionalString(args, "reasonForLeaving"),
    startingPay: optionalMoney(args, "startingPay"),
    endingPay: optionalMoney(args, "endingPay"),
    payPeriod: optionalString(args, "payPeriod"),
    phone: optionalString(args, "phone"),
    streetAddress: optionalString(args, "streetAddress"),
    extendedAddress: optionalString(args, "extendedAddress"),
    city: optionalString(args, "city"),
    region: optionalString(args, "region"),
    postalCode: optionalString(args, "postalCode"),
    country: optionalString(args, "country"),
    countryCode: optionalString(args, "countryCode"),
    supervisorName: optionalString(args, "supervisorName"),
    supervisorTitle: optionalString(args, "supervisorTitle"),
    supervisorPhone: optionalString(args, "supervisorPhone"),
    supervisorEmail: optionalString(args, "supervisorEmail"),
    mayContactSupervisor: optionalBoolean(args, "mayContactSupervisor"),
    notes: optionalString(args, "notes"),
  };
}

function residenceInputFromArgs(args: Record<string, unknown>): ResidenceInput {
  return {
    label: optionalString(args, "label"),
    streetAddress: optionalString(args, "streetAddress"),
    extendedAddress: optionalString(args, "extendedAddress"),
    city: optionalString(args, "city"),
    region: optionalString(args, "region"),
    postalCode: optionalString(args, "postalCode"),
    country: optionalString(args, "country"),
    countryCode: optionalString(args, "countryCode"),
    movedIn: optionalDateKey(args, "movedIn"),
    movedOut: optionalDateKey(args, "movedOut"),
    housingType: optionalString(args, "housingType"),
    monthlyRent: optionalMoney(args, "monthlyRent"),
    reasonForLeaving: optionalString(args, "reasonForLeaving"),
    landlordName: optionalString(args, "landlordName"),
    landlordPhone: optionalString(args, "landlordPhone"),
    landlordEmail: optionalString(args, "landlordEmail"),
    notes: optionalString(args, "notes"),
  };
}

function lifeEventInputFromArgs(args: Record<string, unknown>): LifeEventInput {
  // An event always has a date, so a null or blank one leaves the stored date alone rather
  // than clearing it.
  const eventDate = optionalDateKey(args, "eventDate");
  return {
    eventDate: eventDate === null ? undefined : eventDate,
    title: optionalString(args, "title"),
    category: optionalString(args, "category"),
    notes: optionalString(args, "notes"),
  };
}

/**
 * One page of a catalog of spans — jobs, residences — filtered the way both list tools
 * take it: `currentOnly` keeps the ones with no end, `from`/`to` bound the start, and
 * `query` matches the row's text.
 */
function pageOfSpans<T>(
  rows: readonly T[],
  args: Record<string, unknown>,
  span: (row: T) => { start: string | null; end: string | null },
  text: (row: T) => string,
) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const query = optionalString(args, "query")?.trim().toLowerCase();
  const from = optionalDateKey(args, "from") ?? undefined;
  const to = optionalDateKey(args, "to") ?? undefined;
  const currentOnly = optionalBoolean(args, "currentOnly") ?? false;
  const kept = rows.filter((row) => {
    const { start, end } = span(row);
    if (currentOnly && end !== null) return false;
    return inDateWindow(start, from, to) && matchesQuery(text(row), query);
  });
  return paginate(kept, bounds);
}

export async function listJobsTool(userId: string, args: Record<string, unknown>) {
  const page = pageOfSpans(
    await listJobs(userId),
    args,
    (row) => ({ start: row.startDate, end: row.endDate }),
    (row) =>
      `${row.employer} ${row.jobTitle} ${row.employmentType} ${row.location} ${row.duties} ${row.notes}`,
  );
  return { jobs: page.items.map(jobSummary), pageInfo: page.pageInfo };
}

export async function getJobTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const detail = await getJobDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `Job not found: ${id}`);
  return { job: jobDetail(detail) };
}

export async function createJobTool(userId: string, args: Record<string, unknown>) {
  const result = await createJobOnce(
    userId,
    jobInputFromArgs(args),
    optionalExternalRef(args),
  );
  const payload = (await getJobTool(userId, { id: result.id })) as { job: unknown };
  return { job: payload.job, created: result.created };
}

export async function updateJobTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  await getJobTool(userId, { id });
  const input = jobInputFromArgs(args);
  requireSomeField(input);
  await updateJob(userId, id, input);
  return getJobTool(userId, { id });
}

export async function listResidencesTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const page = pageOfSpans(
    await listResidences(userId),
    args,
    (row) => ({ start: row.movedIn, end: row.movedOut }),
    (row) =>
      `${row.label} ${row.address} ${row.city} ${row.region} ${row.country} ${row.housingType} ${row.notes}`,
  );
  return { residences: page.items.map(residenceSummary), pageInfo: page.pageInfo };
}

export async function getResidenceTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const detail = await getResidenceDetail(userId, id);
  if (!detail) throw new AgentError("not_found", `Residence not found: ${id}`);
  return { residence: residenceDetail(detail) };
}

export async function createResidenceTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const result = await createResidenceOnce(
    userId,
    residenceInputFromArgs(args),
    optionalExternalRef(args),
  );
  const payload = (await getResidenceTool(userId, { id: result.id })) as {
    residence: unknown;
  };
  return { residence: payload.residence, created: result.created };
}

export async function updateResidenceTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  await getResidenceTool(userId, { id });
  const input = residenceInputFromArgs(args);
  requireSomeField(input);
  await updateResidence(userId, id, input);
  return getResidenceTool(userId, { id });
}

export async function listLifeEventsTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const query = optionalString(args, "query")?.trim().toLowerCase();
  const from = optionalDateKey(args, "from") ?? undefined;
  const to = optionalDateKey(args, "to") ?? undefined;

  let rows = await listLifeEvents(userId);
  rows = rows.filter((row) => inDateWindow(row.eventDate, from, to));
  rows = rows.filter((row) =>
    matchesQuery(`${row.title} ${row.category} ${row.notes}`, query),
  );

  const page = paginate(rows, bounds);
  return { events: page.items.map(lifeEventSummary), pageInfo: page.pageInfo };
}

export async function getLifeEventTool(userId: string, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const detail = await getLifeEvent(userId, id);
  if (!detail) throw new AgentError("not_found", `Event not found: ${id}`);
  return { event: lifeEventDetail(detail) };
}

export async function createLifeEventTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const eventDate = parseDateKey(requireString(args, "eventDate"), "eventDate");
  if (!eventDate) throw new AgentError("validation", "eventDate is required");
  const input = lifeEventInputFromArgs(args);
  const result = await createLifeEventOnce(
    userId,
    { ...input, eventDate },
    optionalExternalRef(args),
  );
  const payload = (await getLifeEventTool(userId, { id: result.id })) as {
    event: unknown;
  };
  return { event: payload.event, created: result.created };
}

export async function updateLifeEventTool(
  userId: string,
  args: Record<string, unknown>,
) {
  const id = requireString(args, "id");
  await getLifeEventTool(userId, { id });
  const input = lifeEventInputFromArgs(args);
  requireSomeField(input);
  await updateLifeEvent(userId, id, input);
  return getLifeEventTool(userId, { id });
}
