/**
 * Finding the paychecks in a history that changed employers.
 *
 * Calendar months lie about income when pay is biweekly: 26 deposits a year means some
 * months hold three and look wildly positive. That only works as a signal if the deposits
 * themselves have been identified. The employer here changed twice — Endava, then TrustedQA
 * under two bank wordings — so a merchant constant would report the job ending every time
 * the feed renamed the payer.
 *
 * So this module looks at **cadence**, not at names. Credits from one normalized merchant
 * that arrive about every 14 days are a paycheck series; a monthly VA benefit, an irregular
 * sweep from an old credit union, and a one-off Coinbase sale are not. TrustedQA's DIRDEP
 * and PAYROLL spellings already collapse in `merchant.ts`, which is what makes that job
 * one series instead of two.
 *
 * Transfers are someone else's job. A biweekly "Paycheck Percentage Transfer" into savings
 * has the same cadence as the paycheck it was split from; the caller withholds anything
 * `matchTransfers` already claimed, or those splits become a second invented job.
 *
 * Named monthly income (VA benefits) is claimed in `rules.ts`. This detector will never
 * see a ~30-day series, and that is deliberate — folding a monthly benefit into the
 * biweekly median would quietly deflate `median × 26 ÷ 12`.
 */

import { daysBetweenKeys } from "@/lib/schedule/geometry";
import { normalizeMerchant } from "./merchant";

/** Typical gap between biweekly paydays. Holiday posting drifts a few days either side. */
export const BIWEEKLY_DAYS = 14;
const BIWEEKLY_GAP_MIN = 12;
const BIWEEKLY_GAP_MAX = 16;

/** Three paydays give two gaps — the smallest series whose median cadence means anything. */
const MIN_PAYDAYS = 3;

export type IncomeRow = {
  id: string;
  /** `YYYY-MM-DD`. */
  transactionDate: string;
  description: string;
  amountCents: number;
};

export type Payday = {
  /** `YYYY-MM-DD` the deposits posted. */
  dateKey: string;
  /** Normalized merchant — the employer, after payroll suffixes are stripped. */
  employer: string;
  /** Same-day deposits from this employer, summed. A bonus that posts with the check
   * belongs on the same payday so it does not become its own period. */
  amountCents: number;
  transactionIds: string[];
};

export type IncomeDetection = {
  /** Transaction id → `income` for every credit that belongs to a detected series. */
  flows: Map<string, "income">;
  /** One entry per employer per calendar day, earliest first. */
  paydays: Payday[];
  /** Median payday total across the whole history, in cents. */
  medianPaycheckCents: number;
  /** `median(paycheck) × 26 ÷ 12` — the stable monthly figure months cannot give. */
  normalizedMonthlyIncomeCents: number;
};

/**
 * The monthly equivalent of a biweekly paycheck. 26 deposits a year, spread over 12
 * months, so a three-paycheck calendar month and a two-paycheck one report the same need.
 */
export function normalizedMonthlyIncome(medianPaycheckCents: number): number {
  return Math.round((medianPaycheckCents * 26) / 12);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianCents(values: readonly number[]): number {
  return Math.round(median(values));
}

function isBiweekly(gaps: readonly number[]): boolean {
  if (gaps.length < MIN_PAYDAYS - 1) return false;
  const typical = median(gaps);
  return typical >= BIWEEKLY_GAP_MIN && typical <= BIWEEKLY_GAP_MAX;
}

function paydaysOf(rows: readonly IncomeRow[], employer: string): Payday[] {
  const byDate = new Map<string, IncomeRow[]>();
  const ordered = [...rows].sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) ||
      left.id.localeCompare(right.id),
  );
  for (const row of ordered) {
    const bucket = byDate.get(row.transactionDate);
    if (bucket) bucket.push(row);
    else byDate.set(row.transactionDate, [row]);
  }

  return [...byDate.entries()].map(([dateKey, group]) => ({
    dateKey,
    employer,
    amountCents: group.reduce((total, row) => total + row.amountCents, 0),
    transactionIds: group.map((row) => row.id),
  }));
}

function gapsBetween(paydays: readonly Payday[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < paydays.length; i++) {
    gaps.push(daysBetweenKeys(paydays[i - 1].dateKey, paydays[i].dateKey));
  }
  return gaps;
}

/**
 * Mark every credit that belongs to a biweekly payday series.
 *
 * `excludeIds` is the set `matchTransfers` already claimed. Without it, a paycheck split
 * into savings looks like a second employer with the same cadence.
 */
export function detectIncome(
  rows: readonly IncomeRow[],
  excludeIds: ReadonlySet<string> = new Set(),
): IncomeDetection {
  const credits = rows.filter((row) => row.amountCents > 0 && !excludeIds.has(row.id));

  const byEmployer = new Map<string, IncomeRow[]>();
  for (const row of credits) {
    const employer = normalizeMerchant(row.description);
    if (employer === "") continue;
    const bucket = byEmployer.get(employer);
    if (bucket) bucket.push(row);
    else byEmployer.set(employer, [row]);
  }

  const flows = new Map<string, "income">();
  const paydays: Payday[] = [];

  for (const [employer, group] of byEmployer) {
    const series = paydaysOf(group, employer);
    if (!isBiweekly(gapsBetween(series))) continue;
    paydays.push(...series);
    for (const payday of series) {
      for (const id of payday.transactionIds) flows.set(id, "income");
    }
  }

  paydays.sort(
    (left, right) =>
      left.dateKey.localeCompare(right.dateKey) ||
      left.employer.localeCompare(right.employer),
  );

  const medianPaycheckCents = medianCents(paydays.map((payday) => payday.amountCents));

  return {
    flows,
    paydays,
    medianPaycheckCents,
    normalizedMonthlyIncomeCents: normalizedMonthlyIncome(medianPaycheckCents),
  };
}
