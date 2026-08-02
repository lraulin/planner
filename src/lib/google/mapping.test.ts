import { describe, expect, it } from "vitest";
import { toDateKey } from "@/lib/schedule/geometry";
import {
  appointmentToGoogleEvent,
  buildRecurrenceRule,
  byDayToWeekday,
  googleEventToFields,
  readEventTime,
  showAsFromGoogle,
  showAsToGoogle,
  weekdayToByDay,
  writeEventTime,
  type GoogleEvent,
  type RecurrenceFields,
} from "./mapping";

const recurrence = (over: Partial<RecurrenceFields> = {}): RecurrenceFields => ({
  recurrenceFrequency: "weekly",
  recurrenceInterval: 1,
  recurrenceByWeekday: null,
  recurrenceEnd: "never",
  recurrenceCount: null,
  recurrenceUntil: null,
  allDay: false,
  ...over,
});

describe("weekday codes", () => {
  it("maps 0=Sun…6=Sat onto RRULE BYDAY", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(weekdayToByDay)).toEqual([
      "SU",
      "MO",
      "TU",
      "WE",
      "TH",
      "FR",
      "SA",
    ]);
  });

  it("round-trips every weekday", () => {
    for (let day = 0; day < 7; day++) {
      expect(byDayToWeekday(weekdayToByDay(day))).toBe(day);
    }
  });

  it("reads an ordinal-prefixed code, which Google may return", () => {
    expect(byDayToWeekday("3TU")).toBe(2);
    expect(byDayToWeekday("-1FR")).toBe(5);
  });

  it("rejects a weekday outside 0–6 rather than silently wrapping", () => {
    expect(() => weekdayToByDay(7)).toThrow(/out of range/i);
    expect(() => byDayToWeekday("XX")).toThrow(/unrecognised/i);
  });
});

describe("readEventTime", () => {
  // The bug this guards: `new Date("2026-07-27")` parses as UTC midnight, which is
  // 2026-07-26 evening in New York — an all-day event rendering a day early. fromDateKey
  // stores UTC noon so toDateKey is stable on every machine.
  it("reads an all-day date as a stable calendar day, not UTC midnight", () => {
    const at = readEventTime({ date: "2026-07-27" });
    expect(at).not.toBeNull();
    expect(toDateKey(at!)).toBe("2026-07-27");
    expect(at?.getUTCHours()).toBe(12);
  });

  it("reads a timed event from RFC3339", () => {
    const at = readEventTime({ dateTime: "2026-07-27T09:30:00Z" });
    expect(at?.toISOString()).toBe("2026-07-27T09:30:00.000Z");
  });

  it("returns null for a missing or unparseable time", () => {
    expect(readEventTime(undefined)).toBeNull();
    expect(readEventTime({})).toBeNull();
    expect(readEventTime({ dateTime: "not a date" })).toBeNull();
  });
});

describe("writeEventTime", () => {
  it("writes an all-day date back as the same calendar day it was read from", () => {
    const at = readEventTime({ date: "2026-07-27" });
    expect(writeEventTime(at!, true, "America/New_York")).toEqual({
      date: "2026-07-27",
      timeZone: "America/New_York",
    });
  });

  it("passes the exclusive end through unchanged", () => {
    // Google's end.date is exclusive and so is ours, so a one-day event is 27th → 28th
    // both ways. Adjusting on either side would shift the event by a day.
    const end = readEventTime({ date: "2026-07-28" });
    expect(writeEventTime(end!, true, "UTC").date).toBe("2026-07-28");
  });

  it("always names a timezone, which recurring events require", () => {
    // Regression: Google rejected a recurring create with "Missing time zone definition
    // for start time". A UTC offset is not enough — expanding an RRULE across a DST
    // boundary needs a named zone. Caught only against the real API, never by a unit test
    // of our own shapes, so it is pinned here now that we know.
    expect(writeEventTime(new Date(), false, "America/New_York").timeZone).toBe(
      "America/New_York",
    );
    expect(writeEventTime(new Date(), true, "America/New_York").timeZone).toBe(
      "America/New_York",
    );
    expect(writeEventTime(new Date(), false).timeZone).toBeTruthy();
  });
});

