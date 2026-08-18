# Chase pending scrape

**Status: frozen / complete** (2026-08-18)
Spec folder: `agent-os/specs/2026-08-18-1645-chase-pending-scrape/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1556-capitalone-pending-scrape/` — same `# planner-pending v1` TSV, snapshot replace, last-4 targeting, dashboard paste.
- **Extends:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` D5c — SimpleFIN has no forced refresh; this is the human bridge for Chase the way Cap One already had one.
- **Supersedes:** live-bank-sync / Cap One scrape "SimpleFIN's own pending path for Chase is unchanged" — Chase pending is now also a scrape snapshot. SimpleFIN pending stays in the register; the dashboard ignores it while the scrape is authoritative.

## Context

SimpleFIN's Chase balance-date sat on August 16 after a same-day refresh. Chase showed posted $148.63 and a new CVS pending $22.84. The app still had posted $89.58 plus three Amazon pendings that had already posted. Refresh Now only re-reads SimpleFIN.

## Decisions

**D1 — Same paste protocol.** `# planner-pending v1` plus `# source=chase`. Feed is `scrape:chase`.

**D2 — Chase current is posted-only.** `# current=` is written even when pending rows exist. Cap One current still applies only when pending is empty (it includes pending).

**D3 — Scrape pending is the working set.** While scrape rows exist on the account, or `scrapeBalanceAsOf` is inside the 36-hour hold, the dashboard adds only scrape pending. Stale SimpleFIN pending is left in the register so a later sync can still resolve it.

**D4 — Dates from the Chase table.** `Aug 18, 2026` and `data-values` `08/18/2026`. Posted activity is not copied; SimpleFIN will catch those.

**D5 — Tampermonkey only.** No POST from secure.chase.com. Button on the Transactions page.

## Acceptance criteria

- [x] Userscript on Chase copies `# planner-pending v1` with `# source=chase`, last-4, current, and the pending table (or zero rows).
- [x] Pasting writes `scrape:chase` pending on •••9910 and sets the headline to Chase current.
- [x] Dashboard working figure is posted current + scrape pending, not SimpleFIN's stale pending.
- [x] Cap One paste behaviour is unchanged (current only when pending is empty).
- [x] A second user cannot write the first user's scrape-pending.
- [x] `npm run test:unit`; integration tests when Postgres is up.

Verified on the live Chase Transactions page (2026-08-18): copy + dashboard paste matched Chase current and the CVS pending.

## Changes from original plan

| #   | Change                 | Why |
| --- | ---------------------- | --- |
|     | None. Built as shaped. |     |

## Task 1 — Save spec documentation

This folder.

## Task 2 — Parser, write path, working-pending filter, userscript

## Task 3 — Verify

Done. Live Chase copy/paste confirmed.

## Follow-ups (new work — not amendments to this frozen spec)

- Importing Chase's posted activity table so the register, not only the dashboard headline, is current before SimpleFIN catches up.
