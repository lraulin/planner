import { describe, expect, it } from "vitest";

import { fromDateKey, toDateKey } from "@/lib/schedule/geometry";
import { recurrenceAnchor } from "./anchor";

const day = fromDateKey;
const keyOf = (date: Date | null) => (date ? toDateKey(date) : null);

describe("recurrenceAnchor", () => {
  const today = "2026-09-12";

  it("prefers the deadline, even over a deferred date still holding", () => {
    const anchor = recurrenceAnchor(
      {
        deadline: day("2026-09-18"),
        deferredDate: day("2026-09-15"),
        targetStartDate: day("2026-09-14"),
      },
      today,
    );
    expect(keyOf(anchor)).toBe("2026-09-18");
  });

  it("uses a deferred date that has not arrived yet", () => {
    const anchor = recurrenceAnchor(
      {
        deadline: null,
        deferredDate: day("2026-09-13"),
        targetStartDate: day("2026-09-01"),
      },
      today,
    );
    expect(keyOf(anchor)).toBe("2026-09-13");
  });

  it("skips a deferred date that expired long ago for the target start", () => {
    const anchor = recurrenceAnchor(
      {
        deadline: null,
        deferredDate: day("2020-03-02"),
        targetStartDate: day("2026-09-10"),
      },
      today,
    );
    expect(keyOf(anchor)).toBe("2026-09-10");
  });

  it("treats a deferred date of today as expired, since the task is back today", () => {
    const anchor = recurrenceAnchor(
      { deadline: null, deferredDate: day(today), targetStartDate: day("2026-09-05") },
      today,
    );
    expect(keyOf(anchor)).toBe("2026-09-05");
  });

  it("returns null rather than an expired deferred date when nothing else is set", () => {
    // Null is what tells the caller to stand on the completion day instead.
    const anchor = recurrenceAnchor(
      { deadline: null, deferredDate: day("2026-09-01"), targetStartDate: null },
      today,
    );
    expect(anchor).toBeNull();
  });
});