describe("showAs mapping", () => {
  it("reads out-of-office, free and busy from Google", () => {
    expect(showAsFromGoogle({ eventType: "outOfOffice" })).toBe("out_of_office");
    expect(showAsFromGoogle({ transparency: "transparent" })).toBe("free");
    expect(showAsFromGoogle({ transparency: "opaque" })).toBe("busy");
    expect(showAsFromGoogle({})).toBe("busy");
  });

  it("writes free as transparent and out-of-office as its own event type", () => {
    expect(showAsToGoogle("free").transparency).toBe("transparent");
    expect(showAsToGoogle("out_of_office").eventType).toBe("outOfOffice");
    expect(showAsToGoogle("busy").transparency).toBe("opaque");
  });

  it("degrades tentative to busy, because Google has no per-event tentative", () => {
    // Documented lossy edge: tentativeness in Google is an attendee response, not a
    // property of the event, so this cannot round-trip and must not pretend to.
    expect(showAsToGoogle("tentative").transparency).toBe("opaque");
    expect(showAsFromGoogle({ transparency: "opaque" })).toBe("busy");
  });
});

describe("googleEventToFields", () => {
  const base: GoogleEvent = {
    id: "evt123",
    etag: '"abc"',
    summary: "Standup",
    location: "Zoom",
    description: "daily",
    start: { dateTime: "2026-07-27T09:00:00Z" },
    end: { dateTime: "2026-07-27T09:15:00Z" },
    updated: "2026-07-26T12:00:00Z",
  };

  it("maps a timed event onto the Google-owned columns", () => {
    const fields = googleEventToFields(base, "cal@example.com");
    expect(fields).toMatchObject({
      subject: "Standup",
      location: "Zoom",
      notes: "daily",
      allDay: false,
      showAs: "busy",
      externalSource: "google",
      externalId: "evt123",
      externalSeriesId: null,
      externalCalendarId: "cal@example.com",
      externalEtag: '"abc"',
    });
    expect(fields?.startAt.toISOString()).toBe("2026-07-27T09:00:00.000Z");
  });

  it("carries recurringEventId through as the series id", () => {
    const fields = googleEventToFields(
      { ...base, id: "evt123_20260727T090000Z", recurringEventId: "evt123" },
      "cal@example.com",
    );
    expect(fields?.externalId).toBe("evt123_20260727T090000Z");
    expect(fields?.externalSeriesId).toBe("evt123");
  });

  it("marks an all-day event and keeps its local calendar day", () => {
    const fields = googleEventToFields(
      { ...base, start: { date: "2026-07-27" }, end: { date: "2026-07-28" } },
      "cal@example.com",
    );
    expect(fields?.allDay).toBe(true);
    expect(fields?.startAt.getDate()).toBe(27);
    expect(fields?.endAt.getDate()).toBe(28);
  });

  it("refuses events it cannot mirror rather than inventing defaults", () => {
    expect(googleEventToFields({ ...base, status: "cancelled" }, "c")).toBeNull();
    expect(googleEventToFields({ ...base, id: undefined }, "c")).toBeNull();
    expect(googleEventToFields({ ...base, start: undefined }, "c")).toBeNull();
  });

  it("does not produce any planner-owned column", () => {
    // The whole point of GoogleOwnedFields: a mirror upsert spread from it cannot reach
    // checkState, priority, contexts, private or projectId.
    const fields = googleEventToFields(base, "cal@example.com")!;
    for (const key of [
      "checkState",
      "priorityLetter",
      "priorityRank",
      "contexts",
      "private",
      "projectId",
    ]) {
      expect(fields).not.toHaveProperty(key);
    }
  });
});

