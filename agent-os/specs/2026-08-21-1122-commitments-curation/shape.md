# Commitments — categories, aliases, and real cadences — Shaping Notes

**Status: frozen / complete** (2026-08-21)

## Scope

Six weeks of real use against real bank data turned up five curation gaps on
`/finances/commitments`. Four of them share a cause: the app can only describe a commitment in
the vocabulary its one detector speaks.

1. **Categories on commitments**, both tiers, from the existing `FINANCE_CATEGORIES` taxonomy —
   and reaching the transactions, so Insights agrees with Commitments.
2. **Fold a second vendor spelling into an existing bill**, with a warning when the two
   spellings look like two concurrent bills rather than one renamed vendor.
3. **A URL column** that is a clickable link and still editable.
4. **Next charge prefilled** in the Review draft, from the last charge and the cadence.
5. **Cadence in days** — Vetsource is a 28-day autoship, not a monthly bill.
6. **Walmart reaching Review** — and everything else that is regular in date and wild in amount.
7. **Review at the bottom** of the page.

### Out of scope

- **Merging two commitments that both already exist.** The clarity spec deferred it (D5) and
  this spec only supersedes the _review-list_ half — joining an unclaimed merchant to an
  existing bill. Two live rows still merge by delete-and-re-add.
- **Tier 3.** Still a deliberate non-feature (frozen spec D0). Categories here describe money
  already committed; they are not envelopes.
- **A watch for double-charges after a merge.** The warning fires at merge time. If a merged
  bill later posts twice in a cycle, nothing flags it — a possible follow-up alongside the D8
  stale-subscription prompt.
- **The Review panel on a phone**, still open from the clarity spec's follow-ups.
- Re-scraping or re-importing anything. The Walmart trip of 2026-08-16 the user quoted is not
  yet in the database (last on file is 08-09); nothing here depends on it.

## Decisions

Full reasoning is in `plan.md` D1–D8. The ones that were genuinely open during shaping:

- **Coverage, not gap regularity, defines a tier-2 candidate.** Chosen after the live data
  refuted the first design: Walmart's gaps are 7, 7, 9, 2, 5, 11, 1 — mid-week trips — so a
  gap-consistency test rejects it. Weekly _presence_ is 21 of 26. The user's own description
  ("we go Sunday every week with few exceptions") is a coverage statement, and coverage is what
  `recurringSpendRate` already measures.
- **Day-of-month drift decides months vs days.** Vetsource and rent have overlapping gap
  distributions (28–31); only the day-of-month tells them apart, and it does so cleanly.
- **Warn, never block, on an alias overlap** — this codebase proposes and never applies, and a
  vendor migrating billing systems can legitimately double-charge once.
- **The commitment category outranks a `rules.ts` match but loses to a per-row override.** A
  commitment category is a user-level fact about a merchant group; a row's own category is a
  statement about that charge.
- **Read/edit modes on the URL cell are separate** because one click cannot both follow a link
  and focus an input. The pencil stays in the tab order rather than being hover-only.

## Context

- **Visuals:** None supplied. The URL cell was chosen from two ASCII options during shaping;
  the selected one is `visuals/url-cell.md`, and it is what shipped.
- **References:** `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md` § Financial planning. The envelopes item
  closed with the parent spec; this is curation on top of it, not a new roadmap line.

## Evidence gathered during shaping

Queried against the live database, 2026-08-21:

```
Vetsource, 11 charges         gaps  30 28 28 31 30 28 28 28 28 29
                              d-o-m 30 29 27 24 24 26 23 21 18 16 14   → 28-day cycle
Walmart, last 26 weeks        charges in 21 of 26 weeks (81%)
Walmart amounts               $10.56 – $347.86, median ≈ $193          → 37% deviation vs 25% cap
Declared bills on file        1Password, Geico, Rent, Taylor Gas       → four; the rest is undeclared
```

Code sites that pin each symptom:

- `analytics.ts:1152` `RECURRING_VARIANCE_RATIO = 0.25` — why Walmart never surfaces
- `recurringBills.ts` `cadenceMonthsFromGapDays(28) → 1` — why Vetsource reads monthly
- `ReviewList.tsx:293` `useState("")` — the empty Next charge
- `commitmentRows.ts:101` vs `available.ts:474` — two readings of `anchorDate`
- `commitmentColumns.tsx:335` — the URL cell as a borderless input
- `rules.ts:91` — Walmart's spellings already fold correctly; the detector, not the
  normalisation, is what drops it

## Standards Applied

- `database/migrations` — two new columns and a rename; generated, never hand-written
- `components/ux-principles` — inline editing, commit on blur, icon-only buttons need a title
- `components/data-grid` — new columns are `ColumnDef`s with filter/sort values, hideable,
  persisted through the existing grid state
- `development/dates` — day-interval cadences do calendar arithmetic on `YYYY-MM-DD` keys
- `development/testing` — pure logic in `src/lib/**` with a sibling test; every new mutation
  gets an integration test with a second user failing
- `development/security` — `addMatchersToCommitment` takes `userId` first and proves ownership
- `api/agent-tools` — strict schemas; the `cancelUrl` → `url` break should fail loudly
