/**
 * Suggestions for the Residence housing type. Open vocabulary for the same reason as
 * `jobs/vocabulary.ts`: a `pgEnum` cannot grow on Neon's transaction-mode pooler.
 */
export const HOUSING_TYPES = [
  "Rented",
  "Owned",
  "Family home",
  "Dorm",
  "Sublet",
  "Military housing",
  "Temporary",
] as const;
