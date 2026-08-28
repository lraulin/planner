import { describe, expect, it } from "vitest";

import type { AssignHistoryMonth } from "../assign/types";
import { shiftMonthKey } from "../envelope";
import { suggestWeeklyAmountCents } from "./suggest";
import { countWeekdayInMonth } from "./weekly";

const FOOD = "food";
const SUNDAY = 0;

/** `months` back from (but not including) `currentMonth`, each spending `spentCents`. */
function history(
  currentMonth: string,
  months: number,
  spentCents: number | ((month: string) => number),
): AssignHistoryMonth[] {
  const entries: AssignHistoryMonth[] = [];
  for (let offset = months; offset >= 1; offset -= 1) {
    const month = shiftMonthKey(currentMonth, -offset);
    const spent = typeof spentCents === "number" ? spentCents : spentCents(month);
    entries.push({ month, assigned: {}, activity: { [FOOD]: -spent } });
  }
  return entries;
}

function suggest(entries: AssignHistoryMonth[], currentMonth = "2026-08-01") {
  return suggestWeeklyAmountCents({
    history: entries,
    categoryId: FOOD,
    weekday: SUNDAY,
    currentMonth,
  });
}

describe("suggestWeeklyAmountCents", () => {
  it("divides total spend by the weekday occurrences in the same months", () => {
    // Six complete months to August 2026: Feb–Jul.
    const entries = history("2026-08-01", 6, 60_000);
    const sundays = entries.reduce(
      (sum, entry) => sum + countWeekdayInMonth(entry.month, SUNDAY),
      0,
    );
    expect(suggest(entries)).toBe(Math.round((60_000 * 6) / sundays));
  });

  it("gives no suggestion under three qualifying months", () => {
    expect(suggest(history("2026-08-01", 2, 60_000))).toBeNull();
  });

  it("gives no suggestion for an envelope with no spending", () => {
    expect(suggest(history("2026-08-01", 12, 0))).toBeNull();
  });

  it("skips leading zero-activity months rather than averaging them in", () => {
    const entries = history("2026-08-01", 6, (month) =>
      month < "2026-05-01" ? 0 : 60_000,
    );
    const active = entries.filter((entry) => entry.month >= "2026-05-01");
    const sundays = active.reduce(
      (sum, entry) => sum + countWeekdayInMonth(entry.month, SUNDAY),
      0,
    );
    expect(suggest(entries)).toBe(Math.round((60_000 * 3) / sundays));
  });

  it("caps the window at twelve months", () => {
    const twenty = history("2026-08-01", 20, (month) =>
      month < "2025-08-01" ? 100_000 : 60_000,
    );
    const twelve = twenty.slice(-12);
    const sundays = twelve.reduce(
      (sum, entry) => sum + countWeekdayInMonth(entry.month, SUNDAY),
      0,
    );
    expect(suggest(twenty)).toBe(Math.round((60_000 * 12) / sundays));
  });

  it("ignores the in-progress month and anything after it", () => {
    const entries = history("2026-08-01", 6, 60_000);
    const withCurrent = [
      ...entries,
      // August so far: one light week, which must not drag the figure down.
      { month: "2026-08-01", assigned: {}, activity: { [FOOD]: -1_000 } },
    ];
    expect(suggest(withCurrent)).toBe(suggest(entries));
  });

  it("treats income in the envelope as zero spend, not negative", () => {
    const entries = history("2026-08-01", 4, 60_000);
    entries[0] = { month: entries[0].month, assigned: {}, activity: { [FOOD]: 5_000 } };
    const active = entries.slice(1);
    const sundays = active.reduce(
      (sum, entry) => sum + countWeekdayInMonth(entry.month, SUNDAY),
      0,
    );
    expect(suggest(entries)).toBe(Math.round((60_000 * 3) / sundays));
  });
});
