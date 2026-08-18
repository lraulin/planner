/**
 * Agent tools over jobs, residences, and typed life events.
 *
 * Duration is not computed here: an ongoing job or current home is measured against
 * today, and the server does not know the user's day.
 */

import { daysInMonth } from "@/lib/dateMath";
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
} from "./parse";

function parseDateKey(
  value: string | null | undefined,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AgentError("validation", `${field} must be YYYY-MM-DD`);
  }
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new AgentError("validation", `${field} is not a date that exists: ${value}`);
  }
  return value;
}

function optionalDateKey(
  args: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in args)) return undefined;
  const value = args[key];
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AgentError("validation", `${key} must be a date or null`);
  }
  return parseDateKey(value, key);
}

function optionalMoney(
  args: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in args)) return undefined;
  const value = args[key];
  if (value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AgentError("validation", `${key} must be a money amount or null`);
    }
    return String(value);
  }
  if (typeof value === "string") return value;
  throw new AgentError("validation", `${key} must be a money amount or null`);
}

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
  const input: JobInput = {};
  if (args.employer !== undefined)
    input.employer = optionalString(args, "employer") ?? "";
  if (args.jobTitle !== undefined)
    input.jobTitle = optionalString(args, "jobTitle") ?? "";
  if (args.employmentType !== undefined) {
    input.employmentType = optionalString(args, "employmentType") ?? "";
  }
  if (args.startDate !== undefined)
    input.startDate = optionalDateKey(args, "startDate");
  if (args.endDate !== undefined) input.endDate = optionalDateKey(args, "endDate");
  if (args.duties !== undefined) input.duties = optionalString(args, "duties") ?? "";
  if (args.reasonForLeaving !== undefined) {
    input.reasonForLeaving = optionalString(args, "reasonForLeaving") ?? "";
  }
  if (args.startingPay !== undefined)
    input.startingPay = optionalMoney(args, "startingPay");
  if (args.endingPay !== undefined) input.endingPay = optionalMoney(args, "endingPay");
  if (args.payPeriod !== undefined)
    input.payPeriod = optionalString(args, "payPeriod") ?? "";
  if (args.phone !== undefined) input.phone = optionalString(args, "phone") ?? "";
  if (args.streetAddress !== undefined) {
    input.streetAddress = optionalString(args, "streetAddress") ?? "";
  }
  if (args.extendedAddress !== undefined) {
    input.extendedAddress = optionalString(args, "extendedAddress") ?? "";
  }
  if (args.city !== undefined) input.city = optionalString(args, "city") ?? "";
  if (args.region !== undefined) input.region = optionalString(args, "region") ?? "";
  if (args.postalCode !== undefined) {
    input.postalCode = optionalString(args, "postalCode") ?? "";
  }
  if (args.country !== undefined) input.country = optionalString(args, "country") ?? "";
  if (args.countryCode !== undefined) {
    input.countryCode = optionalString(args, "countryCode") ?? "";
  }
  if (args.supervisorName !== undefined) {
    input.supervisorName = optionalString(args, "supervisorName") ?? "";
  }
  if (args.supervisorTitle !== undefined) {
    input.supervisorTitle = optionalString(args, "supervisorTitle") ?? "";
  }
  if (args.supervisorPhone !== undefined) {
    input.supervisorPhone = optionalString(args, "supervisorPhone") ?? "";
  }
  if (args.supervisorEmail !== undefined) {
    input.supervisorEmail = optionalString(args, "supervisorEmail") ?? "";
  }
  if (args.mayContactSupervisor !== undefined) {
    input.mayContactSupervisor = optionalBoolean(args, "mayContactSupervisor");
  }
  if (args.notes !== undefined) input.notes = optionalString(args, "notes") ?? "";
  return input;
}

