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
  startingPay: number | null;
  endingPay: number | null;
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

/** One Jobs grid row: the record plus the two values the grid computes rather than stores. */
export type JobListRow = JobDetail & {
  /** The employer's city and country, for the grid's one location column. */
  location: string;
  /** `"3y 2m 14d"`, or null when the job has no start date to measure from. */
  duration: string | null;
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
  startingPay?: number | null;
  endingPay?: number | null;
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
