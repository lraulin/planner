import { describe, expect, it } from "vitest";
import {
  elapsedSince,
  formatDurationClock,
  formatDurationToken,
  parseDurationSeconds,
} from "./duration";

describe("parseDurationSeconds", () => {
  it("reads bare seconds", () => {
    expect(parseDurationSeconds("45")).toBe(45);
    expect(parseDurationSeconds(" 90 ")).toBe(90);
    expect(parseDurationSeconds(90)).toBe(90);
  });

  it("reads m:ss", () => {
    expect(parseDurationSeconds("1:30")).toBe(90);
    expect(parseDurationSeconds("0:45")).toBe(45);
    expect(parseDurationSeconds("10:00")).toBe(600);
    expect(parseDurationSeconds(":30")).toBe(30);
  });

  it("rejects an out-of-range seconds field rather than carrying it", () => {
    // "1:90" is a typo, not 2:30 — reading it as 150 would silently log the wrong hold.
    expect(parseDurationSeconds("1:90")).toBeNull();
  });

  it("treats empty and malformed input as no duration", () => {
    expect(parseDurationSeconds("")).toBeNull();
    expect(parseDurationSeconds("   ")).toBeNull();
    expect(parseDurationSeconds(null)).toBeNull();
    expect(parseDurationSeconds(undefined)).toBeNull();
    expect(parseDurationSeconds("abc")).toBeNull();
    expect(parseDurationSeconds("1:2:3")).toBeNull();
  });

  it("rejects zero, negative and fractional seconds", () => {
    // The column's CHECK enforces the same thing; failing here keeps it a null, not a 500.
    expect(parseDurationSeconds("0")).toBeNull();
    expect(parseDurationSeconds("0:00")).toBeNull();
    expect(parseDurationSeconds("-30")).toBeNull();
    expect(parseDurationSeconds("-1:30")).toBeNull();
    expect(parseDurationSeconds("45.5")).toBeNull();
  });

  it("rejects a duration longer than a day", () => {
    expect(parseDurationSeconds(24 * 60 * 60)).toBe(86400);
    expect(parseDurationSeconds(24 * 60 * 60 + 1)).toBeNull();
  });
});

describe("formatDurationClock", () => {
  it("pads the seconds", () => {
    expect(formatDurationClock(90)).toBe("1:30");
    expect(formatDurationClock(5)).toBe("0:05");
    expect(formatDurationClock(0)).toBe("0:00");
    expect(formatDurationClock(600)).toBe("10:00");
  });

  it("never shows a negative clock", () => {
    expect(formatDurationClock(-5)).toBe("0:00");
  });
});

describe("formatDurationToken", () => {
  it("uses bare seconds below a minute and m:ss at or above", () => {
    expect(formatDurationToken(45)).toBe("45s");
    expect(formatDurationToken(59)).toBe("59s");
    expect(formatDurationToken(60)).toBe("1:00");
    expect(formatDurationToken(90)).toBe("1:30");
  });
});

describe("elapsedSince", () => {
  it("floors to whole seconds", () => {
    expect(elapsedSince(1000, 1000)).toBe(0);
    expect(elapsedSince(1000, 1999)).toBe(0);
    expect(elapsedSince(1000, 46_500)).toBe(45);
  });

  it("clamps a clock that moved backwards", () => {
    expect(elapsedSince(5000, 1000)).toBe(0);
  });
});
