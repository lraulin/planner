# Payee evidence, merge from the envelope, and normalizer repair

**Status: active**  
Spec folder: `agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/`

## Context

The Apple fix (389cfe6) stopped `Track as bill` on `PP*APPLE.COM/BILL` from teaching the whole
299-charge payee a default. That prompted the question: should Rules come back, made transparent
by living in the Category detail pane and learned from bulk categorization?

**A read of the real ledger (7,322-row production export) says the mechanism is already right and
only invisible.** Findings that drove every decision below:

| Question                                       | What the data says                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does one payee ever need two envelopes?        | **No.** 1 of 72 categorized merchants spans two, and it is `PAYPAL TO LEE RAULIN INST XFER` — an opaque-identity artifact, not a categorization split.                                                            |
| Would payee+amount+date matching recover rows? | **Zero rows.** Every bill envelope is already cleanly separated by payee with no unfiled leakage: `CVSEXTRACARE(31)`, `GITHUB INC(34)`, `SIMPLISAFE(34)`, SMECO, YouTube, VA, Comcast, MetLife, Anthropic, Geico. |
| Is the existing learning guard wrong?          | **No — it is correct and unreadable.** It blocks Apple (file 12 of 292 → 280 left → no learn) and permits Amazon (file 372 of 372 → 0 left → learn). Nothing tells the user which happened.                       |
| What actually blocks progress?                 | **Payee fragmentation** — nearly every envelope is fed by 2–5 strings that are one payee. And ~1,500 unfiled rows sit behind ~6 known destinations.                                                               |

So: no rules table, no amount/date matcher, no new grain. The correction is to **show the evidence
that already exists**, let it be fixed where it is seen, and repair the normalizer that fragments it.

Superseded premise: an earlier draft of this plan proposed a `payee + approximate amount` match
table modelled on Actual's schedule identity. The ledger shows it would have had no work to do.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` — D7 payee
  auto-category (`learn`/`fixed`/`off`, claim beats default, 2-of-latest-3) carries forward
  **unchanged**. Its D6 _Retire Rules_ stands, now with ledger evidence rather than only distaste
  for the UI.
- **Supersedes:** that spec's **D8** — "Payees is the only auto-category surface." The Category
  inspector becomes a second surface, because the envelope is where the consequence is visible.
- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` — identity, aliases, merge. Alias
  is the join key; canonical name is display only. Merge gains a second entry point.
- **Extends:** `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/` — filter → select
  all → set category is the teaching gesture. `setTransactionBudgetCategories` already learns once
  per distinct payee; this spec makes the outcome legible.
- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — the pane gaining the section.
- **Does not revive:** `agent-os/specs/2026-08-23-1536-finance-rules/`. It stays retired.

## Decisions

**D1 — Discretionary envelopes teach like any other.** General Spending is a deliberate answer
(Amazon, CVS, Sheetz — unpredictable in timing and amount, budgeted as a pooled total), not a null.
No envelope is exempt from learning. Exempting it would leave the largest, most repetitive part of
the backlog permanently manual.

**D2 — Keep the learning rules exactly as D7 defines them.** No new grain, no amount or date
condition, no rule rows, no precedence list. The one place amount could earn its keep is the opaque
PayPal string, and D6 handles that as an identity problem instead.

**D3 — The Category inspector gains a "Files here" section.** For the selected envelope, every
payee that routes to it, with the evidence:

```
Spotify — Files here                        filed  unfiled
  SPOTIFYUSAI                                 26       —
  SPOTIFY                                     15       —
  P                        ⚠ damaged name      6       —
  PAYPAL TO LEE RAULIN…    ⚠ also → Dropbox    3      40
                                     [Merge…] [Remove]
