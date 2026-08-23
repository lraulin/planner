import { describe, expect, it } from "vitest";
import { advanceNextDate, skipNextDate } from "./nextDate";
import type { RecurConfig } from "./recur";

describe("skipNextDate", () => {
  it("advances a weekly Saturday schedule whose weekend-solve landed on Friday", () => {
    // Actual's Dec 2020 fixture: start Saturday 5 Dec, skipWeekend before → next_date is
    // Friday 4 Dec; skip must land on Friday 11 Dec, not silently stay on the 4th.
    const config: RecurConfig = {
      frequency: "weekly",
      start: "2020-12-05",
      skipWeekend: true,
      weekendSolveMode: "before",
    };
    expect(skipNextDate(config, "2020-12-04")).toBe("2020-12-11");
  });

  it("advances an ordinary weekly schedule by one week", () => {
    const config: RecurConfig = { frequency: "weekly", start: "2026-08-03" };
    expect(skipNextDate(config, "2026-08-17")).toBe("2026-08-24");
  });
});

describe("advanceNextDate", () => {
  it("moves past the paid occurrence, not back onto it", () => {
    const config: RecurConfig = { frequency: "monthly", start: "2026-01-15" };
    expect(advanceNextDate(config, "2026-08-15")).toBe("2026-09-15");
  });
});
