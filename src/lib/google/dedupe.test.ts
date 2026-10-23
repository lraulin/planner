import { describe, expect, it } from "vitest";
import { findDuplicateEvent, titlesMatch, titleWords } from "./dedupe";
import type { GoogleEvent } from "./mapping";

/** The Oct 9 CAC appointment as Google held it before Planner wrote a second copy. */
function cacEvent(over: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "4pos7m47qcbm6jdql7s0jgmim0",
    status: "confirmed",
    summary: "CAC renewal – NAS Pax River (conf 0013347729)",
    description: "Call 443-684-8939 if late.",
    start: { dateTime: "2026-10-09T08:45:00-04:00", timeZone: "America/New_York" },
    end: { dateTime: "2026-10-09T10:00:00-04:00", timeZone: "America/New_York" },
    etag: '"3500000000000000"',
    updated: "2026-10-05T11:48:00.000Z",
    ...over,
  };
}

const candidate = {
  subject: "CAC appointment",
  startAt: new Date("2026-10-09T12:45:00Z"),
  endAt: new Date("2026-10-09T14:00:00Z"),
  allDay: false,
};

describe("titlesMatch", () => {
  it("matches a paraphrase that shares a meaningful word", () => {
    expect(titlesMatch("CAC appointment", "CAC renewal – NAS Pax River")).toBe(true);
  });

  it("ignores case, accents and punctuation", () => {
    expect(titleWords("Café — Déjà vu!")).toEqual(["cafe", "deja", "vu"]);
    expect(titlesMatch("Dentist", "dentist.")).toBe(true);
  });

  it("does not match on generic words alone", () => {
    expect(titlesMatch("Doctor appointment", "Vet appointment")).toBe(false);
    expect(titlesMatch("Team meeting", "Board meeting")).toBe(false);
  });

  it("does not match on short words alone", () => {
    expect(titlesMatch("Go to DC", "DC trip prep at go")).toBe(false);
  });
});

describe("findDuplicateEvent", () => {
  it("finds the event at the same times with a matching title", () => {
    const found = findDuplicateEvent(candidate, [cacEvent()], "primary@x");
    expect(found).toMatchObject({
      externalId: "4pos7m47qcbm6jdql7s0jgmim0",
      externalCalendarId: "primary@x",
      // Google's copy wins: it is the richer one.
      subject: "CAC renewal – NAS Pax River (conf 0013347729)",
      notes: "Call 443-684-8939 if late.",
    });
  });

  it("requires the same start and end", () => {
    const later = cacEvent({
      end: { dateTime: "2026-10-09T10:15:00-04:00", timeZone: "America/New_York" },
    });
    expect(findDuplicateEvent(candidate, [later], "primary@x")).toBeNull();
  });

  it("requires a matching title", () => {
    const other = cacEvent({ summary: "Dentist" });
    expect(findDuplicateEvent(candidate, [other], "primary@x")).toBeNull();
  });

  it("never matches a cancelled event", () => {
    const cancelled = cacEvent({ status: "cancelled" });
    expect(findDuplicateEvent(candidate, [cancelled], "primary@x")).toBeNull();
  });

  it("does not match a timed candidate to an all-day event", () => {
    const allDay = cacEvent({
      start: { date: "2026-10-09" },
      end: { date: "2026-10-10" },
    });
    expect(findDuplicateEvent(candidate, [allDay], "primary@x")).toBeNull();
  });

  it("matches all-day events by day", () => {
    const allDay = cacEvent({
      summary: "Septic inspection – Long Wolf (time TBD)",
      start: { date: "2026-10-05" },
      end: { date: "2026-10-06" },
    });
    const found = findDuplicateEvent(
      {
        subject: "Septic inspection",
        startAt: new Date("2026-10-05T12:00:00Z"),
        endAt: new Date("2026-10-06T12:00:00Z"),
        allDay: true,
      },
      [allDay],
      "primary@x",
    );
    expect(found?.externalId).toBe("4pos7m47qcbm6jdql7s0jgmim0");
  });
});
