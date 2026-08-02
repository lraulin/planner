import { describe, expect, it } from "vitest";
import { fromDateKey } from "@/lib/schedule/geometry";
import { stateFromDates } from "./stateFromDates";

const TODAY = "2026-03-08";

/** Local midnight — same as DateField and record dates. */
function at(key: string): Date {
  return fromDateKey(key);
}

/** No date changed — the shape every save that touched something else arrives in. */
const NOTHING = {
  current: "not_started" as const,
  completedAt: null,
  deferredUntil: null,
  startedAt: null,
  today: TODAY,
};

describe("stateFromDates", () => {
  it("implies nothing when no date was set", () => {
    expect(stateFromDates(NOTHING)).toBeNull();
  });

  it("completes at the date given, not at now", () => {
    // Lee's case: ticking something off long after it was really done, and correcting the
    // record. The date has to reach the completion path or the history is wrong.
    const backdated = at("2026-02-01");
    expect(stateFromDates({ ...NOTHING, completedAt: backdated })).toEqual({
      state: "completed",
      at: backdated,
    });
  });

  it("does not re-complete a task that is already completed", () => {
    // Backdating a completion on a finished task is a correction, not a second completion —
    // re-running the transition would log another one and cycle a repeating task again.
    expect(
      stateFromDates({
        ...NOTHING,
        current: "completed",
        completedAt: at("2026-02-01"),
      }),
    ).toBeNull();
  });

  it("shelves on a future deferred date", () => {
    expect(stateFromDates({ ...NOTHING, deferredUntil: at("2027-02-15") })).toEqual({
      state: "postponed",
      at: null,
    });
  });

  it("does not shelve on a deferred date that has already passed", () => {
    expect(stateFromDates({ ...NOTHING, deferredUntil: at("2026-03-01") })).toBeNull();
    // Today is not the future: a shelf expiring today is already open.
    expect(stateFromDates({ ...NOTHING, deferredUntil: at(TODAY) })).toBeNull();
  });

  it("does not shelve finished or already-shelved work", () => {
    for (const current of ["completed", "cancelled", "postponed"] as const) {
      expect(
        stateFromDates({ ...NOTHING, current, deferredUntil: at("2027-02-15") }),
      ).toBeNull();
    }
  });

  it("starts a not-started task when its actual start is filled in", () => {
    expect(stateFromDates({ ...NOTHING, startedAt: at("2026-03-07") })).toEqual({
      state: "in_progress",
      at: null,
    });
  });

  it("leaves any other state alone when an actual start is filled in", () => {
    // Correcting when a finished task began must not restart it.
    for (const current of [
      "in_progress",
      "waiting",
      "completed",
      "delegated",
    ] as const) {
      expect(stateFromDates({ ...NOTHING, current, startedAt: at("2026-03-07") })).toBe(
        null,
      );
    }
  });

  it("lets finished beat shelved beat started in one save", () => {
    expect(
      stateFromDates({
        ...NOTHING,
        completedAt: at("2026-03-07"),
        deferredUntil: at("2027-02-15"),
        startedAt: at("2026-03-01"),
      }),
    ).toEqual({ state: "completed", at: at("2026-03-07") });

    expect(
      stateFromDates({
        ...NOTHING,
        deferredUntil: at("2027-02-15"),
        startedAt: at("2026-03-01"),
      }),
    ).toEqual({ state: "postponed", at: null });
  });

  it("treats an unknown today as leaving every shelf in the future", () => {
    expect(
      stateFromDates({ ...NOTHING, today: null, deferredUntil: at("1999-01-01") }),
    ).toEqual({ state: "postponed", at: null });
  });
});
