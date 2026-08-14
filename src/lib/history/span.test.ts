import { describe, expect, it } from "vitest";
import { spanDuration } from "./span";

describe("spanDuration", () => {
  it("measures a closed span without needing to know today", () => {
    // The server can render this one; only an ongoing span has to wait for the client.
    expect(spanDuration({ start: "2019-03-01", end: "2022-06-30" }, null)).toEqual({
      text: "3y 3m 29d",
      days: 1217,
      ongoing: false,
    });
  });

  it("measures an open span against today", () => {
    expect(spanDuration({ start: "2024-08-13", end: null }, "2026-08-13")).toEqual({
      text: "2y 0m 0d",
      days: 730,
      ongoing: true,
    });
  });

  it("reports an open span as ongoing even when today is unknown", () => {
    // The grid still wants to say "current" before hydration; it just cannot say how long.
    expect(spanDuration({ start: "2024-08-13", end: null }, null)).toEqual({
      text: null,
      days: null,
      ongoing: true,
    });
  });

  it("has nothing to measure without a start date", () => {
    expect(spanDuration({ start: null, end: "2022-06-30" }, "2026-08-13")).toEqual({
      text: null,
      days: null,
      ongoing: false,
    });
    expect(spanDuration({ start: null, end: null }, "2026-08-13")).toEqual({
      text: null,
      days: null,
      ongoing: false,
    });
  });

  it("has nothing to measure for a span that has not started", () => {
    expect(spanDuration({ start: "2027-01-01", end: null }, "2026-08-13")).toEqual({
      text: null,
      days: null,
      ongoing: true,
    });
  });

  it("gives days that sort spans the date alone would order wrongly", () => {
    // The reason `days` is on the row at all: a short old span must not outrank a long new one.
    const short = spanDuration({ start: "2000-01-01", end: "2001-01-01" }, null);
    const long = spanDuration({ start: "2010-01-01", end: "2020-01-01" }, null);
    expect(short.days).toBeLessThan(long.days ?? 0);
  });
});
