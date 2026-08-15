# Live bank sync via Teller — Shaping Notes

**Status: active**

## Scope

Replace manual file download + import as the way current transaction data reaches the
register, for Chase and Capital One only. Bank enrollment via Teller Connect, account
linking to the existing `finance_accounts` rows, on-demand refresh of posted and pending
transactions plus a live balance, and dedup against the statement imports that stay.

### Out of scope

- **Available-to-spend / safe-to-spend / envelopes.** This spec delivers the feed; the
  answer it enables is the next Finances spec. Envelopes are already **Next** on the
  roadmap, and a set-aside balance is the piece that must genuinely be invented — the
  frozen `2026-08-14-1012-recurring-bill-cadences` spec is explicit that the current
  set-aside figure "is a number to read, not a balance the app maintains."
- **Retiring CSV or statement imports.** An API feed has no statement boundaries, so
  `reconcile.ts` and `statementCashFlow.ts` still need real statements. The feed is
  additive: fresh data for decisions, statements for reconciled truth.
- Teller payments and transfers. `products` stays `["balance", "transactions"]`.
- Amazon (no API at any price — the manual data request answers the historical question),
  PayPal (already enrichment, not a register), Coinbase (account closed, BTC sold).
- Any scheduler. Refresh is request-triggered.

## Why Teller, and why the development environment

The requirement was "as current as checking my banks' own apps, refreshable at any time."
That single line eliminated most of the field:

| Option                      | Verdict                                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Teller, development env** | Chosen. Real banks, real credentials, live real-time balances, free, 100-enrollment cap. Development is functionally production-minus-billing; production would need Know-Your-Business verification that will never happen here. |
| **SimpleFIN, $15/yr**       | Rejected as primary. Dead simple — one bearer URL, no certs, no widget — but daily refresh only, 24 requests/day. Directly contradicts "refresh at any time." Kept as the fallback if Teller changes dev-tier terms.              |
| **Plaid, Trial plan**       | Rejected. 10 Production Items, and `/item/remove` does not free a slot. Best docs, but the free tier is a trap you can back into.                                                                                                 |
| **OFX Direct Connect**      | Rejected. Capital One dropped OFX years ago and Chase's is Quicken-gated. Would mean storing bank credentials directly.                                                                                                           |

**Accepted risk, stated plainly:** living permanently on a tier named "development" means
Teller could change its terms. The mitigation is that the internal seam (`src/lib/teller/`
behind a mapping module) is shaped so SimpleFIN could replace the client without touching
the sync, dedup, or schema decisions.

## Decisions

- **The account-forking trap is the central design problem.** `finance_accounts` identity is
  `(userId, externalSource, externalKey)`. Syncing under a new `api:teller` source would
  create a second row for every account Lee already has, splitting his history in half
  invisibly. Linking through a side table instead is what makes everything else work.
- **Linking pays for itself twice.** Because synced rows land on the _same_ account row, the
  existing `selectNewTransactions` cross-source matcher deduplicates a later Chase statement
  import against already-synced rows **with no new code**. That matcher exists because "the
  fingerprint unique index includes `postedDate`... the index will not recognise overlap" —
  exactly the Teller-vs-statement case.
- **Pending transactions are the point, and they mutate.** They are what makes a balance
  match the bank's app. Teller usually keeps a stable id across pending→posted, but issues a
  new one when the amount changes materially — the restaurant-tip case `fingerprint.ts`
  already flags as unhandled. Treating pending rows as a replaceable set sidesteps the whole
  matching problem, at the cost of not preserving user edits on a pending row.
- **This breaks an invariant, deliberately and in one place.** The CSV importer never
  updates a row, which is what makes user-owned `category` and `notes` durable. The pending
  replacement must therefore live outside `importFinanceCsvFiles`, not inside it.
- **The live balance outranks the statement close.** The frozen statement-cash-flow spec
  said not to change the headline balance rule; that decision was made when no live source
  existed. It is superseded for linked accounts only. `balanceMismatchCents` gains a better
  meaning: register-vs-bank drift, i.e. whether the register is complete.
- **No scheduler.** Freshness only matters at the moment Lee opens the app, so a manual
  button plus the existing stale-on-load throttle covers it. A cron would be the first in
  this repo and is a separate decision that buys nothing here.
- **Sync reclassifies.** Leaving a manual Reclassify press in the loop would reintroduce the
  exact abandoned-habit failure this spec exists to remove.

## Context

- **Visuals:** None.
- **Two genuinely unprecedented pieces** with no pattern in the repo to copy: storing a
  client TLS cert/key (nothing here reads a cert or a file-shaped secret today), and the CSP
  concession for a third-party iframe (`connect-src 'self'` and no `frame-src` today).
- **Trap found during shaping:** `safeError.ts:31` redacts any error carrying a `code`.
  Every Node TLS and network failure has one, so a naive "reconnect your bank" message would
  reach the user as "Something went wrong." `GoogleNotLinkedError` is the pattern to copy.
- **Product alignment:** Roadmap § Financial planning names an aggregator as deferred
  "partly on lock-in and security cost." The `2026-08-12-1316-security-hardening-and-standard`
  spec described itself as "the groundwork that makes that judgement callable later." This
  spec calls it.
- **References:** see `references.md`.

## Standards Applied

- **development/security** — the load-bearing one. New tables are `userId`-scoped with
  ownership proved before every write; the CSP concession must be minimal and documented in
  place; the cert/key are environment-only and fail closed; nothing logs the access token.
- **development/clean-code** — `src/lib/teller/` holds the logic, `actions.ts` stays thin,
  components never touch the db, every mutation takes `userId`. The client/pure-mapping
  split mirrors `src/lib/google/`'s `sync.ts` vs `mirror.ts`.
- **development/testing** — `mapping.ts` is pure logic and gets real fixtures; the mutations
  get a cross-user integration battery; `client.ts` is deliberately untested plumbing.
  `npm run smoke` after the `src/app/**` work, because nothing else evaluates a
  `"use server"` module.
- **database/migrations** — drizzle-kit generated with its snapshot, never hand-written.
- **components/responsive** — validated on the deployed iPhone, so the link-confirmation and
  refresh UI are phone-first, 44px targets, 16px inputs.
- **development/commits** — one logical change per commit; the Spec trailer points here.
