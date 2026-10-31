import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, appointments } from "@/db/schema";
import { updateAppointmentTool } from "@/lib/agent/scheduleTools";
import { rescheduleAppointment, updateAppointment } from "@/lib/schedule/mutations";
import { describeWithDatabase } from "@/lib/testing/database";
import { testUsers } from "@/lib/testing/users";

/**
 * Editing a Google series from one of its later occurrences.
 *
 * The local table holds only instances, so "edit the series" means PATCHing Google's series
 * master by `externalSeriesId`. The bug this file pins: the PATCH carried the *instance's*
 * start and end, which re-anchored the whole series (its DTSTART) on the occurrence the
 * user happened to open — earlier occurrences vanished from Google and the series began
 * that week.
 *
 * The three entry points share `pushUpdate`: `updateAppointment` (the drawer's save action
 * delegates to it unchanged), the connector's `update_appointment` tool, and
 * `rescheduleAppointment` (the week grid's drag). Google is faked at `fetch` — the one
 * boundary the client crosses — so the real client, mapping and Better Auth token read run.
 */

/**
 * Better Auth only knows the Google provider when both credential halves are set, and
 * `getAccessToken` reads the stored token through that provider. CI has neither, so name a
 * placeholder client before `@/lib/auth/server` loads. Nothing here ever reaches Google:
 * `fetch` is faked below and the stored token is unexpired, so no refresh is attempted.
 */
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID ||= "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET ||= "test-client-secret";
});

const describeDb = await describeWithDatabase("google series edits");

const ZONE = "America/New_York";
const SERIES_ID = "evt1";
const CALENDAR_ID = "primary";

/** Weekly on Mondays, 9:00–9:30 Eastern, first occurrence Monday 2026-08-03. */
const MASTER = {
  id: SERIES_ID,
  etag: '"master-1"',
  summary: "Standup",
  start: { dateTime: "2026-08-03T09:00:00-04:00", timeZone: ZONE },
  end: { dateTime: "2026-08-03T09:30:00-04:00", timeZone: ZONE },
  recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
};

type Call = { method: string; path: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

/** Google's answer to one request: the series master on GET, the merged event on PATCH. */
function respond(input: string | URL | Request, init: RequestInit = {}): Response {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
  calls.push({ method, path: decodeURIComponent(url.pathname), body });
  if (!url.hostname.endsWith("googleapis.com")) {
    return new Response("unexpected host", { status: 500 });
  }
  const eventId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  if (method === "GET" && eventId === SERIES_ID) {
    return Response.json(MASTER);
  }
  if (method === "PATCH") {
    return Response.json({
      ...(eventId === SERIES_ID ? MASTER : {}),
      ...body,
      id: eventId,
      etag: '"patched"',
      updated: "2026-10-28T12:00:00.000Z",
    });
  }
  return new Response("not found", { status: 404 });
}

function fakeGoogle() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) =>
      Promise.resolve(respond(input, init)),
    ),
  );
}

const patches = () => calls.filter((c) => c.method === "PATCH");

const makeUser = testUsers("test");

async function makeLinkedUser(): Promise<string> {
  const userId = await makeUser();
  await db.insert(accounts).values({
    userId,
    accountId: `google-${crypto.randomUUID()}`,
    providerId: "google",
    accessToken: "token",
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60_000),
  });
  return userId;
}

