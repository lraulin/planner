# Scheduled syncs (SimpleFIN, Google Calendar) and a public health probe

**Status: active**
Spec folder: `agent-os/specs/2026-10-28-1945-scheduled-syncs-and-health/`

## Spec relationships

- **Supersedes (decision only):** "No scheduler" in
  `agent-os/specs/2026-08-15-1315-live-bank-sync/shape.md`, and "Background sync — no cron"
  in `agent-os/specs/2026-07-31-2046-google-calendar-sync/shape.md`. Everything else in
  both stays as built.
- **Extends:** `agent-os/specs/2026-10-23-1200-google-inbound-sync-and-write-zone/`
  (inbound mirror; this adds a caller, not a behaviour).

## Context

Both "no scheduler" calls assumed freshness only matters when Lee opens a page. It no
longer holds: Planner Bot reads finances and the schedule over MCP without ever loading a
page, so it sees whatever the last page load or button press left — a day or more stale.

## Decisions

### D1: Daily Vercel crons call the manual paths

`GET /api/cron/bank-sync` runs `syncAll` (the "Sync now" button) and
`GET /api/cron/calendar-sync` runs `syncWindow` (the schedule page's pull) for every user
with a SimpleFIN connection / an enabled calendar. Users run in turn, each caught on its
own; any failure answers 500 so the run is red in Vercel's cron log. Both syncs are
idempotent, which Vercel requires (delivery is best-effort and can repeat).

### D2: Schedules (`vercel.json`), Hobby-plan bounded

Hobby allows one run per day per cron, fired anywhere inside the scheduled hour.

| Job           | Cron (UTC)   | Runs between (UTC) | EDT (to Nov 1) | EST (from Nov 1) |
| ------------- | ------------ | ------------------ | -------------- | ---------------- |
| calendar-sync | `0 10 * * *` | 10:00–10:59        | 6:00–6:59 AM   | 5:00–5:59 AM     |
| bank-sync     | `0 23 * * *` | 23:00–23:59        | 7:00–7:59 PM   | 6:00–6:59 PM     |

Bank sync runs in the evening because the SimpleFIN Bridge refreshes each account about
once a day at a bank-dependent daytime hour (observed: Capital One 3:46 PM, Chase 10:36 AM
ET), so an evening pull picks up that day's refresh. It uses 1 of the Bridge's 24
requests/day. Calendar sync runs before the day starts so the morning view is current.

### D3: `CRON_SECRET`, fail closed

Vercel sends `Authorization: Bearer $CRON_SECRET`. Compared timing-safe (shared
`secretsMatch`); unset secret ⇒ 500 and nothing runs. `/api/cron/*` is allowlisted in
`src/proxy.ts` because crons do not follow the redirect to `/login`.

### D4: Calendar window

A week back through eight weeks ahead, rounded by `syncWindowFor` like a page read.

### D5: `GET /api/health` (public)

Database reachable, short commit SHA, and per feature the newest `lastSyncedAt` with
`stale` after 36 h (one Hobby day plus jitter and margin). 503 when the database does not
answer; 200 with `status: "degraded"` when a sync is stale. Names no user, account or
event; a database error is reported as `down` without its message.

## Changes from original plan

| Date | Change | Why |
| ---- | ------ | --- |
