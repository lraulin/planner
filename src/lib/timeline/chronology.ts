import { formatPostalAddress } from "@/lib/address";
import { listJobDates } from "@/lib/jobs/queries";
import { listResidenceDates } from "@/lib/residences/queries";
import { listLifeEvents } from "./queries";
import type { ChronologyRow, LifeEventDetail } from "./types";

/**
 * The Timeline grid's rows: everything that happened, in order.
 *
 * **Job and residence dates are derived here, at read time, and never copied into
 * `life_events`.** Copying would be one query instead of three and would immediately start
 * lying: rename an employer and the stored event string still names the old one.
 *
 * **A span becomes two rows, not one row with a duration.** Lee's framing during shaping:
 * "The idea for this dates grid is more to be a chronology… If I want to see the start and end
 * date together for each job, I can go to the jobs page to see that." So a job that ended
 * contributes "Started at Acme" and "Left Acme"; a job you still hold contributes one row.
 * That decision is why `life_events` has no end date at all.
 */

/** The two categories derived rows carry. Fixed, so the set filter can offer them as values. */
export const WORK_CATEGORY = "Work";
export const HOME_CATEGORY = "Home";

type JobDates = {
  id: string;
  employer: string;
  jobTitle: string;
  startDate: string | null;
  endDate: string | null;
};

type ResidenceDates = {
  id: string;
  label: string;
  streetAddress: string;
  extendedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  movedIn: string | null;
  movedOut: string | null;
};

/**
 * Pure so it can be tested without a database — the branching here (null dates, unnamed
 * records, ordering) is where a wrong answer would look plausible.
 */
export function deriveChronology(
  events: readonly LifeEventDetail[],
  jobs: readonly JobDates[],
  residences: readonly ResidenceDates[],
): ChronologyRow[] {
  const rows: ChronologyRow[] = [];

  for (const event of events) {
    rows.push({
      id: `event:${event.id}`,
      dateKey: event.eventDate,
      title: event.title,
      category: event.category,
      notes: event.notes,
      source: "event",
      sourceId: null,
    });
  }

  for (const job of jobs) {
    const employer = job.employer.trim() || "an unnamed employer";
    if (job.startDate) {
      rows.push(jobRow(job, "start", job.startDate, `Started at ${employer}`));
    }
    if (job.endDate) {
      rows.push(jobRow(job, "end", job.endDate, `Left ${employer}`));
    }
  }

  for (const residence of residences) {
    const address = formatPostalAddress(residence);
    const place = residence.city.trim() || residence.label.trim() || "a new address";
    if (residence.movedIn) {
      rows.push(
        residenceRow(residence, "in", residence.movedIn, `Moved to ${place}`, address),
      );
    }
    if (residence.movedOut) {
      rows.push(
        residenceRow(residence, "out", residence.movedOut, `Left ${place}`, address),
      );
    }
  }

  return sortChronology(rows);
}

/**
 * Oldest first — a life reads that way — with a stable tiebreak so two things on the same day
 * do not swap places between renders. The grid can sort however it likes on top of this; this
 * ordering is what it starts from and what a non-grid reader gets.
 */
function sortChronology(rows: ChronologyRow[]): ChronologyRow[] {
  return rows.sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id),
  );
}

function jobRow(
  job: JobDates,
  edge: "start" | "end",
  dateKey: string,
  title: string,
): ChronologyRow {
  return {
    id: `job:${job.id}:${edge}`,
    dateKey,
    title,
    category: WORK_CATEGORY,
    notes: job.jobTitle,
    source: "job",
    sourceId: job.id,
  };
}

function residenceRow(
  residence: ResidenceDates,
  edge: "in" | "out",
  dateKey: string,
  title: string,
  address: string,
): ChronologyRow {
  return {
    id: `residence:${residence.id}:${edge}`,
    dateKey,
    title,
    category: HOME_CATEGORY,
    notes: address,
    source: "residence",
    sourceId: residence.id,
  };
}

/** Every chronology row for one user. Three scoped queries, merged in memory. */
export async function loadChronology(userId: string): Promise<ChronologyRow[]> {
  const [events, jobs, residences] = await Promise.all([
    listLifeEvents(userId),
    listJobDates(userId),
    listResidenceDates(userId),
  ]);
  return deriveChronology(events, jobs, residences);
}