describe("buildRecurrenceRule", () => {
  it("returns undefined for a one-off", () => {
    expect(
      buildRecurrenceRule(recurrence({ recurrenceFrequency: "none" })),
    ).toBeUndefined();
  });

  it("omits INTERVAL when it is 1", () => {
    expect(buildRecurrenceRule(recurrence())).toEqual(["RRULE:FREQ=WEEKLY"]);
  });

  it("floors a zero interval to 1 rather than emitting INTERVAL=0", () => {
    expect(buildRecurrenceRule(recurrence({ recurrenceInterval: 0 }))).toEqual([
      "RRULE:FREQ=WEEKLY",
    ]);
  });

  it("emits sorted, de-duplicated BYDAY for a weekly rule", () => {
    expect(
      buildRecurrenceRule(
        recurrence({ recurrenceInterval: 2, recurrenceByWeekday: [3, 1, 1] }),
      ),
    ).toEqual(["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"]);
  });

  it("only emits BYDAY for weekly rules", () => {
    expect(
      buildRecurrenceRule(
        recurrence({ recurrenceFrequency: "monthly", recurrenceByWeekday: [2] }),
      ),
    ).toEqual(["RRULE:FREQ=MONTHLY"]);
  });

  it("emits COUNT for an end-after-N series", () => {
    expect(
      buildRecurrenceRule(recurrence({ recurrenceEnd: "count", recurrenceCount: 10 })),
    ).toEqual(["RRULE:FREQ=WEEKLY;COUNT=10"]);
  });

  it("emits UNTIL at the end of the local day, so the last occurrence survives", () => {
    // recurrenceUntil is inclusive of its calendar day in our expander. Anchoring UNTIL to
    // 00:00 would drop an occurrence that day; anchoring to 23:59:59 keeps it.
    const rule = buildRecurrenceRule(
      recurrence({
        recurrenceEnd: "until",
        recurrenceUntil: new Date(2026, 6, 31, 9, 0, 0),
      }),
    );
    expect(rule?.[0]).toMatch(/^RRULE:FREQ=WEEKLY;UNTIL=\d{8}T\d{6}Z$/);
    const until = rule![0].split("UNTIL=")[1];
    const asUtc = new Date(
      `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`,
    );
    expect(asUtc.getTime()).toBeGreaterThan(new Date(2026, 6, 31, 9, 0, 0).getTime());
  });

  it("emits a date-only UNTIL for an all-day series", () => {
    const rule = buildRecurrenceRule(
      recurrence({
        allDay: true,
        recurrenceEnd: "until",
        recurrenceUntil: new Date(2026, 6, 31),
      }),
    );
    expect(rule?.[0]).toMatch(/UNTIL=\d{8}$/);
  });

  it("prefers COUNT over UNTIL when the end mode says count", () => {
    expect(
      buildRecurrenceRule(
        recurrence({
          recurrenceEnd: "count",
          recurrenceCount: 3,
          recurrenceUntil: new Date(2026, 6, 31),
        }),
      ),
    ).toEqual(["RRULE:FREQ=WEEKLY;COUNT=3"]);
  });
});

describe("appointmentToGoogleEvent", () => {
  const appointment = {
    subject: "Deep work",
    location: "",
    notes: "focus block",
    startAt: new Date("2026-07-27T14:00:00Z"),
    endAt: new Date("2026-07-27T16:00:00Z"),
    allDay: false,
    showAs: "busy" as const,
    recurrenceFrequency: "weekly" as const,
    recurrenceInterval: 2,
    recurrenceByWeekday: [1, 3],
    recurrenceEnd: "count" as const,
    recurrenceCount: 10,
    recurrenceUntil: null,
  };

  it("builds the full write body including the RRULE", () => {
    expect(appointmentToGoogleEvent(appointment, "America/New_York")).toEqual({
      summary: "Deep work",
      location: "",
      description: "focus block",
      start: { dateTime: "2026-07-27T14:00:00.000Z", timeZone: "America/New_York" },
      end: { dateTime: "2026-07-27T16:00:00.000Z", timeZone: "America/New_York" },
      transparency: "opaque",
      eventType: "default",
      recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10"],
    });
  });

  it("omits recurrence for a one-off", () => {
    const body = appointmentToGoogleEvent({
      ...appointment,
      recurrenceFrequency: "none",
    });
    expect(body.recurrence).toBeUndefined();
  });

  it("writes an all-day appointment as dates, not timestamps", () => {
    const body = appointmentToGoogleEvent({
      ...appointment,
      allDay: true,
      startAt: new Date(2026, 6, 27),
      endAt: new Date(2026, 6, 28),
      recurrenceFrequency: "none",
    });
    expect(body.start.date).toBe("2026-07-27");
    expect(body.end.date).toBe("2026-07-28");
  });
});
