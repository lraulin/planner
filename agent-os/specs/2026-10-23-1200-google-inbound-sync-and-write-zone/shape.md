# Google inbound sync for agents, duplicate-safe creates, and the write zone — Shaping Notes

**Status: active**

## Scope

Fixes for three Planner Bot reports (2026-10-23), shaped and built in one pass because they
share a cause: agents act on a schedule that may never have pulled Google.

### In scope

- Agent schedule reads pull Google (D1); `googleSync` status on `get_week`.
- Duplicate check before a non-recurring Google insert (D2).
- Write zone = reader zone (D3).

### Out of scope (decisions for Lee)

- **Background sync.** A Vercel cron (needs `CRON_SECRET`; Hobby allows daily only) or Google
  push channels would keep the mirror fresh without any reader. The google-calendar-sync spec
  already lists this as a follow-up.
- **A per-user or per-calendar time zone column.** Needs a migration; the app is single-reader
  today and `READER_TIME_ZONE` is the existing convention.
- **Existing Planner-created events stamped UTC.** Fixing them is a production data change in
  Google. Recurring ones shift an hour in Eastern time after 2026-11-01.
- **Removing the existing CAC duplicate.** Lee decides which copy to keep.
- Deduplicating recurring creates.

## Context

- `loadSchedule` (`src/lib/schedule/queries.ts`) only pulls with `forceSync`; the comment there
  says stale pulls run in the client after paint (commit `9d78d64b`, 2026-08-10).
- `pushCreate` (`src/lib/google/writeThrough.ts`) inserted unconditionally.
- `localTimeZone()` (`src/lib/google/mapping.ts`) used `Intl…resolvedOptions().timeZone`.
