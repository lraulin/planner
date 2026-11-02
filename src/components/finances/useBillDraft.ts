"use client";

import { useState } from "react";
import { parseAmountEntryCents } from "@/lib/finances/money";
import { nextDueFrom, type Cadence } from "@/lib/finances/recurringBills";

/**
 * The draft of a bill being declared from a merchant's charges — the Register's Track as bill
 * and the Budget's recurring-charge review. Changing the cadence moves the next charge date
 * along with it until the user sets that date themselves.
 */
export function useBillDraft(
  seed: {
    name: string;
    cadence: Cadence;
    expectedCents: number;
    lastChargeOn: string;
    nextDueKey: string;
  },
  todayKey: string,
) {
  const initialAmount = (seed.expectedCents / 100).toFixed(2);
  const [name, setName] = useState(seed.name);
  const [cadence, setCadence] = useState(seed.cadence);
  const [amount, setAmount] = useState(initialAmount);
  const [next, setNext] = useState(seed.nextDueKey);
  const [nextTouched, setNextTouched] = useState(false);
  const cents = parseAmountEntryCents(amount);

  return {
    name,
    setName,
    cadence,
    changeCadence(value: Cadence) {
      setCadence(value);
      if (!nextTouched) setNext(nextDueFrom(seed.lastChargeOn, value, todayKey));
    },
    amount,
    setAmount,
    next,
    changeNext(value: string) {
      setNextTouched(true);
      setNext(value);
    },
    dirty:
      name !== seed.name ||
      cadence !== seed.cadence ||
      amount !== initialAmount ||
      nextTouched,
    /** The bill as the track-as-bill action takes it; unscheduled bills carry no date. */
    edit(scheduled: boolean) {
      return {
        name: name.trim(),
        cadence,
        expectedCents: cents !== null && cents > 0 ? cents : null,
        anchorDate: scheduled ? next || null : null,
        scheduled,
      };
    },
  };
}
