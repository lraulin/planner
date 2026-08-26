# Payee evidence, merge from the envelope, and normalizer repair — Shaping Notes

**Status: active** — built and verified at desktop width; the 390×844 pass is what remains before
freezing. See `plan.md` **Changes from original plan** for the five places the build differed.

## Scope

Make the categorisation knowledge the app already learns **visible where its consequence is
visible** — on the envelope — and correctable there. Repair the normalizer defects that fragment
the payees that knowledge keys on.

Three things get built:

1. A **"Files here"** section in the Category/Budget inspector: every payee routing into the
   selected envelope, with filed count, still-unfiled count, and whether its default is
   **applied** or **held** (with the guard's own reason).
2. **Remove** and **Merge** acting from that list, reusing the existing payee-merge flow.
3. **Normalizer repair** — the provable `PP*…` residue fixed outright, city/state gluing raised
   as confirmable proposals behind a read-only audit.

Plus D5: setting or confirming a default **offers to file that payee's waiting rows**, counted
and confirmed first.

### Out of scope

- An amount/date matcher, or any finer grain than the payee. See `references.md` Findings 1–2:
  it would recover **zero rows** against the real ledger.
- A rules table, rule editor, or rule language. `2026-08-24-1522`'s D6 stands.
- Changing D7's learning arithmetic (first assignment, 2-of-latest-3, uncategorised rows occupy a
  window position but do not vote).
- Exempting any envelope from teaching.
- **Amazon order-data categorisation** — 2,328 rows, 42% of the backlog, and the largest single
  remaining slice. It needs order contents, not a matcher. Its own spec.
- A ranked "Needs a decision" queue.
- Blind alias rewriting by regex.

## How the shaping went (three reversals worth keeping)

This spec's conclusion is close to the opposite of where it started, and each turn was forced by
evidence rather than preference. Recorded so the reasoning is not repeated from scratch.

1. **Started at:** "one payee is many products; add a payee+amount match table." That was a
   reasonable reading of the Apple incident.
2. **First turn — the developer's own framing.** Amount alone cannot work: some bills change
   amount (Dropbox monthly → yearly, Spotify's six prices over the years), some products share an
   amount, and day-of-month is the missing discriminator but drifts. This matched Actual's schedule
   identity exactly (payee + amount ±7.5% + date ±2 days), so the design moved to "the bill
   declaration _is_ the matcher" — no new table, since a bill already stores claimed payee,
   `expected_cents`, cadence and `anchor_date`.
3. **Second turn — the data said the bills are already clean.** Every bill envelope is separated
   by payee with no unfiled leakage. The matcher, implemented and run, recovered **0 rows**.
4. **Third turn — a wrong diagnosis, corrected by the developer.** An intermediate reading called
   General Spending "a null functioning as a catch-all," on the grounds that 1,684 rows would file
   there on 1–4 rows of evidence. **Wrong.** General Spending is discretionary spending: Amazon,
   CVS and Sheetz are unpredictable in timing and amount, so they are budgeted as a pooled total
   on purpose. Classification is not the goal — knowing how much to set aside is. Bills are
   granular because they are knowable; everything else pools because only the total is predictable.
   That correction produced D1.

**What survived all three turns is the developer's original instinct:** put it in the detail pane
for the category, let it be corrected there, and learn from the bulk categorisation gesture that
already exists.

## Decisions

- **D1** — Discretionary envelopes teach like any other. No envelope is exempt.
- **D2** — Keep D7's learning rules exactly. No new grain, no conditions, no rule rows.
- **D3** — The Category inspector gains **Files here**, showing the evidence and the
  applied-vs-held state. A held default reports why: _"held: 280 charges still unfiled."_
- **D4** — Remove and Merge act from that list; merge semantics unchanged.
- **D5** — Applying a default offers to file what is waiting, stating the count first.
- **D6** — Repair the normalizer only where provable; propose, never sweep.
- **D7** — Ship behind a read-only audit with no `--apply`.

Full statements in `plan.md`.

### Constraints carried in

- **Alias is the join key; the canonical name is display only.** Alias matching is exact — the
  seed planner and `resolve.ts` must always agree on the key, so any normalizer change is a
  migration, not an edit.
- **Every mutation takes `userId`** and is not done until a second user has failed to read,
  change, and delete the first user's row (`AGENTS.md`, `development/testing`).
- **`npm run test:unit` passing does not mean the database tests ran.** Check for the skip warning.
- **A green gate is not proof the app runs.** `npm run smoke` after touching `src/app/**`.

## Context

- **Visuals:** None. One ASCII sketch of the Files-here section in `plan.md` D3.
- **Data:** `Transactions.csv` — 7,322-row production export, 2026-08-25. Not committed (personal
  financial data). Every number that decided this spec is preserved in `references.md`; the file
  itself is not needed to re-read the spec.
- **References studied:** `references.md`, including the Actual schedule-matching code that was
  read and deliberately not adopted.
- **Product alignment:** Finances is beyond Achieve; Actual Budget is the reference. This spec
  keeps Actual's semantics where they apply and records, with evidence, where they do not.

## Standards applied

- **development/clean-code** — logic in `src/lib/**`, components never touch the db, `actions.ts`
  stays thin, every mutation takes `userId`. Also _"when the model is wrong, change the model"_ —
  weighed here and **declined**: the ledger shows the model is right and only unreadable, so this
  is a transparency change, not a migration across tables.
- **development/testing** — pure logic beside its module; database work gets
  `*.integration.test.ts` with a cross-user case; no React component tests.
- **development/security** — ownership proved before every write; errors say little.
- **components/ux-principles** — inspector pane, inline editing, commit on blur, modals only for
  confirmations.
- **components/modal-pattern** — the D5 count confirmation and the D4 merge dialog build on
  `ModalShell`.
- **components/responsive** — driven at 390×844 as well as desktop; 44px tap targets.
- **database/migrations** — generated, never hand-written; the D6 alias change is a migration.
- **development/commits** — one logical change per commit; the body says what the root cause was.
