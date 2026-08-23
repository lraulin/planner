/**
 * Map a declared bill onto Actual-shaped schedule conditions.
 *
 * Cadence → RecurConfig; matchers → payee is/oneOf; expectedCents → amount isapprox
 * (signed, negative, because a bill is money out). Only the mapping is here; the
 * idempotent import lives in `mutations.ts`.
 */

import {
  cadenceOf,
  type Cadence,
  type StoredBill,
} from "@/lib/finances/recurringBills";
import type { ScheduleCondition } from "./conditions";
import { extractScheduleConds } from "./conditions";
import { initialNextDate } from "./nextDate";
import type { RecurConfig } from "./recur";

export type BillForSchedule = StoredBill & {
  id: string;
  matchers: readonly string[];
  status: "active" | "paused" | "cancelled" | "ignored";
};

function recurOf(cadence: Cadence, start: string, dueDay: number | null): RecurConfig {
  const config: RecurConfig = { start, frequency: "monthly" };
  if (cadence.unit === "day") {
    if (cadence.n % 7 === 0) {
      config.frequency = "weekly";
      config.interval = cadence.n / 7;
    } else {
      config.frequency = "daily";
      config.interval = cadence.n;
    }
    return config;
  }
  if (cadence.n === 12) {
    config.frequency = "yearly";
    config.interval = 1;
  } else {
    config.frequency = "monthly";
    config.interval = cadence.n;
  }
  if (dueDay != null) {
    config.patterns = [{ type: "day", value: dueDay }];
  }
  return config;
}

/**
 * Conditions a bill would import as. `todayKey` is the start when the bill has no
 * `anchorDate` — the recurrence engine needs a DTSTART and today is the honest one.
 */
export function billToScheduleConditions(
  bill: BillForSchedule,
  todayKey: string,
): ScheduleCondition[] {
  const start = bill.anchorDate ?? todayKey;
  const dueDay = "dueDay" in bill ? bill.dueDay : null;
  const conditions: ScheduleCondition[] = [
    {
      field: "date",
      op: "isapprox",
      value: recurOf(cadenceOf(bill), start, dueDay),
    },
  ];
  const matchers = bill.matchers.filter((entry) => entry !== "");
  if (matchers.length === 1) {
    conditions.push({ field: "payee", op: "is", value: matchers[0] });
  } else if (matchers.length > 1) {
    conditions.push({ field: "payee", op: "oneOf", value: [...matchers] });
  }
  if (bill.expectedCents != null) {
    conditions.push({
      field: "amount",
      op: "isapprox",
      value: -Math.abs(bill.expectedCents),
    });
  }
  return conditions;
}

export type BillDrift = {
  cadence: boolean;
  amount: boolean;
  nextDue: boolean;
};

function sameRecur(a: RecurConfig, b: RecurConfig): boolean {
  return (
    a.frequency === b.frequency &&
    (a.interval ?? 1) === (b.interval ?? 1) &&
    JSON.stringify(a.patterns ?? []) === JSON.stringify(b.patterns ?? [])
  );
}

/**
 * Whether the schedule has drifted from the bill it was imported from.
 *
 * Cadence, amount and next-due — the three facts the user already maintains on the bill.
 * Payee spelling changes are not drift: they are curation, and the schedule copied them.
 */
export function billDrift(
  schedule: { conditions: readonly ScheduleCondition[]; nextDate: string },
  bill: BillForSchedule,
  todayKey: string,
): BillDrift {
  const mapped = extractScheduleConds(billToScheduleConditions(bill, todayKey));
  const current = extractScheduleConds([...schedule.conditions]);
  const mappedDate =
    mapped.date && typeof mapped.date.value !== "string" ? mapped.date.value : null;
  const currentDate =
    current.date && typeof current.date.value !== "string" ? current.date.value : null;
  const cadence =
    mappedDate == null || currentDate == null
      ? true
      : !sameRecur(mappedDate, currentDate);
  const amount =
    mapped.amount?.op !== current.amount?.op ||
    mapped.amount?.value !== current.amount?.value;
  const expectedNext = mappedDate
    ? initialNextDate(mappedDate, todayKey)
    : schedule.nextDate;
  return { cadence, amount, nextDue: schedule.nextDate !== expectedNext };
}
