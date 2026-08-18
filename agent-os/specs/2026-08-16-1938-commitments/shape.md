# Commitments — Shaping Notes

**Status: frozen / complete** — verified 2026-08-18

## Scope

A **Commitments** model for the Finances module, in two distinct tiers plus one deliberate
non-tier:

1. **Subscriptions & bills** — things that charge unless you cancel. Exact amount, exact
   next date, cancellation state, and a watchdog for charges that stop arriving.
2. **Recurring spend** — things you buy on a cadence where the amount is fuzzy. Pizza,
   groceries. Merchant _groups_, amounts derived from history, deducted from Available to
   Spend so that headline stops being optimistic.
3. **Everything else** — no bucket, ever. Already covered by Available to Spend.

Delivered surfaces: a `/finances/commitments` page with two grids and a 12-month forward
view, new Dashboard panels, and MCP write tools so an AI can research a pasted list and
write the results back.

### Out of scope

- **Shortfall attribution** — the panel that, when Available to Spend goes negative, names
  what could be cancelled to fix it. The Commitments grid's annual and monthly cost columns
  already rank the candidates; turning a negative headline into a guided decision is
  follow-up work. Explicitly wanted by the user, explicitly not in this spec.
- **Per-category discretionary envelopes (Tier 3)** — a non-goal, not a deferral. See D0.
- Emergency-fund and savings-goal tracking.
- Re-scraping or automating cancellation. The app records a cancel URL; it does not click it.

## How the shape was arrived at

The conversation started from a concrete complaint: declaring 1Password a bill produced
`1PASSWORDTORONTOON / Yearly / $38.03`, where the name was the bank's, the amount was a
median of partial charges, the real figure is $71.88 due 2027-03-30, and the only editable
field was the cadence.

Two candidate models were weighed.

**Rejected — one table with a `kind` column.** Argued initially on DRY grounds, that both
tiers share the accrual, the annual-cost math and the Available-to-Spend deduction. The
argument does not survive inspection: `setAsideHeld()` is already a _pure function over a
plain shape_ in `available.ts`, so two tables feed it without sharing a row. Sharing the
math never required sharing the storage.

**Chosen — two tables.** The user's objection ("it seems weird to list pizza money alongside
subscriptions I'll be charged for unless I proactively cancel") identifies a sharper
distinction than the amount-precision one that was on the table:

> A subscription is a **liability with an off switch** — it charges unless you act.
> Recurring spend is a **choice** — it costs nothing unless you act.

Opposite defaults, and the difference generates real columns on one side only: `status`,
`cancelled_on`, `cancel_url`, and the "expected charge never arrived" watchdog. Pizza needs
none of them.

The user also observed that pizza and groceries "might as well be bills" — same weekly
cadence, usually the same day, one payment each. That pulls the other way, and what
reconciles the two observations is: **same mechanics, different meaning.** Shared
arithmetic, separate storage, separate presentation.

**Tier 3 as a non-feature** came directly from the user's account of what went wrong with
YNAB: separate buckets for clothes, games and books, which encoded a judgement ("money's
tight, hold off") they already make correctly without a ledger. The admission test that fell
out — _if you cannot state the cadence, it does not get a bucket_ — is what keeps the whole
feature low-maintenance, and is the reason this is not YNAB.

## Decisions

Full statements with rationale live in `plan.md` D0–D11. In brief:

- **D0** Three tiers; Tier 3 deliberately has no buckets.
- **D1** Two tables, one shared arithmetic module; drift prevented by a shared `Commitment`
  view type rather than by shared storage.
- **D2** `name` (user-chosen) splits from `matchers text[]` (bank strings). One change fixes
  the rename, the merchant grouping, and the two-spellings problem.
- **D3** A merchant belongs to at most one commitment across both tables; enforced in the
  mutation because SQL cannot span two tables, pinned by an integration test.
- **D4** No "either/or" logic — a rate over a merchant group answers the question already.
- **D5** Tier 2 amounts auto-derive from history and are pinnable.
- **D6** Tier 2's held formula is `Σ max(0, rate − spentInPeriod)` over periods before
  payday. The overspend behaviour the user wanted falls out of the clamp at zero for free.
- **D7** Tier 2 must not touch the Insights baseline — pizza is already counted there.
- **D8** Dead-subscription detection flags, never applies.
- **D9** `active | cancelled | ignored`.
- **D10** One page, two grids, second in the Finances nav.
- **D11** One File/View catalog on the page; each grid keeps local Filter and names itself
  in View / File ▸ Export so the command is never ambiguous.

### Constraints noted during shaping

- `setAsideHeld` assumes cadence ≥ pay period, because it accrues _toward_ a future charge.
  A weekly rate against biweekly pay inverts that, which is why D6 is a separate function
  rather than a widened one.
- The migration is data-bearing: real declarations (Rent, Geico, Taylor Gas, 1Password)
  exist and must survive the `merchant` → `name` + `matchers` split.
- These are the **first finance write tools** on the agent surface; everything under
  `get_finance_*` today is read-only.

## Context

- **Visuals:** None. Two ASCII layouts were used during shaping to settle the page structure
  and the Tier 2 amount display; both are reproduced in `plan.md` Tasks 6 and 7 as prose.
- **References:** See `references.md`.
- **Product alignment:** Closes the outstanding **envelopes** MVP item in
  `agent-os/product/roadmap.md` § Financial planning, deferred 2026-08-12 "until there is
  real spending data to design them against". Shipped under the name **Recurring spend** —
  the word "envelope" carries the every-dollar-gets-a-bucket expectation this spec exists to
  reject, so the roadmap entry is closed with a note rather than matched literally.

## Standards Applied

- **development/clean-code** — arithmetic lives in `src/lib/finances/`, `actions.ts` stays
  thin, components never touch the db. `DashboardView` and `CommitmentsView` arrange and
  format only.
- **development/testing** — pure logic gets a sibling test; both tables get
  `*.integration.test.ts` with a second user failing to read, change and delete. No React
  component tests.
- **development/security** — every new mutation takes `userId` first and proves ownership;
  the new agent write tools are the sharp edge here.
- **development/dates** — cadence arithmetic on `YYYY-MM-DD` parts, never `Date`;
  `todayKey` supplied by the caller so nothing depends on the deploy region's `TZ`.
- **database/migrations** — generated, never hand-written without its snapshot; this one
  carries data through a column split.
- **components/data-grid** — the shared `DataGrid`, not a second hand-rolled table.
- **components/navigation** — one registry for pages and one for commands; a command without
  a menu is not shipped.
- **api/agent-tools** — strict schemas, intent-shaped descriptions, compact output, retry
  safety.