/** One mirrored occurrence of the series, as `syncWindow` stores it. */
async function makeOccurrence(
  userId: string,
  start: string,
  end: string,
): Promise<string> {
  const startAt = new Date(start);
  const [row] = await db
    .insert(appointments)
    .values({
      userId,
      subject: "Standup",
      startAt,
      endAt: new Date(end),
      recurrenceFrequency: "none",
      externalSource: "google",
      externalId: `${SERIES_ID}_${startAt.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      externalSeriesId: SERIES_ID,
      externalCalendarId: CALENDAR_ID,
    })
    .returning({ id: appointments.id });
  return row.id;
}

async function readRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.userId, userId)));
  return row;
}

beforeEach(fakeGoogle);
afterEach(() => {
  vi.unstubAllGlobals();
});

describeDb("editing a Google series from a later occurrence", () => {
  // Monday 2026-08-17, the third occurrence: 9:00–9:30 EDT.
  const LATER_START = "2026-08-17T13:00:00.000Z";
  const LATER_END = "2026-08-17T13:30:00.000Z";

  it("keeps the series start date when the drawer changes the time", async () => {
    const userId = await makeLinkedUser();
    const id = await makeOccurrence(userId, LATER_START, LATER_END);

    // 10:00–10:45 EDT on the same Monday: "every standup moves to ten".
    await updateAppointment(userId, id, {
      startAt: new Date("2026-08-17T14:00:00.000Z"),
      endAt: new Date("2026-08-17T14:45:00.000Z"),
    });

    expect(patches()).toHaveLength(1);
    const [patch] = patches();
    expect(patch.path).toMatch(new RegExp(`/events/${SERIES_ID}$`));
    expect(patch.body).toMatchObject({
      start: { dateTime: "2026-08-03T10:00:00", timeZone: ZONE },
      end: { dateTime: "2026-08-03T10:45:00", timeZone: ZONE },
    });

    // Locally the opened occurrence takes the new time on its own day.
    const row = await readRow(userId, id);
    expect(row.startAt.toISOString()).toBe("2026-08-17T14:00:00.000Z");
    expect(row.endAt.toISOString()).toBe("2026-08-17T14:45:00.000Z");
    expect(row.externalSeriesId).toBe(SERIES_ID);
  });

  it("keeps the series start when the connector renames from a later occurrence", async () => {
    const userId = await makeLinkedUser();
    const id = await makeOccurrence(userId, LATER_START, LATER_END);

    // No time in the edit at all: the old code still sent the occurrence's own start.
    await updateAppointmentTool(userId, { id, subject: "Team standup" });

    const [patch] = patches();
    expect(patch.path).toMatch(new RegExp(`/events/${SERIES_ID}$`));
    expect(patch.body).toMatchObject({
      summary: "Team standup",
      start: { dateTime: "2026-08-03T09:00:00", timeZone: ZONE },
      end: { dateTime: "2026-08-03T09:30:00", timeZone: ZONE },
    });
  });

  it("keeps the series start across the DST change", async () => {
    const userId = await makeLinkedUser();
    // Monday 2026-11-02, after DST ends: 9:00 EST is 14:00Z.
    const id = await makeOccurrence(
      userId,
      "2026-11-02T14:00:00.000Z",
      "2026-11-02T14:30:00.000Z",
    );

    await updateAppointmentTool(userId, {
      id,
      startAt: "2026-11-02T13:30:00.000Z", // 8:30 EST
      endAt: "2026-11-02T14:00:00.000Z",
    });

    // 8:30 wall-clock on the first Monday — not 9:30 EDT, which a fixed offset would give.
    expect(patches()[0].body).toMatchObject({
      start: { dateTime: "2026-08-03T08:30:00", timeZone: ZONE },
      end: { dateTime: "2026-08-03T09:00:00", timeZone: ZONE },
    });
  });

  it("refuses to move every occurrence to another date, and changes nothing", async () => {
    const userId = await makeLinkedUser();
    const id = await makeOccurrence(userId, LATER_START, LATER_END);

    // Tuesday instead of Monday. Google Calendar offers only "This event" and "This and
    // following events" for a date change; a series PATCH would re-anchor the series.
    await expect(
      updateAppointmentTool(userId, {
        id,
        startAt: "2026-08-18T13:00:00.000Z",
        endAt: "2026-08-18T13:30:00.000Z",
      }),
    ).rejects.toThrow(/date/i);

    expect(patches()).toEqual([]);
    const row = await readRow(userId, id);
    expect(row.startAt.toISOString()).toBe(LATER_START);
  });

  it("drags one occurrence without touching the series", async () => {
    const userId = await makeLinkedUser();
    const id = await makeOccurrence(userId, LATER_START, LATER_END);

    // Dragged to Tuesday 11:00 EDT.
    await rescheduleAppointment(
      userId,
      id,
      new Date("2026-08-18T15:00:00.000Z"),
      new Date("2026-08-18T15:30:00.000Z"),
    );

    expect(calls.filter((c) => c.method === "GET")).toEqual([]);
    const [patch] = patches();
    expect(patch.path).toMatch(/\/events\/evt1_20260817T130000Z$/);
    expect(Object.keys(patch.body ?? {}).sort()).toEqual(["end", "start"]);
    expect(patch.body).toMatchObject({
      start: { dateTime: "2026-08-18T15:00:00.000Z" },
      end: { dateTime: "2026-08-18T15:30:00.000Z" },
    });
    const row = await readRow(userId, id);
    expect(row.startAt.toISOString()).toBe("2026-08-18T15:00:00.000Z");
  });

  it("does not let another user edit the occurrence or reach Google", async () => {
    const owner = await makeLinkedUser();
    const intruder = await makeLinkedUser();
    const id = await makeOccurrence(owner, LATER_START, LATER_END);

    await expect(
      updateAppointment(intruder, id, { subject: "Hijacked" }),
    ).rejects.toThrow(/not found/i);
    await expect(
      updateAppointmentTool(intruder, { id, subject: "Hijacked" }),
    ).rejects.toThrow(/not found/i);
    await expect(
      rescheduleAppointment(
        intruder,
        id,
        new Date("2026-08-18T15:00:00.000Z"),
        new Date("2026-08-18T15:30:00.000Z"),
      ),
    ).rejects.toThrow(/not found/i);

    expect(calls).toEqual([]);
    const row = await readRow(owner, id);
    expect(row.subject).toBe("Standup");
    expect(row.startAt.toISOString()).toBe(LATER_START);
  });
});