```

Each row shows filed count, still-unfiled count for that payee, and whether the default is
**applied** or **held**. A held default states why in the guard's own terms — _"held: 280 charges
still unfiled"_ — which is the whole Apple incident, visible before it bites. Claims, learned
defaults, and fixed defaults are all listed and visually distinguished.

**D4 — Remove and Merge act from that list.** Remove clears the default (or releases the claim).
Merge opens the existing payee-merge flow with these payees preselected, so `Spotify`'s four strings
become one payee without a trip to Payees. Merge semantics are unchanged from the payees spec —
target keeps its claim and auto-category; conflicting claims still block.

**D5 — Applying a default offers to file what is waiting.** When a default is set or confirmed and
that payee has unfiled eligible rows, offer to file them, stating the count first
(_"File 372 waiting AMAZON MKTPL charges into General Spending?"_). Explicit, counted, and
reversible — never a silent sweep. This is the ~1,500-row win, in roughly six decisions.

**D6 — Repair the normalizer, but only where the repair is provable.**

- **Fix outright:** `PP*P36C17FF0B` → `P`. Stripping `PP*` then the order ref leaves a one-letter
  residue that becomes a payee. `isOpaquePaypalDescription` already treats `length < 3` as opaque;
  the residue must never become an alias when no counterparty resolves it.
- **Propose, never sweep:** the ~140 merchants with city/state glued on by fixed-width bank fields
  (`SAFEWAY 1731PRINCE FREDERMD`, `WAWA 592CALIFORNIAMD`, `KIMS NAILS IIICALIFORNIAMD`). These
  surface as **merge proposals the user confirms**, not an automatic rewrite.

  **A blind sweep is provably unsafe** — tested against the full export, prefix-matching produced
  `AMAZON PRIME → AMAZON` (collapsing a subscription into discretionary — destroying exactly the
  distinction this app exists to make), `GRAY MIRROR → GRAY` (merging the correct name into the
  damaged one), and would truncate `EVERGREEN DISPOSAL` → `EVERGREEN DISPOS` on a trailing "AL".
  Every candidate must be confirmed against a real second alias, and the audit reports before
  anything writes.

**D7 — Ship the change behind an audit, in the established shape.** A read-only script
(`scripts/payee-merge-audit.ts`, modelled on `scripts/flow-audit.ts` — which has no `--apply` and
says so) reports, per proposal: the merchants, row counts, and destination envelopes. Run it against
the real ledger and read it before any migration writes.

**Out of scope:** an amount/date matcher; a rules table or editor; a rule language; changing D7's
learning arithmetic; Amazon order-data categorization (the single largest remaining slice — 2,328
rows across 64 merchant strings — belongs to `scripts/amazon-orders-slim.ts` and its own spec); a
"Needs a decision" ranked queue.

## Acceptance criteria

- [x] The Category inspector lists every payee filing into the selected envelope, with filed count,
      unfiled count, and applied-vs-held state; a held default gives the guard's reason.
- [x] A payee whose default routes elsewhere, or that is damaged (`P`), is flagged in that list.
- [x] Remove clears a default / releases a claim from the inspector. Merge opens the existing flow
      with those payees preselected and honours the frozen merge semantics.
- [x] Setting or confirming a default offers to file that payee's waiting rows, stating the count
      before writing; declining files nothing.
- [x] Bulk categorize from a Register filter still learns once per distinct payee, and the inspector
      afterwards shows whether it learned or held.
- [x] `PP*P36C17FF0B` no longer yields the alias `P`; a unit test pins the whole residue family.
- [x] City/state merges are proposals only. No migration rewrites an alias without confirmation.
      Regression tests pin `AMAZON PRIME`, `GRAY MIRROR`, and `EVERGREEN DISPOSAL` as non-merges.
- [x] `scripts/payee-merge-audit.ts` runs read-only, has no `--apply`, and its output is reviewed
      against the real ledger before the migration runs.
- [x] A second user cannot read, change, or delete the first user's payees, defaults, claims, or
      transactions through any new mutation (`*.integration.test.ts`, per `AGENTS.md`).
- [~] lint, typecheck, `test:unit`, non-skipped database tests with Postgres up, production build,
  and `npm run smoke` on a running dev server. Driven in a browser at desktop;
  **390×844 still outstanding** (see Changes from original plan, row 5).

## Changes from original plan

| #   | Change                                                                            | Why                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **D6's repair is a recompute in the seed pass, not a schema migration.**          | The alias is the join key, so the plan called the fix "a migration". Nothing in the schema changes: `seedPayees` already recomputes `payee_id` from the normalizer and is idempotent. It now also **detaches** a row whose description normalizes to nothing but still carries a payee — the `P` case — and reports the count. Re-running writes nothing. |
| 2   | **D5's offer is triggered from the Files-here row, not from a default-set form.** | The count only exists where the evidence is, and the inspector is the surface that has it. `File N waiting…` sits on the payee's own line, states the count in the confirmation, and does nothing on Cancel.                                                                                                                                              |
| 3   | **City/state proposals surface in the audit only; no proposal UI was built.**     | D6 says propose, never sweep, and D7 puts the report behind a read-only script. Confirming one is the merge dialog that already exists, reached from the Files-here list. A second proposal screen would add a surface without adding a decision.                                                                                                         |
| 4   | **`PayeeMergeDialog` now takes `{ id, name }` rather than a whole `PayeeRow`.**   | Two callers select different row shapes for the same payees. Everything else the dialog shows already came from the server preview.                                                                                                                                                                                                                       |
| 5   | **Not yet verified at 390×844.** Everything else in the gate ran and passed.      | Chrome would not resize the window below the desktop viewport in this session. The section uses the inspector's existing responsive conventions (44px targets, wrapping action rows, truncating names) and the compact inspector is already a full-screen drawer — but it has not been driven on a narrow viewport, so the spec stays active until it is. |

## Tasks

**Task 1 — Save spec documentation.** ✅ **Done 2026-08-25.** `plan.md` (this), `shape.md`,
`standards.md`, `references.md`. `references.md` records the ledger analysis in full — it is the
evidence for _not_ building the amount/date design, and it outlives the conversation that produced
it. No `visuals/`: the only sketch is D3's, inline above.

**Task 2 — Evidence queries.** ✅ **Done.** In `src/lib/finances/payees/queries.ts`: payees filing into an
envelope, with filed/unfiled counts and applied-vs-held state. The held reason reuses
`shouldLearnFromCategoryEdit` (`autoCategory.ts`) rather than restating its logic. Pure shaping in
a tested `lib` module per `AGENTS.md`.

**Task 3 — "Files here" section** ✅ **Done.** in `src/components/finances/budget/BudgetInspector.tsx`, following
its existing section pattern and `labelClass`/`fieldClass` conventions. Wire through `BudgetView.tsx`
alongside `onEditPayees`.

**Task 4 — Remove and Merge from the inspector** ✅ **Done.**, reusing the payee merge flow (`payees/merge.ts`)
and existing mutations. New/changed mutations take `userId` and get integration tests with a second
user attempting read, change, and delete.

**Task 5 — File-what-is-waiting** ✅ **Done.** on default set/confirm, counted and confirmed before the write,
reusing `setTransactionBudgetCategories`.

**Task 6 — Normalizer repair.** ✅ **Done.** Fix the PayPal residue in `classify/merchant.ts` with tests for the
residue family. Build city/state candidates as proposals; pin the three hazard non-merges.

**Task 7 — `scripts/payee-merge-audit.ts`** ✅ **Done.**, read-only, no `--apply`. Run it against the ledger and
read the output before any alias migration.

**Task 8 — Verify and freeze.** 🔄 Gate green — lint, typecheck, 3,342 unit tests, 879 database
tests with Postgres up (no skip warning), production build, and `npm run smoke` across all 60
routes — and the flow was driven end to end in a browser at desktop width: the Files-here list,
a held first default with its reason, the counted filing confirmation, Remove, and the merge
dialog opening preselected. **Outstanding: the 390×844 pass.** Freeze once that is done. Full gate (see acceptance criteria), browser at both widths, then
mark `plan.md` / `shape.md` **frozen / complete**, complete **Changes from original plan**, and
record follow-ups as new work — chiefly **Amazon order-data categorization**, the largest remaining
slice of the backlog.

## Verification

1. `npm run db:up`, `npm run dev`.
2. Budget → select **Spotify** → confirm the four feeding payees, counts, and the `P` /
   `PAYPAL TO LEE…` flags. Merge them; confirm one payee and unchanged filed counts.
3. Register → filter to `AMZN MKTP US` → select all → set **General Spending**. Reopen the
   inspector: the default reads _applied_. Accept the offer to file the waiting rows; confirm the
   count matches.
4. Repeat filtered to a **subset** of Apple charges. Confirm the default reads _held_ with the
   remaining-unfiled reason, and that no payee-wide default was written.
5. `npx tsx --env-file=.env.local scripts/payee-merge-audit.ts --user <uuid>` — read it; confirm
   `AMAZON PRIME`, `GRAY MIRROR`, and `EVERGREEN DISPOSAL` are absent from the proposals.
6. `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration`, then
   `npm run build` and `npm run smoke` against the dev server. Check for the Postgres skip warning.

> **Standing rule:** while this spec is active, material changes to requirements, design, or scope —
> including feedback on what was built — update `plan.md` / `shape.md` and append a row to
> **Changes from original plan**. Freeze when verified.
