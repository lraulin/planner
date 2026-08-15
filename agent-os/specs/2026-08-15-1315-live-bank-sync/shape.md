# Live bank sync — Shaping Notes

**Status: active**

> Shaped against Teller, which withdrew its API in early July 2026 before any code was
> written. Rewritten for Plaid; see **Changes from original plan** in `plan.md`.

## Scope

Replace manual file download + import as the way current transaction data reaches the
register, for Chase and Capital One only. Bank enrollment via Plaid Link, account linking to
the existing `finance_accounts` rows, on-demand refresh of transactions plus a live balance,
and dedup against the statement imports that stay.

### Out of scope

- **Available-to-spend / safe-to-spend / envelopes.** This spec delivers the feed; the
  answer it enables is the next Finances spec. Envelopes are already **Next** on the
  roadmap, and a set-aside balance is the piece that must genuinely be invented — the
  frozen `2026-08-14-1012-recurring-bill-cadences` spec is explicit that the current
  set-aside figure "is a number to read, not a balance the app maintains."
- **Retiring CSV or statement imports.** An API feed has no statement boundaries, so
  `reconcile.ts` and `statementCashFlow.ts` still need real statements. The feed is
  additive: fresh data for decisions, statements for reconciled truth.
- Plaid products beyond Transactions and Balance. Adding a subscription product during the
  Trial incurs charges on any later upgrade.
- Plaid's `personal_finance_category` as a classification authority.
- Amazon (no API at any price — the manual data request answers the historical question),
  PayPal (already enrichment, not a register), Coinbase (account closed, BTC sold).
- Any scheduler. Refresh is request-triggered.

## Why Plaid

The requirement was "as current as checking my banks' own apps, refreshable at any time."
That single line eliminated most of the field:

| Option                 | Verdict                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plaid, Trial plan**  | Chosen. Free, real production data, 10 Production Items. Chase **and Capital One** both included in Trial OAuth access. `/accounts/balance/get` forces a live fetch; `/transactions/sync` gives explicit deltas. |
| **Teller, dev env**    | **Withdrew its API in early July 2026.** Was the original choice — its documentation is still online and its marketing site still advertises the service, which is exactly how it read as viable during shaping. |
| **SimpleFIN, $15/yr**  | Rejected as primary. Dead simple — one bearer URL, no widget — but daily refresh only, 24 requests/day. Directly contradicts "refresh at any time." Remains the fallback if Plaid's Trial terms change.          |
| **OFX Direct Connect** | Rejected. Capital One dropped OFX years ago and Chase's is Quicken-gated. Would mean storing bank credentials directly.                                                                                          |

**The lesson from the Teller episode, recorded because it will recur:** a vendor's docs
being current is not evidence the vendor is current. Check the company before designing
around the API. The mitigation baked into the design is that `src/lib/plaid/` is a client
plus a pure mapping module, so a third switch changes two files and no schema.

**Accepted risk:** the 10-Item cap is permanent — `/item/remove` does not free a slot. All
development happens in Sandbox. Two Items is the steady-state need, so the margin is wide,
but it is spendable exactly once.

## Decisions

- **The account-forking trap is the central design problem.** `finance_accounts` identity is
  `(userId, externalSource, externalKey)`. Syncing under a new `api:plaid` source would
  create a second row for every account Lee already has, splitting his history in half
  invisibly. Linking through a side table instead is what makes everything else work.
- **Linking pays for itself twice.** Because synced rows land on the _same_ account row, the
  existing `selectNewTransactions` cross-source matcher deduplicates a later Chase statement
  import against already-synced rows **with no new code**. That matcher exists because "the
  fingerprint unique index includes `postedDate`... the index will not recognise overlap" —
  exactly the Plaid-vs-statement case.
- **Pending transactions are the point, and Plaid resolves them for us.** They are what
  makes a balance match the bank's app. A posted transaction carries `pending_transaction_id`
  pointing at the pending row it replaced, so pending→posted is a resolved link rather than a
  guess — and the restaurant-tip case `fingerprint.ts` flags as unhandled is answered
  outright. The original Teller design invented a heuristic for this; using the answer the
  API already gives is strictly better.
- **But Capital One supplies no pending data at all**, and only 90 days of history. That is
  the bank, not the aggregator, so it would be true under any vendor. Pending is a
  Chase-only capability and the spec says so rather than letting it surface as a bug.
- **This breaks an invariant, deliberately and in one place.** The CSV importer never
  updates a row, which is what makes user-owned `category` and `notes` durable. Applying
  `modified` and `removed` deltas must therefore live outside `importFinanceCsvFiles` — and
  a `modified` posted row must still never clobber `category` or `notes`.
- **The cached-balance trap.** `/accounts/get` and `/transactions/sync` both return a
  `balances` object, and both are cached — potentially a day or more stale. Only
  `/accounts/balance/get` forces a live fetch. Reaching for the balance that is already in
  hand would silently reintroduce the exact staleness this spec exists to remove.
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
- **One genuinely unprecedented piece** with no pattern in the repo to copy: the CSP
  concession for a third-party iframe (`connect-src 'self'` and no `frame-src` today). The
  Teller design had a second — storing a client TLS cert/key — which the Plaid switch
  removed outright, since Plaid authenticates with a `client_id`/`secret` pair.
- **Sign inversion is the highest-risk detail in the whole spec.** Plaid's `amount` is
  positive = money out; this register is positive = money in, uniformly across account
  kinds. Getting it backwards produces a register that looks populated and is wrong in every
  aggregate. It belongs in `mapping.ts` with tests over real payloads for both a checking
  account and a card.
- **Trap found during shaping:** `safeError.ts:31` redacts any error carrying a `code`.
  Plaid's envelope has `error_code` and Node's network errors have `code`, so a naive
  "reconnect your bank" message would reach the user as "Something went wrong."
  `GoogleNotLinkedError` is the pattern to copy.
- **Product alignment:** Roadmap § Financial planning names an aggregator as deferred
  "partly on lock-in and security cost." The `2026-08-12-1316-security-hardening-and-standard`
  spec described itself as "the groundwork that makes that judgement callable later." This
  spec calls it.
- **References:** see `references.md`.

## Standards Applied

- **development/security** — the load-bearing one. New tables are `userId`-scoped with
  ownership proved before every write; the CSP concession must be minimal and documented in
  place; `client_id`/`secret` are environment-only and fail closed; nothing logs the access
  token, and the secret never reaches the browser — Link is initialised from a server-minted
  `link_token`.
- **development/clean-code** — `src/lib/plaid/` holds the logic, `actions.ts` stays thin,
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
