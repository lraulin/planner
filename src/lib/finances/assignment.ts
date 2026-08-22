/**
 * Where checking is assigned — the available-to-spend terms as a composition, not a rank.
 *
 * Insights `CategoryBars` refuses stacked bars because ranking is the question there.
 * This question is the opposite: one pile of checking, claimed by pending, cards, bills,
 * and groceries, with leftover or shortfall as the remainder. The segments are derived
 * from `availableToSpend` so a drawing cannot disagree with the headline.
 */

import type { AvailableToSpend, SetAside } from "./available";

/** Split a named bill out of the bills segment when it is this share of the hold. */
export const LARGE_BILL_SHARE = 0.4;

export type AssignmentRole = "source" | "claim" | "leftover" | "shortfall";

export type AssignmentSegment = {
  label: string;
  /** Magnitude, always ≥ 0. Width is `cents / scaleCents`. */
  cents: number;
  role: AssignmentRole;
};

export type AssignmentBreakdown = {
  checkingCents: number;
  claimCents: number;
  /** `max(checking, claims)` — the bar's 100%. */
  scaleCents: number;
  leftoverCents: number;
  shortfallCents: number;
  /** Checking, then each claim, then leftover or shortfall. */
  segments: AssignmentSegment[];
};

/**
 * Stack the claims against checking.
 *
 * A single bill that is ≥ 40% of the bill hold (rent, in the household this was drawn
 * against) is named so it cannot hide inside "Set aside for bills". Other bills stay one
 * segment; the Bills list is the drill-in.
 */
export function assignmentBreakdown(
  available: AvailableToSpend,
  setAsides: readonly SetAside[] = [],
): AssignmentBreakdown {
  const checkingCents = Math.max(0, available.spendableCents);
  const claims: AssignmentSegment[] = [];

  if (available.pendingCents !== 0) {
    claims.push({
      label: "Pending",
      cents: Math.abs(available.pendingCents),
      role: "claim",
    });
  }
  if (available.cardDebtCents !== 0) {
    claims.push({
      label: "Card balances",
      cents: Math.abs(available.cardDebtCents),
      role: "claim",
    });
  }
  claims.push(...billClaims(available.setAsideCents, setAsides));
  if (available.recurringSpendCents > 0) {
    claims.push({
      label: "Recurring spend",
      cents: available.recurringSpendCents,
      role: "claim",
    });
  }

  const claimCents = claims.reduce((total, segment) => total + segment.cents, 0);
  const leftoverCents = Math.max(0, available.totalCents);
  const shortfallCents = Math.max(0, -available.totalCents);
  const scaleCents = Math.max(checkingCents, claimCents, 1);

  const remainder: AssignmentSegment[] =
    leftoverCents > 0
      ? [{ label: "Left to spend", cents: leftoverCents, role: "leftover" }]
      : shortfallCents > 0
        ? [{ label: "Shortfall", cents: shortfallCents, role: "shortfall" }]
        : [];

  return {
    checkingCents,
    claimCents,
    scaleCents,
    leftoverCents,
    shortfallCents,
    segments: [
      { label: "Checking & cash", cents: checkingCents, role: "source" },
      ...claims,
      ...remainder,
    ],
  };
}

function billClaims(
  setAsideCents: number,
  setAsides: readonly SetAside[],
): AssignmentSegment[] {
  if (setAsideCents <= 0) return [];
  const largest = [...setAsides].sort(
    (left, right) => right.heldCents - left.heldCents,
  )[0];
  if (
    largest !== undefined &&
    largest.heldCents >= Math.round(setAsideCents * LARGE_BILL_SHARE)
  ) {
    const rest = setAsideCents - largest.heldCents;
    const named: AssignmentSegment = {
      label: largest.name,
      cents: largest.heldCents,
      role: "claim",
    };
    if (rest <= 0) return [named];
    return [named, { label: "Other bills", cents: rest, role: "claim" }];
  }
  return [{ label: "Set aside for bills", cents: setAsideCents, role: "claim" }];
}
