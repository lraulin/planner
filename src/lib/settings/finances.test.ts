import { describe, expect, it } from "vitest";
import { DEFAULT_PAYDAY, parsePayday, serializePayday } from "./finances";

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
