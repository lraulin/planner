# Google inbound sync for agents, duplicate-safe creates, and the write zone

**Status: active**
Spec folder: `agent-os/specs/2026-10-23-1200-google-inbound-sync-and-write-zone/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/` (mirror, write-through,
  `appointments_external_ref_uq`).
- **Extends:** `agent-os/specs/2026-08-10-1940-daily-use-performance/` (Task 5: local-first
  reads with the stale pull after paint). This spec keeps that for pages and narrows it for
  agent reads only.
- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` (strict output schemas,
  generated docs).

## Context

Planner Bot reported three Google Calendar problems on 2026-10-23:

1. **Events created in Google never show up in `get_week`.** Since the daily-use performance
   work, `loadSchedule` without `forceSync` only reports freshness; the pull runs in the
   browser after paint. Agents have no browser, so `get_week`, `get_context` and
   `load_weekly_plan` read only whatever the last page view mirrored. With no cron or push
   channel, an agent-only day never pulls at all.
2. **A create duplicated an event already in Google.** The Oct 9 CAC appointment existed in
   Google; an agent `create_appointment` (planner row `8be006d4…`) inserted a second Google
   event (`hpn2r3rebelnqi156510un2p0s`). `pushCreate` inserts without looking. The agent could
   not have seen the original because of (1).
3. **Planner-written events carry `timeZone: "UTC"`.** `localTimeZone()` read the server's zone,
   which is UTC on Vercel. Timed one-off events still land at the right instant, but Google
   shows them in UTC in the event editor, and a weekly series anchored in UTC keeps its UTC
   wall time across DST, so it moves an hour in Eastern time on 2026-11-01.

## Decisions

### D1: Agent schedule reads pull Google first

`get_week`, `get_context` and `load_weekly_plan` call `loadSchedule(…, forceSync: true)`. The
pull is still skipped when fresh (`isFresh`), so repeated calls cost one freshness check.
`get_week` reports the outcome as `googleSync: { state, message? }` (`off`, `ok`, `skipped`,
`stale`, `not_linked`, `failed`), so an agent can say when the week may be missing Google
events instead of trusting an empty day. Pages keep the after-paint pull.

### D2: A create links to a matching Google event instead of inserting

Before inserting a **non-recurring** event, `pushCreate` lists the target calendar over the
appointment's span and looks for a live event with the same all-day flag, the same start and
end, and a matching title (equal after normalising, or sharing a non-generic word of ≥3
letters — "CAC appointment" matches "CAC renewal – NAS Pax River"). On a match no event is
inserted. The planner row takes Google's fields (Google's copy wins: it is the one Lee typed)
plus any planner-only annotations the caller passed (priority, project, contexts, check state,
reminder, private, organizer source). If the mirror already holds that event, that row is
reused rather than inserted (`appointments_external_ref_uq` guarantees one row per event).
`create_appointment` returns `linkedExisting: true` in that case.

The lookup is best-effort: if the list call fails, the create proceeds as before. Recurring
creates are not deduplicated (a series match is a judgement call; out of scope).

### D3: Planner writes events in the reader's zone

`writeTimeZone()` returns `READER_TIME_ZONE` (`America/New_York`), the zone every other
calendar-day rule in the app already uses. No per-user zone column yet (see Out of scope).

## Acceptance

- [x] `get_week` / `get_context` / `load_weekly_plan` pull Google when stale; `get_week`
      reports `googleSync`.
- [x] A create that matches a live Google event inserts nothing in Google, stores Google's copy
      with the caller's annotations, and returns `linkedExisting: true`.
- [x] A create matching an already-mirrored event reuses that row; a second user's row with the
      same event id is never touched.
- [x] Cancelled events, all-day/timed mismatches, different times and unrelated titles never
      match.
- [x] New one-off and recurring Google events are written with `America/New_York`.
- [x] `docs/agent-api.md` regenerated.

## Tasks

1. Save spec documentation (this folder).
2. `forceSync` on agent reads; `googleSync` on `get_week`.
3. `findDuplicateEvent` and the link-instead-of-insert path in `pushCreate` /
   `createAppointment`.
4. `writeTimeZone()`.

## Changes from original plan

| What | Why |
| ---- | --- |
