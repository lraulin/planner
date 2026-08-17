import { describe, expect, it } from "vitest";
import { googleCalendarEventUrl } from "./eventUrl";

describe("googleCalendarEventUrl", () => {
  it("encodes event id and calendar id the way Google's htmlLink does", () => {
    const url = googleCalendarEventUrl("evt-standup", "primary");
    expect(url.startsWith("https://calendar.google.com/calendar/event?eid=")).toBe(
      true,
    );
    const eid = url.slice(url.indexOf("eid=") + 4);
    const padded = eid.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    expect(atob(padded + pad)).toBe("evt-standup primary");
  });
});
