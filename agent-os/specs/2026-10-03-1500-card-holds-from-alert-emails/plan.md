# Card holds from alert emails — Plan

**Status: frozen / complete** (2026-11-10)

> Shaped and built 2026-10-03; live for Capital One that day and for Chase from 2026-10-18.
> Frozen 2026-11-10 with `standards.md` pinned at `502269d9`, after the two changes dated
> 2026-11-10 in **Changes from original plan**. Further change opens a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-09-23-1316-one-history-source-per-account/` (D1
  `history_source`, D5 cutover), `agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/`,
  `agent-os/specs/2026-09-13-1127-ingest-by-identity/`
- **Supersedes:** `agent-os/specs/2026-09-23-1316-one-history-source-per-account/` — Decision 1
  (Capital One on the bank page); `agent-os/specs/2026-09-24-1330-chase-to-bank-page/` — D1
  (Chase on the bank page). Both cards return to `simplefin`.

## Decisions

- **D1. An alert is a hold, never posted history.** New `external_source` values
  `alert:capitalone` and later `alert:chase`. `external_id` is the Gmail message id, so the
  existing partial unique index makes a re-push a no-op. Rows insert `pending: true` with the
  alert's date, display name (as `description`) and signed amount (a charge is negative).
- **D2. Retirement uses the existing handover.** Alert holds join the retiring set and retire
  onto any SimpleFIN row, pending or posted, that pairs
  (`retireRowsOntoOtherSources`, `feedHandoverWrite.ts`), carrying envelope and notes, inside the
  SimpleFIN sync transaction. Pairing rules are `feedPairing.ts` as they stand. **No new merchant
  aliases in `descriptionsOverlap`** (forbidden by the holds-never-deleted spec).
- **D3. Unmatched alert holds are flagged, never auto-deleted.** After
  `LOST_HOLD_TOLERANCE_DAYS` (7) with no successor, flag for review using the `unlistedAt`
  mechanism. Accepted cost: a declined authorization lingers until Lee clears it.
- **D4. The budget counts alert holds** on `simplefin` accounts: `selectWorkingPending`
  (`workingPending.ts`) counts the account's feed holds plus its alert holds. Retirement is what
  prevents double counting.
- **D5. Delivery by Apps Script push.** A time-triggered script (every 5 min) in Lee's Gmail
  searches `from:(capitalone@notification.capitalone.com OR no.reply.alerts@chase.com)
