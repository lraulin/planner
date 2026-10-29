import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFS,
  parseNotificationPrefs,
  serializeNotificationPrefs,
} from "./notifications";

describe("parseNotificationPrefs", () => {
  it("falls back to defaults for junk", () => {
    expect(parseNotificationPrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(parseNotificationPrefs("on")).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("round-trips a saved choice", () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      bills: false,
      autoReminderDays: 3,
      morningMinute: 7 * 60 + 30,
      projectBlockLeadMinutes: 10 as const,
    };
    expect(parseNotificationPrefs(serializeNotificationPrefs(prefs))).toEqual(prefs);
  });

  // Off is stored as null. Reading null as "absent" would silently turn project-block alerts
  // back on for someone who switched them off.
  it("keeps a stored Off for the project-block lead", () => {
    expect(
      parseNotificationPrefs({ projectBlockLeadMinutes: null }).projectBlockLeadMinutes,
    ).toBeNull();
    expect(parseNotificationPrefs({}).projectBlockLeadMinutes).toBe(0);
  });

  it("rejects a lead that is not on the list and clamps times into the day", () => {
    const parsed = parseNotificationPrefs({
      projectBlockLeadMinutes: 7,
      morningMinute: 5000,
      autoReminderDays: -2,
    });
    expect(parsed.projectBlockLeadMinutes).toBe(0);
    expect(parsed.morningMinute).toBe(24 * 60 - 1);
    expect(parsed.autoReminderDays).toBe(0);
  });
});
