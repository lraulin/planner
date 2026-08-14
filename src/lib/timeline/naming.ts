/**
 * What to call a job or a residence when the field you would name it by is blank.
 *
 * Shared because the chronology and the ribbon are two drawings of the same records and must
 * agree: "Started at an unnamed employer" in the grid beside a bar labelled "(untitled)" is one
 * record wearing two names. `development/clean-code.md` limits DRY to business rules, and what a
 * record is called when it has no name is one — it is a decision, not a formatting choice.
 *
 * The chronology wraps these in prose ("Started at …", "Moved to …"); the ribbon uses them bare.
 */

/** A residence's short name: its city, else its label, else a placeholder. */
export function residenceName(residence: { label: string; city: string }): string {
  return residence.city.trim() || residence.label.trim() || "a new address";
}

/** A job's short name. */
export function employerName(job: { employer: string }): string {
  return job.employer.trim() || "an unnamed employer";
}