function residenceInputFromArgs(args: Record<string, unknown>): ResidenceInput {
  const input: ResidenceInput = {};
  if (args.label !== undefined) input.label = optionalString(args, "label") ?? "";
  if (args.streetAddress !== undefined) {
    input.streetAddress = optionalString(args, "streetAddress") ?? "";
  }
  if (args.extendedAddress !== undefined) {
    input.extendedAddress = optionalString(args, "extendedAddress") ?? "";
  }
  if (args.city !== undefined) input.city = optionalString(args, "city") ?? "";
  if (args.region !== undefined) input.region = optionalString(args, "region") ?? "";
  if (args.postalCode !== undefined) {
    input.postalCode = optionalString(args, "postalCode") ?? "";
  }
  if (args.country !== undefined) input.country = optionalString(args, "country") ?? "";
  if (args.countryCode !== undefined) {
    input.countryCode = optionalString(args, "countryCode") ?? "";
  }
  if (args.movedIn !== undefined) input.movedIn = optionalDateKey(args, "movedIn");
  if (args.movedOut !== undefined) input.movedOut = optionalDateKey(args, "movedOut");
  if (args.housingType !== undefined) {
    input.housingType = optionalString(args, "housingType") ?? "";
  }
  if (args.monthlyRent !== undefined)
    input.monthlyRent = optionalMoney(args, "monthlyRent");
  if (args.reasonForLeaving !== undefined) {
    input.reasonForLeaving = optionalString(args, "reasonForLeaving") ?? "";
  }
  if (args.landlordName !== undefined) {
    input.landlordName = optionalString(args, "landlordName") ?? "";
  }
  if (args.landlordPhone !== undefined) {
    input.landlordPhone = optionalString(args, "landlordPhone") ?? "";
  }
  if (args.landlordEmail !== undefined) {
    input.landlordEmail = optionalString(args, "landlordEmail") ?? "";
  }
  if (args.notes !== undefined) input.notes = optionalString(args, "notes") ?? "";
  return input;
}

function lifeEventInputFromArgs(args: Record<string, unknown>): LifeEventInput {
  const input: LifeEventInput = {};
  if (args.eventDate !== undefined) {
    const eventDate = optionalDateKey(args, "eventDate");
    if (eventDate) input.eventDate = eventDate;
  }
  if (args.title !== undefined) input.title = optionalString(args, "title") ?? "";
  if (args.category !== undefined)
    input.category = optionalString(args, "category") ?? "";
  if (args.notes !== undefined) input.notes = optionalString(args, "notes") ?? "";
  return input;
}

export async function listJobsTool(userId: string, args: Record<string, unknown>) {
  const bounds = pageBounds(
    optionalNumber(args, "offset"),
    optionalNumber(args, "limit"),
  );
  const query = optionalString(args, "query")?.trim().toLowerCase();
  const from = optionalDateKey(args, "from") ?? undefined;
  const to = optionalDateKey(args, "to") ?? undefined;
  const currentOnly = optionalBoolean(args, "currentOnly") ?? false;

  let rows = await listJobs(userId);
  if (currentOnly) rows = rows.filter((row) => row.endDate === null);
  rows = rows.filter((row) => inDateWindow(row.startDate, from, to));
  rows = rows.filter((row) =>
    matchesQuery(
      `${row.employer} ${row.jobTitle} ${row.employmentType} ${row.location} ${row.duties} ${row.notes}`,
      query,
    ),
  );

  const page = paginate(rows, bounds);
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
  if (Object.keys(input).length === 0) {
    throw new AgentError("validation", "Provide at least one field to update");
  }
  await updateJob(userId, id, input);
  return getJobTool(userId, { id });
}

export async function listResidencesTool(
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
  const currentOnly = optionalBoolean(args, "currentOnly") ?? false;

  let rows = await listResidences(userId);
  if (currentOnly) rows = rows.filter((row) => row.movedOut === null);
  rows = rows.filter((row) => inDateWindow(row.movedIn, from, to));
  rows = rows.filter((row) =>
    matchesQuery(
      `${row.label} ${row.address} ${row.city} ${row.region} ${row.country} ${row.housingType} ${row.notes}`,
      query,
    ),
  );

  const page = paginate(rows, bounds);
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
  if (Object.keys(input).length === 0) {
    throw new AgentError("validation", "Provide at least one field to update");
  }
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
  if (Object.keys(input).length === 0) {
    throw new AgentError("validation", "Provide at least one field to update");
  }
  await updateLifeEvent(userId, id, input);
  return getLifeEventTool(userId, { id });
}
