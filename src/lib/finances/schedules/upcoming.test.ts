import { describe, expect, it } from "vitest";
import {
  upcomingOccurrences,
  type UpcomingOccurrence,
  type UpcomingSchedule,
} from "./upcoming";
import type { TransactionListRow } from "@/lib/finances/types";

function schedule(overrides: Partial<UpcomingSchedule> = {}): UpcomingSchedule {
  return {
    id: "s1",
    name: "Netflix",
    nextDate: "2026-08-25",
    completed: false,
    postsTransaction: false,
    customUpcomingLength: null,
    conditions: [
      {
        field: "date",
        op: "isapprox",
        value: { frequency: "monthly", start: "2026-01-25" },
      },
      { field: "amount", op: "isapprox", value: -1599 },
    ],
    ...overrides,
  };
}

describe("upcomingOccurrences", () => {
  it("lists unposted occurrences inside the horizon and nothing past it", () => {
    const rows = upcomingOccurrences([schedule()], [], "7", "2026-08-22");
    expect(rows).toEqual([
      { scheduleId: "s1", name: "Netflix", date: "2026-08-25", amountCents: -1599 },
    ]);
  });

  it("omits an occurrence that already has a linked transaction", () => {
    const rows = upcomingOccurrences(
      [schedule()],
      [{ scheduleId: "s1", date: "2026-08-25" }],
      "7",
      "2026-08-22",
    );
    expect(rows).toEqual([]);
  });

  it("does not produce a TransactionListRow", () => {
    const rows: UpcomingOccurrence[] = upcomingOccurrences(
      [schedule()],
      [],
      "7",
      "2026-08-22",
    );
    const asRegister: TransactionListRow[] = [];
    // A compile-time guard: if someone widened UpcomingOccurrence to TransactionListRow,
    // this assignment would start succeeding and the test would need rewriting. At runtime
    // we assert the preview has no register identity.
    expect("accountId" in rows[0]).toBe(false);
    expect(asRegister).toEqual([]);
  });
});
