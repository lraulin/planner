# Chase pending scrape — Shaping Notes

**Status: frozen / complete** (2026-08-18)

## Scope

A Tampermonkey userscript copies Chase's pending table (and posted current) as the same tagged TSV Capital One already uses. Planner pastes it onto •••9910.

### Out of scope

- Importing the posted activity table as posted register rows
- Forcing SimpleFIN to refresh Chase
- Deleting SimpleFIN pending rows

## Decisions

- Chase current ($148.63 next to "Current balance") does not include the new pending $22.84, unlike Capital One.
- Working pending prefers scrape rows so stale SimpleFIN Amazon pending does not stack on the new current.

## Context

- **Visuals:** Live Chase Transactions HTML from 2026-08-18 (pending accordion + activity table + recon bar).
- **References:** `scripts/capitalone-pending.user.js`, `src/lib/finances/scrapePending.ts`
