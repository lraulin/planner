/**
 * Does a transaction satisfy a schedule's conditions for one occurrence date.
 *
 * Date window from Actual's `getScheduleOccurrenceMatchStartDate`
 * (`packages/loot-core/src/shared/schedules.ts`): exact for `date op 'is'` and for
 * `postsTransaction`, otherwise a 2-day lookback, upper-bounded by the occurrence date.
 *
 * During the payee cutover, a condition may hold either the legacy merchant string or the
 * replacement payee id. Supporting both in Stage A keeps schedule matching live while the
 * data is rewritten; Stage B removes the merchant branch.
 */

import { effectiveMerchant } from "@/lib/finances/analytics";
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

  const matchers = payeeValues(conds.payee);
  if (matchers.length > 0) {
    const merchant = effectiveMerchant({ description: candidate.description });
    const matchesPayee = candidate.payeeId
      ? matchers.includes(candidate.payeeId)
      : false;
    if (!matchesPayee && !matchers.includes(merchant)) return false;
  }

  if (conds.amount && !amountMatches(conds.amount, candidate.amountCents)) return false;

  const start = matchStartDate(conds, occurrenceDate, postsTransaction);
  if (candidate.transactionDate < start || candidate.transactionDate > occurrenceDate) {
    return false;
  }
  return true;
}