newer_than:2d` for messages not yet handled, POSTs
  `{messageId, from, subject, receivedAt, plainText}`, and records the id as handled on a 2xx or 422. **Parsing happens in
  Planner**, so a format change is a deploy, not a script edit. The raw text is kept as audit
  evidence.
- **D6. Routing by the card's last four digits.** An unknown last-four or unparseable body
  returns 422 and writes an audit warning — never a silent drop.
- **D7. Cutover back to SimpleFIN** via `scripts/history-source-cutover.ts --to simplefin`, dry
  run first, Lee reads the receipt. It must retire the page's **posted** rows since
  `history_source_since` onto SimpleFIN's twins (not only holds), ensure the sync backfills
  SimpleFIN rows it skipped since that day, and list anything unpaired — never delete it.
- **D8. Userscripts retired for the cards.** Pastes are already refused for `simplefin`
  accounts.

## Evidence (Lee's Gmail, 2026-10-03)

- Capital One sends `capitalone@notification.capitalone.com`, subject "A new transaction was
  charged to your account": _"on Oct. 2, 2026, at Pizza Hut, a pending authorization or purchase
  in the amount of $12.71 was placed or charged on your VentureOne Credit Card"_, "ending in
  3448". Day-only date, display name, amount, last four; **no transaction id**; fires for
  authorizations too (gas, hotels). "A deposit has been made to your account" is a separate
  subject (a 360 deposit; decide whether a credit is ever a hold).
- Chase sent **no per-purchase email in 90 days** — only payment-scheduled and statement-ready.
  Lee must enable a Chase transaction alert first; the Chase parser waits for a real sample.

## Tasks

1. **Parser** `src/lib/finances/alertEmail.ts` (pure) + `alertEmail.test.ts`. Real Capital One
   bodies as fixtures.
2. **Write** `alertIngestWrite.ts` + `alertIngestWrite.integration.test.ts`: idempotent re-push;
   a second user cannot read, change or delete the first user's alert rows; unknown last-four
   rejected.
3. **Route** `src/app/api/finances/alerts/route.ts`, Bearer auth through the agent-key path
   (`getAgentUserId()`).
4. **Retirement:** `ALERT_FEEDS` beside `SCRAPE_FEEDS` (`bankSnapshot.ts`); call
   `retireRowsOntoOtherSources(..., ALERT_FEEDS, { pendingOnly: true })` where the sync calls
   `retireCoveredScrapeRows`. Integration tests: exact match, tip, ambiguous-keep.
5. **Lost-hold flag** for stale alert holds, reusing the `unlistedAt` review UI.
6. **`selectWorkingPending`** + its test.
7. **Cutover** `--to simplefin` per D7, with an integration test.
8. **Apps Script** `scripts/gmail-alert-push.gs` with setup notes here.
9. **Freeze:** roadmap live-bank-sync entry; `bank-feed-workflow` memory.

## Acceptance

- [x] A Capital One alert POSTed twice yields one pending row on •••3448. —
      `alertIngestWrite.integration.test.ts` "writes one pending, negative hold and treats a
      re-push as a no-op".
- [x] A SimpleFIN row for the same charge retires it, carrying envelope and notes; a tipped
      charge too; an ambiguous one is kept and flagged. — the same file's "retires a hold onto
      its exact SimpleFIN twin…" and "retires a hold onto a tipped posting and keeps an
      ambiguous one…". In production, 63 of 71 holds had retired by 2026-11-10; the other
      eight were under four days old.
- [x] Cutover dry runs for both cards read cleanly and are applied on production. — both
      cards read `history_source = simplefin` on 2026-11-10; Capital One's cutover events are
      2026-10-03, Chase's first accepted alert is 2026-10-18.
- [x] A real purchase appears as a hold within ~5 minutes and retires when SimpleFIN posts it.
      — the eight live holds on 2026-11-10 were written 0–4 minutes after their mail arrived.
- [x] `npm test` (database tests actually ran) and `npm run smoke` pass. — 2026-11-10: 4,944
      unit and 1,404 database tests with no skip, smoke 53/53.

## Out of scope

Plaid or any other feed; an LLM in the loop; rewriting SimpleFIN's dates (Capital One via
SimpleFIN dates by posting day — accepted); the 360 accounts; a Chase parser before a real Chase
alert exists.

## Changes from original plan

| What                                                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D5 bookkeeping: handled message ids kept in a script property, not a `planner/pushed` label                                                                                                                                                                                                                                     | Capital One threads several alerts together; a thread label hides every alert after the first. A re-push is a no-op, so losing the property costs only a repeat.                                                                                                                                                                                                                                                                                                                                           |
| D5 script searches only Capital One charge alerts for now                                                                                                                                                                                                                                                                       | Chase has no per-purchase alert yet; the Chase line is a comment in the script.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `ALERT_FEEDS` lives in `alertEmail.ts`, not `bankSnapshot.ts`                                                                                                                                                                                                                                                                   | The alert parser owns the feed names; `bankSnapshot.ts` is the page's capture format.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Retirement is two passes (`alertHolds.ts`): `retireRowsOntoOtherSources` for exact pairs, then `resolveLostHold` for tips and the 7.5% band                                                                                                                                                                                     | `pairRows` needs an exact amount, so a tipped charge never paired; D2's acceptance of tips needs the lost-hold rule. A row the first pass used is not offered again.                                                                                                                                                                                                                                                                                                                                       |
| An alert on an account whose history is not SimpleFIN is rejected (422)                                                                                                                                                                                                                                                         | On a bank-page or files account it would be a second author of the same money.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Rejected alerts write an `alert_email` audit event; the script marks 422s handled                                                                                                                                                                                                                                               | Otherwise a refused alert would re-audit every five minutes.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `--to simplefin` from `bank_page` also rewinds `bank_connections.synced_through` to `history_source_since`                                                                                                                                                                                                                      | The sync cursor is connection-wide and had moved past the days SimpleFIN skipped; without the rewind nothing backfills them. Receipt reports `resyncFrom`.                                                                                                                                                                                                                                                                                                                                                 |
| Task 9 (roadmap, memory) not done                                                                                                                                                                                                                                                                                               | Waits on Lee installing the script and applying the cutover.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-10: `resolveLostHold` takes an exact-amount row under any name, and a near amount (7.5% band or tip) only from the same merchant. An alert hold gets the near-amount step only once it is `NEAR_AMOUNT_WAIT_DAYS` (4) old. Narrows `2026-09-14-1004-ledger-ready-to-assign` D4, which let the band alone qualify a row. | Production, 2026-10-23: a $16.95 YouTube hold and a $94.94 county-utility hold were retired the moment the next alert arrived, onto a $15.90 Grok row and a ~$100 row, and the Pizza Hut hold then carried its envelope onto YouTube's $16.95 row. The pass runs on every sync and alert, so a fresh hold's own row is usually not there yet and the one row inside the band is someone else's. All 62 holds that had posted by 2026-11-10 posted at the exact amount; no real retirement needed the band. |
| 2026-11-10: each SimpleFIN sync offers the last week's rejected alerts again from their audit evidence (`retryRejectedAlerts`); a repeat refusal writes no second event. The script is unchanged and still marks a 422 handled.                                                                                                 | A refusal is true of the moment only. All eight production rejections (2026-10-01 to 10-06) were for cards mid-cutover, and Gmail never resent them. Retrying from the script instead would wake the database every five minutes for two days per refused message.                                                                                                                                                                                                                                         |
| 2026-11-10: Chase alerts are confirmed live: 11 accepted between 2026-10-18 and 11-05, none rejected since the cutover.                                                                                                                                                                                                         | Evidence section said the Chase parser waited on a real sample.                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Follow-ups (new work — not amendments to this frozen spec)

- A posted row can absorb more than one hold over successive syncs, because nothing records
  which hold a row already retired. Two identical purchases a day apart would lose the second
  hold a day or two early; the posted rows themselves are unaffected.
- Whether "A deposit has been made to your account" (a 360 deposit) should ever be a hold.
