# References for scheduled syncs and health probe

**Status: active**

## Governing specs

- `agent-os/specs/2026-08-15-1315-live-bank-sync/` — Supersedes "No scheduler" only.
- `agent-os/specs/2026-07-31-2046-google-calendar-sync/` — Supersedes "no cron" only.
- `agent-os/specs/2026-10-23-1200-google-inbound-sync-and-write-zone/` — Extends.

## Code

- `src/lib/cron/` — auth, pure report/window, jobs.
- `src/app/api/cron/[job]/route.ts`, `src/app/api/health/route.ts`, `src/lib/health/`.
- `vercel.json` — schedules. `src/proxy.ts` — allowlist.

## External

- https://vercel.com/docs/cron-jobs (Hobby: daily, hourly precision; `CRON_SECRET`;
  no redirects; best-effort, may repeat)
- https://www.simplefin.org/protocol.html, https://beta-bridge.simplefin.org/info/developers
