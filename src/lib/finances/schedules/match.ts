/**
 * Does a transaction satisfy a schedule's conditions for one occurrence date.
 *
 * Date window from Actual's `getScheduleOccurrenceMatchStartDate`
 * (`packages/loot-core/src/shared/schedules.ts`): exact for `date op 'is'` and for
 * `postsTransaction`, otherwise a 2-day lookback, upper-bounded by the occurrence date.
 *
 * Payee conditions hold stable ids. A transaction without a payee cannot satisfy one.
 */

import { shiftDateKey } from "@/lib/schedule/geometry";
import { amountMatches, payeeValues, type ScheduleConds } from "./conditions";

export type MatchCandidate = {
  accountId: string;
  payeeId: string | null;
  description: string;
  amountCents: number;
  transactionDate: string;
  scheduleId: string | null;
  transferGroupId: string | null;
};

export function matchStartDate(
  conds: ScheduleConds,
  occurrenceDate: string,
  postsTransaction: boolean,
): string {
  if (conds.date?.op === "is") return occurrenceDate;
  if (postsTransaction) return occurrenceDate;
  return shiftDateKey(occurrenceDate, -2);
}

export function matchesOccurrence(
  conds: ScheduleConds,
  occurrenceDate: string,
  candidate: MatchCandidate,
  postsTransaction: boolean,
): boolean {
  if (conds.account && candidate.accountId !== conds.account.value) return false;

  const payeeIds = payeeValues(conds.payee);
  if (payeeIds.length > 0) {
    if (!candidate.payeeId || !payeeIds.includes(candidate.payeeId)) return false;
  }

  if (conds.amount && !amountMatches(conds.amount, candidate.amountCents)) return false;

  const start = matchStartDate(conds, occurrenceDate, postsTransaction);
  if (candidate.transactionDate < start || candidate.transactionDate > occurrenceDate) {
    return false;
  }
  return true;
}
