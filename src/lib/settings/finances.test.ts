import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUDGET,
  DEFAULT_PAYDAY,
  parseBudget,
  parsePayday,
  serializeBudget,
  serializePayday,
} from "./finances";

describe("parsePayday", () => {
  it("defaults to detection when nothing is stored", () => {
    expect(parsePayday(undefined)).toEqual(DEFAULT_PAYDAY);
    expect(parsePayday(null)).toEqual(DEFAULT_PAYDAY);
    expect(parsePayday("2026-08-03")).toEqual(DEFAULT_PAYDAY);
  });

  it("round-trips a stored override", () => {
    const stored = serializePayday({ anchorDate: "2026-08-03", cadenceDays: 14 });
    expect(parsePayday(stored)).toEqual({ anchorDate: "2026-08-03", cadenceDays: 14 });
  });

  it("rejects an anchor that is not a calendar day", () => {
    // Honouring a typo would move the day count to somewhere nobody chose, and the day count
    // is what the whole page is read for.
    expect(
      parsePayday({ anchorDate: "next friday", cadenceDays: 14 }).anchorDate,
    ).toBeNull();
    expect(
      parsePayday({ anchorDate: "2026-8-3", cadenceDays: 14 }).anchorDate,
    ).toBeNull();
    expect(
      parsePayday({ anchorDate: 20260803, cadenceDays: 14 }).anchorDate,
    ).toBeNull();
  });

  it("rejects a cadence that would loop or never advance", () => {
    // nextPayday walks forward by this. Zero or negative never reaches today.
    expect(
      parsePayday({ anchorDate: "2026-08-03", cadenceDays: 0 }).cadenceDays,
    ).toBeNull();
    expect(
      parsePayday({ anchorDate: "2026-08-03", cadenceDays: -14 }).cadenceDays,
    ).toBeNull();
    expect(
      parsePayday({ anchorDate: "2026-08-03", cadenceDays: 14.5 }).cadenceDays,
    ).toBeNull();
    expect(
      parsePayday({ anchorDate: "2026-08-03", cadenceDays: 400 }).cadenceDays,
    ).toBeNull();
  });

  it("keeps a half-filled override half-filled rather than completing it", () => {
    // Defaulting the missing cadence to a fortnight would invent the half the user did not
    // give, and `nextPayday` falls back to detection only because this stays null.
    expect(parsePayday({ anchorDate: "2026-08-03" })).toEqual({
      anchorDate: "2026-08-03",
      cadenceDays: null,
    });
  });
});

describe("parseBudget", () => {
  it("reads an unset budget as not yet set up", () => {
    // Null startMonth is the empty state, and the only thing separating "no budget" from
    // "a budget with nothing assigned".
    expect(parseBudget(undefined)).toEqual(DEFAULT_BUDGET);
    expect(parseBudget(null)).toEqual(DEFAULT_BUDGET);
    expect(parseBudget("2026-08-01")).toEqual(DEFAULT_BUDGET);
    expect(DEFAULT_BUDGET.startMonth).toBeNull();
  });

  it("round-trips a configured budget", () => {
    const settings = { startMonth: "2026-08-01", openingCents: -30_142 };
    expect(parseBudget(serializeBudget(settings))).toEqual(settings);
  });

  it("keeps a negative opening position", () => {
    // Card balances are on-budget, so starting in the hole is the honest case and must
    // survive the codec rather than being clamped to something more comfortable.
    expect(parseBudget({ startMonth: "2026-08-01", openingCents: -125_00 })).toEqual({
      startMonth: "2026-08-01",
      openingCents: -125_00,
    });
  });

  it("rejects a start that is not the first of a month", () => {
    // Allocations store `month` as YYYY-MM-01. A mid-month start would make the fold's
    // month arithmetic disagree with every row it reads.
    expect(
      parseBudget({ startMonth: "2026-08-15", openingCents: 100 }).startMonth,
    ).toBeNull();
    expect(
      parseBudget({ startMonth: "2026-08", openingCents: 100 }).startMonth,
    ).toBeNull();
    expect(
      parseBudget({ startMonth: 20260801, openingCents: 100 }).startMonth,
    ).toBeNull();
  });

  it("rejects a fractional opening figure", () => {
    // Cents are integers throughout this module; a fraction here poisons every balance
    // derived from the opening position.
    expect(
      parseBudget({ startMonth: "2026-08-01", openingCents: 100.5 }).openingCents,
    ).toBe(0);
    expect(
      parseBudget({ startMonth: "2026-08-01", openingCents: "100" }).openingCents,
    ).toBe(0);
  });
});
