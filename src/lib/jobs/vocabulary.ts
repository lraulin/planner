/**
 * Suggestions for the two open-vocabulary Job fields.
 *
 * Suggestions, not a closed list — the drawer offers these in a datalist and accepts anything
 * typed. They are not a `pgEnum` because `ALTER TYPE … ADD VALUE` fails on Neon's
 * transaction-mode pooler, so the day a new arrangement needs a name would be the day the
 * migration cannot run in production. `contacts/itemKinds.ts` treats phone and address labels
 * the same way, and for the same reason People does: real data does not fit a closed list.
 */

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Temporary",
  "Internship",
  "Apprenticeship",
  "Self-employed",
  "Volunteer",
  "Seasonal",
] as const;

export const PAY_PERIODS = [
  "Hourly",
  "Weekly",
  "Biweekly",
  "Monthly",
  "Annual",
] as const;
