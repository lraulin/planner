/**
 * A dated fact that is not a job and not a move — a pet's birthday, a graduation, the day
 * you got the car. There is no end date: see `chronology.ts` for why the Timeline grid is a
 * sequence of points rather than a set of spans.
 */
export type LifeEventDetail = {
  id: string;
  /** `YYYY-MM-DD`. Required — an event with no date has nothing to be. */
  eventDate: string;
  title: string;
  category: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Partial structured edit; an omitted field is left alone rather than blanked. */
export type LifeEventInput = {
  eventDate?: string;
  title?: string;
  category?: string;
  notes?: string;
};

/** Where a chronology row came from. Only `event` rows are editable on the Timeline grid. */
export type ChronologySource = "event" | "job" | "residence";

/**
 * One row of the Timeline grid: one thing that happened, on one day.
 *
 * `id` is composite (`"job:<uuid>:start"`) because the grid needs a stable key per *row* and
 * one job produces two of them. `sourceId` is the underlying record, for the Open command.
 */
export type ChronologyRow = {
  id: string;
  /** `YYYY-MM-DD`. */
  dateKey: string;
  title: string;
  /** Free text on events; a fixed "Work" / "Home" on derived rows. */
  category: string;
  notes: string;
  source: ChronologySource;
  /** The job or residence this was derived from; null on a life event. */
  sourceId: string | null;
};
