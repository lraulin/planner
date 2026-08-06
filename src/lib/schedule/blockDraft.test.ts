import { describe, expect, it } from "vitest";
import { defaultBlockRange } from "./blockDraft";
import { fromDateKey, localDateKey, minutesOfDay, weekDays } from "./geometry";

const week = weekDays(fromDateKey("2026-08-02"));

/**
 * A local wall-clock instant on a given day — `Schedule block…` reads "now" as wall clock.
 *
 * The day assertions below use **`localDateKey`**, not `toDateKey`: an appointment start is an
 * instant, and `toDateKey` reads UTC components. Asserting `toDateKey` here passed at 10am and
 * failed at 11pm, which is the encoding mix-up `dates.md` exists to prevent, reproduced in a
 * test in about a minute.
 */
const at = (key: string, hour: number, minute = 0) => {
  const day = fromDateKey(key);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
};

describe("defaultBlockRange", () => {
  it("lands on today when today is in the week, at the next half hour", () => {
    const { start, end } = defaultBlockRange(week, at("2026-08-05", 10, 12), 60);

    expect(localDateKey(start)).toBe(localDateKey(week[3]));
    expect(minutesOfDay(start)).toBe(10 * 60 + 30);
    expect(minutesOfDay(end)).toBe(11 * 60 + 30);
  });

  it("leaves a time already on the half hour where it is", () => {
    // Ceiling, not "add one slot": arriving at 10:00 should propose 10:00.
    const { start } = defaultBlockRange(week, at("2026-08-05", 10, 0), 60);
    expect(minutesOfDay(start)).toBe(10 * 60);
  });

  it("falls back to 9am on the first day when the week does not contain today", () => {
    // Right-clicking a task while looking at next month's week — there is no "now" in it, so
    // the start of the working day is the only honest answer.
    const { start, end } = defaultBlockRange(week, at("2026-09-20", 14), 60);

    expect(localDateKey(start)).toBe(localDateKey(week[0]));
    expect(minutesOfDay(start)).toBe(9 * 60);
    expect(minutesOfDay(end)).toBe(10 * 60);
  });

  it("uses the row's own effort as the duration", () => {
    const { start, end } = defaultBlockRange(week, at("2026-09-20", 14), 150);
    expect(end.getTime() - start.getTime()).toBe(150 * 60_000);
  });

  it("pulls a late block back so it ends at midnight rather than spilling over", () => {
    // The calendar draws to 24:00 and no further, so the overflow would simply not be there.
    const { start, end } = defaultBlockRange(week, at("2026-08-05", 23, 40), 60);

    expect(localDateKey(start)).toBe(localDateKey(week[3]));
    expect(minutesOfDay(start)).toBe(23 * 60);
    expect(end.getTime() - start.getTime()).toBe(60 * 60_000);
  });

  it("never proposes a block shorter than one slot", () => {
    // A task with zero recorded effort would otherwise be a zero-length appointment: invisible
    // on the calendar and impossible to grab.
    const { start, end } = defaultBlockRange(week, at("2026-09-20", 14), 0);
    expect(end.getTime() - start.getTime()).toBe(30 * 60_000);
  });
});
