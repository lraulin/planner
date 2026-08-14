import type { SpanDuration } from "@/lib/history/span";

/** The complete Job record — everything the drawer edits and the grid summarises. */
export type JobDetail = {
  id: string;
  employer: string;
  jobTitle: string;
  employmentType: string;
  /** `YYYY-MM-DD`, or null while unknown. */
  startDate: string | null;
  /** `YYYY-MM-DD`. Null means this is the current job. */
  endDate: string | null;
  duties: string;
  reasonForLeaving: string;
  /** A `numeric` string, never a float. See `moneyOrNull`. */
  startingPay: string | null;
  endingPay: string | null;
  payPeriod: string;
  phone: string;

  streetAddress: string;
  extendedAddress: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  countryCode: string;

  supervisorName: string;
  supervisorTitle: string;
  supervisorPhone: string;
  supervisorEmail: string;
  mayContactSupervisor: boolean;

  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * What the server sends. Duration is **not** here: an ongoing job is measured against today,
 * and only the client knows what day that is.
 */
export type JobListRow = JobDetail & {
  /** The employer's city and country, for the grid's one location column. */
  location: string;
};

/**
 * What the grid renders — the server row plus the duration the view derived once it knew the
 * day. It sits on the row rather than in the column context because `ColumnDef.sortValue`
 * receives only the row, and duration cannot be sorted by any stored column.
 */
export type JobGridRow = JobListRow & {
  duration: SpanDuration;
};

/**
 * Partial structured edit; an omitted field is left alone rather than blanked.
 *
 * That distinction is load-bearing here: the drawer has four tabs and saves the whole form,
 * but the grid's inline edits and any future importer send one field at a time.
 */
export type JobInput = {
  employer?: string;
  jobTitle?: string;
  employmentType?: string;
  startDate?: string | null;
  endDate?: string | null;
  duties?: string;
  reasonForLeaving?: string;
  startingPay?: string | null;
  endingPay?: string | null;
  payPeriod?: string;
  phone?: string;

  streetAddress?: string;
  extendedAddress?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;

  supervisorName?: string;
  supervisorTitle?: string;
  supervisorPhone?: string;
  supervisorEmail?: string;
  mayContactSupervisor?: boolean;

  notes?: string;
};
