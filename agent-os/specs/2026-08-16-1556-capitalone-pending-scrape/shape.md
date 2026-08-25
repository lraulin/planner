# Capital One pending scrape — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

A Tampermonkey userscript copies Capital One's pending table as a tagged TSV. Planner pastes it onto the existing •••3448 card as `pending=true` rows, replaces the set on each paste, and clears a row when SimpleFIN posts a matching charge.

### Out of scope

- Chrome extension or any request from capitalone.com to Planner
- Logging into Capital One or calling its APIs
- Cap One mobile / iPhone scrape
- Pending for other institutions (Chase already arrives via SimpleFIN)
- Changing available-to-spend arithmetic
- Envelopes

## Decisions

- Clipboard, not POST: no Planner credential next to a bank tab.
- Tampermonkey, not a Chrome extension: this is a bridge to retire when Chase is the main card.
- Snapshot replace: Cap One's table is the current truth, including when that table is empty.
- An empty scrape may carry `# current=` so the synced headline becomes the bank's current instead of yesterday's posted.
- Separate feed `scrape:capitalone` so `applySync` cannot delete these as vanished SimpleFIN pending.
- Purchased date from the expanded drawer; scrape day only as fallback.
- Exclude all pending from SimpleFIN cross-source dedup or a posted Chipotle is skipped as a duplicate of the scrape row.

## Context

- **Visuals:** Live Pending table HTML (10 rows, total $379.68) and one expanded Chipotle drawer (`Purchased: Sun, Aug 16, 2026`, Newport Beach CA).
- **References:** live-bank-sync D4/D5/D5a; dashboard D2a; `syncPlan.ts` pending-vs-posted trap; `linkCandidates` last-4 matching.
- **Product alignment:** Unblocks the dashboard headline until the card moves to Chase. Envelopes stays Next.

## Standards Applied

- development/testing — parser + cross-user mutation + sync tripwire
- development/security — userId scope; no credentials on the bank page
- development/dates — scrape/purchased day is a YYYY-MM-DD, no `new Date("Sun, Aug 16")`
- development/clean-code — parser in `src/lib`; userscript only extracts
