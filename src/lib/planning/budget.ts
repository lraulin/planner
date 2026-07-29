/**
 * Step 4 of the wizard: how the week's available time divides across projects.
 *
 * Achieve runs this per Resource, with a Total Committed / Time Left pair under the grid.
 * We have no resources, so there is one budget for the week — but the arithmetic and the
 * over-commitment case are the same, and they are the part worth getting right: a plan
 * that quietly commits 60 hours to a 40-hour week is the failure this step exists to catch.
 */

export type CommitmentRow = {
  nodeId: string;
  /** Effort still outstanding on the project's subtree, or null when unestimated. */
  effortLeftMinutes: number | null;
  /** What the plan commits to this project this week. */
  committedMinutes: number | null;
};

export type BudgetSummary = {
  availableMinutes: number | null;
  committedMinutes: number;
  /** available − committed. Negative when over-committed; null with no budget set. */
  remainingMinutes: number | null;
  overCommitted: boolean;
  /** Committed as a percentage of available, rounded. Null with no budget set. */
  percentCommitted: number | null;
  /** Rows carrying a commitment, in the order given. */
  committedCount: number;
};

export function summarizeBudget(
  rows: CommitmentRow[],
  availableMinutes: number | null,
): BudgetSummary {
  let committed = 0;
  let committedCount = 0;
  for (const row of rows) {
    // A null commitment is "not decided yet", which is not the same as zero and must not
    // be counted as a decision to spend nothing.
    if (row.committedMinutes == null) continue;
    committed += Math.max(0, row.committedMinutes);
    committedCount += 1;
  }

  const hasBudget = availableMinutes != null && availableMinutes > 0;
  return {
    availableMinutes: availableMinutes ?? null,
    committedMinutes: committed,
    remainingMinutes: hasBudget ? availableMinutes - committed : null,
    overCommitted: hasBudget ? committed > availableMinutes : false,
    percentCommitted: hasBudget
      ? Math.round((committed / availableMinutes) * 100)
      : null,
    committedCount,
  };
}

/**
 * What a row's Time % column shows: this project's share of the week's budget.
 * Achieve puts it beside Time Committed so you can see a single project eating the week.
 */
export function commitmentPercent(
  committedMinutes: number | null,
  availableMinutes: number | null,
): number | null {
  if (committedMinutes == null) return null;
  if (availableMinutes == null || availableMinutes <= 0) return null;
  return Math.round((committedMinutes / availableMinutes) * 100);
}

/**
 * The commitment to offer when a row has never been given one: the project's outstanding
 * effort, capped so a 40-hour project does not swallow a week on the first keystroke.
 * Rounded to a quarter hour because that is the calendar's snap.
 */
export function suggestCommitment(
  effortLeftMinutes: number | null,
  availableMinutes: number | null,
): number {
  if (!effortLeftMinutes || effortLeftMinutes <= 0) return 0;
  const cap =
    availableMinutes && availableMinutes > 0
      ? Math.floor(availableMinutes / 2)
      : 8 * 60;
  return Math.round(Math.min(effortLeftMinutes, cap) / 15) * 15;
}
