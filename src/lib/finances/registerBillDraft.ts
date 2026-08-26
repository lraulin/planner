/**
 * Turning a Register row into a bill declaration the user can confirm.
 *
 * Detection on Commitments Review will not propose a merchant with one charge, a
 * semi-annual gap, or a wild amount. The person looking at the row still knows it is a
 * bill. This module is the prefill for that confirmation: the merchant's spend history
 * already on the Register, a cleaned name, and a cadence guess they can correct.
 *
 * Propose, never apply — the write is `upsertBillEnvelope`, and this file does not call it.
 */

import { daysBetweenKeys } from "@/lib/schedule/geometry";
import { amountMatches } from "./amountMatch";
import { effectiveFlow, effectiveMerchant, spendCentsOf } from "./analytics";
import { normalizeMerchant } from "./classify/merchant";
import {
  payeeClaimIndex,
  suggestCommitmentName,
  type StoredBillRow,
} from "./commitments";
import { flowLabel } from "./flowLabels";
import {
  cadenceFromGapDays,
  detectCadence,
  nextDueFrom,
  type Cadence,
} from "./recurringBills";
import type { TransactionListRow } from "./types";

export type ClaimedPayee = {
  payeeId: string;
  merchant: string;
  name: string;
};

export type TrackAsBillDraft = {
  /** Null when this row has a merchant but no payee yet — minted on confirm. */
  payeeId: string | null;
  transactionId: string;
  merchant: string;
  name: string;
  cadence: Cadence;
  expectedCents: number;
  /** This row's spend — the amount the bill will match, not the payee's median. */
  matchAmountCents: number;
  lastChargeOn: string;
  nextDueKey: string;
  /** Charges at about `matchAmountCents`, which is what confirming will file. */
  chargeCount: number;
  /** Spend charges on this merchant/payee, including other amounts. */
  merchantChargeCount: number;
};

/** Compact claimed list for the Register: stable payee → the bill envelope that holds it. */
export function claimedPayeesOf(bills: readonly StoredBillRow[]): ClaimedPayee[] {
  return [...payeeClaimIndex(bills).entries()].map(([payeeId, ref]) => ({
    payeeId,
    merchant:
      bills.flatMap((bill) => bill.payees).find((payee) => payee.id === payeeId)
        ?.name ?? "Payee",
    name: ref.name,
  }));
}

export function claimedPayeeMap(
  claimed: readonly ClaimedPayee[],
): Map<string, ClaimedPayee> {
  return new Map(claimed.map((entry) => [entry.payeeId, entry]));
}

/**
 * Why **Track as bill…** cannot run on this row, or null when it can.
 *
 * The command reads this for `disabled` / `title`. A missing row is a group header or a
 * stale id; a non-spend flow is named so the reason is the column the user can see.
 */
export function trackAsBillRefusal(
  row: TransactionListRow | undefined,
  claimed: ReadonlyMap<string, ClaimedPayee>,
): string | null {
  if (row === undefined) return "Select a transaction";
  const flow = effectiveFlow(row);
  if (flow !== "spend") return `${flowLabel(flow)} cannot be a bill`;
  if (row.payeeId === null && normalizeMerchant(row.description) === "") {
    return "This row has no merchant to match";
  }
  const holder = row.payeeId === null ? undefined : claimed.get(row.payeeId);
  if (holder === undefined) return null;
  return `Already tracked as ${holder.name}`;
}

/**
 * Prefill for the confirmation dialog, from spend charges of this merchant at this amount.
 *
 * `PP*APPLE.COM/BILL` is every Apple Store product. Counting the whole payee would treat
 * a $9.99 subscription as 299 mixed charges. Confirming files the similar-amount subset.
 *
 * Cadence is a guess: `detectCadence` first (the only thing that can tell a 28-day autoship
 * from rent), then the median gap snapped to a standard month cadence, then monthly. One
 * charge has no gap, so it opens monthly with this amount — the user is looking at the row
 * because they know the cadence Review cannot see.
 */
export function trackAsBillDraft(
  rows: readonly TransactionListRow[],
  selectedId: string,
  todayKey: string,
): TrackAsBillDraft {
  const selected = rows.find((row) => row.id === selectedId);
  if (selected === undefined) {
    throw new Error("Select a transaction");
  }
  const merchant = effectiveMerchant(selected);
  if (selected.payeeId === null && merchant === "") {
    throw new Error("This row has no merchant to match");
  }
  const matchAmountCents = Math.max(0, spendCentsOf(selected));
  const sameMerchant = rows.filter((row) => {
    if (effectiveFlow(row) !== "spend") return false;
    if (selected.payeeId !== null) return row.payeeId === selected.payeeId;
    return effectiveMerchant(row) === merchant;
  });
  const charges = sameMerchant
    .filter((row) => amountMatches(spendCentsOf(row), matchAmountCents))
    .sort((left, right) => left.transactionDate.localeCompare(right.transactionDate));
  const dates = charges.map((row) => row.transactionDate);
  const typicalGap = medianGapDays(dates);
  const cadence = detectCadence(dates) ??
    (typicalGap !== null ? cadenceFromGapDays(typicalGap) : null) ?? {
      unit: "month",
      n: 1,
    };
  const amounts = charges.map(spendCentsOf).filter((cents) => cents > 0);
  const expectedCents =
    amounts.length > 0 ? median(amounts) : Math.max(0, spendCentsOf(selected));
  const lastChargeOn = dates[dates.length - 1] ?? selected.transactionDate;
  return {
    payeeId: selected.payeeId,
    transactionId: selected.id,
    merchant,
    name: suggestCommitmentName(merchant),
    cadence,
    expectedCents,
    matchAmountCents,
    lastChargeOn,
    nextDueKey: nextDueFrom(lastChargeOn, cadence, todayKey),
    chargeCount: charges.length,
    merchantChargeCount: sameMerchant.length,
  };
}

function medianGapDays(dates: readonly string[]): number | null {
  if (dates.length < 2) return null;
  const gaps: number[] = [];
  for (let index = 1; index < dates.length; index++) {
    gaps.push(daysBetweenKeys(dates[index - 1], dates[index]));
  }
  return median(gaps);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
