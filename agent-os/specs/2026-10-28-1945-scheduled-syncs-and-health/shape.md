# Scheduled syncs and health probe — Shaping Notes

**Status: active**

## Scope

### In scope

- Two daily crons (D1–D4), `CRON_SECRET`, the proxy allowlist, `/api/health` (D5).

### Out of scope

- Google push notifications / watch channels; more than daily runs (needs Vercel Pro).
- Retrying a failed run (Vercel does not; the next day's run is the retry).
- Alerting. The weekly health check reads `/api/health` and the cron log.

## Context

- Shaped from Lee's task brief of 2026-10-28 rather than `/shape-spec` Q&A.
- SimpleFIN timing evidence: provider `balance-date` values stored via
  `get_finance_overview`; Bridge developer guide (daily refresh, ≤24 requests/day, random
  minute, ~5-day window overlap — the overlap is already in `crossSource.ts`).
