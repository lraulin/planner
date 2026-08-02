import { describe, expect, it } from "vitest";
import {
  ACH_PRIORITY_NONE,
  decodeDateTime,
  decodeEffortToMinutes,
  decodePercentComplete,
  decodePriority,
  decodeProgressReview,
  decodeStatus,
  encodeEffortFromMinutes,
  encodePercentComplete,
  encodePriority,
  encodeProgressReview,
  encodeStatus,
} from "./encodings";

describe("decodePriority / encodePriority", () => {
  it("treats 100000 and above as no priority", () => {
    expect(decodePriority(ACH_PRIORITY_NONE)).toEqual({ letter: null, rank: null });
    expect(decodePriority(100001)).toEqual({ letter: null, rank: null });
    expect(decodePriority(null)).toEqual({ letter: null, rank: null });
  });

  it("reads A ranks as the bare int (A1 = 1)", () => {
    expect(decodePriority(1)).toEqual({ letter: "A", rank: 1 });
    expect(decodePriority(2)).toEqual({ letter: "A", rank: 2 });
    expect(decodePriority(12)).toEqual({ letter: "A", rank: 12 });
  });

  it("reads B/C/D bands with bare letter at the band base", () => {
    expect(decodePriority(2500)).toEqual({ letter: "B", rank: null });
    expect(decodePriority(2501)).toEqual({ letter: "B", rank: 1 });
    expect(decodePriority(5000)).toEqual({ letter: "C", rank: null });
    expect(decodePriority(7500)).toEqual({ letter: "D", rank: null });
    expect(decodePriority(7503)).toEqual({ letter: "D", rank: 3 });
  });

  it("round-trips the values we see in real files", () => {
    for (const value of [1, 2, 2500, 2501, 5000, 7500, 100000]) {
      expect(encodePriority(decodePriority(value))).toBe(value === 0 ? 1 : value);
    }
  });

  it("encodes bare A as A1 (files never use 0)", () => {
    expect(encodePriority({ letter: "A", rank: null })).toBe(1);
    expect(encodePriority({ letter: "B", rank: null })).toBe(2500);
  });
});

describe("decodeStatus", () => {
  it("maps the completed code used when IsCompleted is true", () => {
    expect(decodeStatus(3)).toBe("completed");
  });

  it("maps the common open states", () => {
    expect(decodeStatus(0)).toBe("not_started");
    expect(decodeStatus(1)).toBe("in_progress");
  });

  it("falls back to not_started for junk", () => {
    expect(decodeStatus(-1)).toBe("not_started");
    expect(decodeStatus(99)).toBe("not_started");
    expect(decodeStatus(null)).toBe("not_started");
  });

  it("round-trips every known state", () => {
    for (const state of [
      "not_started",
      "in_progress",
      "waiting",
      "completed",
      "postponed",
      "delegated",
      "should_delegate",
      "cancelled",
      "proposed",
    ] as const) {
      expect(decodeStatus(encodeStatus(state))).toBe(state);
    }
  });
});

describe("percent complete", () => {
  it("scales Achieve's 0–10000 down to 0–100", () => {
    expect(decodePercentComplete(0)).toBe(0);
    expect(decodePercentComplete(10000)).toBe(100);
    expect(decodePercentComplete(6000)).toBe(60);
    expect(decodePercentComplete(6923)).toBe(69);
  });

  it("round-trips whole percents", () => {
    for (const p of [0, 1, 50, 100]) {
      expect(decodePercentComplete(encodePercentComplete(p))).toBe(p);
    }
  });
});

describe("effort units", () => {
  it("reads units 0 as minutes and 1 as hours", () => {
    expect(decodeEffortToMinutes(30, 0)).toBe(30);
    expect(decodeEffortToMinutes(2, 1)).toBe(120);
    expect(decodeEffortToMinutes(null, 0)).toBeNull();
  });

  it("prefers hours when encoding exact multi-hour values", () => {
    expect(encodeEffortFromMinutes(120)).toEqual({ amount: 2, units: 1 });
    expect(encodeEffortFromMinutes(45)).toEqual({ amount: 45, units: 0 });
  });
});

describe("decodeProgressReview", () => {
  it("maps Achieve schedule codes", () => {
    expect(decodeProgressReview(0)).toBe("none");
    expect(decodeProgressReview(1)).toBe("weekly");
    expect(decodeProgressReview(2)).toBe("daily");
  });

  it("round-trips", () => {
    for (const v of ["none", "daily", "weekly"] as const) {
      expect(decodeProgressReview(encodeProgressReview(v))).toBe(v);
    }
  });
});

describe("decodeDateTime", () => {
  it("parses Achieve's offset timestamps", () => {
    const d = decodeDateTime("2011-03-02T00:00:00+09:00");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe("2011-03-01T15:00:00.000Z");
  });

  it("returns null for empty input", () => {
    expect(decodeDateTime("")).toBeNull();
    expect(decodeDateTime(null)).toBeNull();
    expect(decodeDateTime("not-a-date")).toBeNull();
  });
});
