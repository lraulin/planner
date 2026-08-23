# Payee matcher cutover — ids own commitment and schedule matching

**Status: active**
Spec folder: `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` — activates the
  stable payee identity, claims, rename and merge infrastructure prepared there.
- **Extends:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — preserves its
  recurrence, status, skip and discovery behavior while making payee conditions hold ids.
- **Extends:** `agent-os/specs/2026-08-14-1208-finance-agent-tools/` — keeps the
  finance tool behavior while replacing matcher-shaped inputs with stable ids.
- **Supersedes:** `agent-os/specs/2026-08-16-1938-commitments/` — replaces D2's
  `matchers text[]` storage and D3's application-level cross-table exclusivity with payee
  claims. The two commitment tiers and every other decision carry forward.
- **Supersedes:** `agent-os/specs/2026-08-18-2058-commitments-clarity/` — replaces only
  matcher-shaped plumbing; its display and review decisions carry forward.
- **Supersedes:** `agent-os/specs/2026-08-21-1122-commitments-curation/` — replaces only
  matcher-shaped candidate and suppression plumbing; its propose-never-apply behavior
  carries forward.
- **Supersedes:** `agent-os/specs/2026-08-21-1810-register-track-as-bill/` — replaces
  matcher arrays and `claimedMatchersOf` with payee ids and database-enforced claims.
- **Supersedes:** `agent-os/specs/2026-08-22-2124-actual-schedules/` — replaces the
  deliberate temporary divergence that stored merchant strings in payee conditions.

## Context

The payee catalog now supplies stable identities, aliases, transaction `payee_id` values,
and claim columns. The business layer still keys every commitment and schedule match on a
display string stored in `finance_recurring_bills.matchers`,
`finance_recurring_spend.matchers`, or a schedule condition. That split is intentionally
temporary: renaming a payee can otherwise move charges, merging can orphan a commitment,
and the database cannot protect the central invariant that one payee belongs to at most one
commitment while strings remain authoritative.

This delta takes the prepared join atomically across every money-sensitive reader, editor,
schedule, and agent contract. It does not introduce the later generic Rules engine.

The local preflight found six distinct commitment matcher tokens and five schedule payee
tokens. Five commitment tokens and all schedule tokens resolve exactly to existing payees.
`DOMINOS` currently matches no charge and has no payee; the cutover creates a placeholder
payee and alias so its current and future exact-match meaning survives. There are no existing
claims and no collision in which one payee is claimed by two commitments.

## Decisions

- **D1 — Payee ids are authoritative everywhere.** Commitment rows expose
  `payees: { id, name }[]`; mutations take `payeeIds`; categorization, review,
  Available to Spend, Insights, the Sankey and rates match transaction `payeeId` to a
  payee claim. Human names are display only.

- **D2 — Schedule payee conditions keep Actual's condition shape and store UUIDs.** The
  JSONB contract remains `{ field: "payee", op, value }`, including this app's `oneOf`
  extension, but each value is a payee id. Views resolve ids to names. Matching compares
  the condition with `transaction.payeeId`.

- **D3 — Commitments may claim zero payees.** A commitment without payees is valid and
  remains visible; it simply has no matched charges. Existing ignored/cancelled status
  semantics continue to suppress it exactly as today.

- **D4 — Cut over in two guarded stages.** Stage A adds an idempotent, all-or-nothing
  compatibility planner and executor, dual-writes claims while legacy columns remain, and
  accepts both string and UUID schedule values. Stage B runs only after the audit reports
  parity, switches every reader, asserts all remaining schedule payee values and commitment
  references are valid, then drops both matcher columns and the compatibility reads.

- **D5 — Resolution is deterministic and conflicts stop the whole user.** Resolve each
  legacy token by existing normalized alias, then case-insensitive exact payee name, then
  create a placeholder payee plus alias. Malformed schedule JSON, cross-commitment claims,
  unresolved references, or a blocking parity difference is reported before any write. A
  payee-only difference is accepted only when every added row is an opaque PayPal bank line
  whose statement resolution supplied the real payee; named-merchant and legacy-only
  differences still block. The executor runs in one transaction scoped to one user and is
  idempotent.

- **D6 — Category precedence is unchanged.** A transaction's explicit category remains
  above derived values. The derived order remains commitment category, description rule,
  then bank category. Only the commitment lookup key changes from merchant string to payee
  id.

- **D7 — Rename and merge become first-class human operations.** Rename is inline on
  desktop and in the full-screen payee sheet on compact screens. Merge is a multi-select
  command that chooses a survivor and previews moved aliases, transactions, schedule
  conditions and the commitment claim. A merge with different claims is refused.

- **D8 — Agent contracts move to ids with a bounded compatibility window.** Add
  `list_payees`, `search_commitments`, `find_commitment_candidates`,
  `save_subscription`, `save_recurring_spend`, and `set_commitment_payees` with compact,
  paged id-bearing results. Existing matcher-named tools remain hidden legacy adapters under
  their current wire names; they resolve or mint payees and delegate to the id mutations.
  They are not returned by normal discovery.

- **D9 — Deletion cannot create a dangling semantic reference.** Deleting a payee is
  refused while it carries a commitment claim or appears in a schedule condition. Merge is
  the operation for intentionally consolidating an in-use identity.

## Divergences from Actual

| Actual                                             | Here                                                      | Why                                                                    |
| -------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Rule engine owns payee-conditioned behavior        | Direct commitment claims and schedule JSONB use payee ids | Rules are a later spec; stable identity should not wait for its editor |
| `payee_mapping` preserves merged ids for sync/undo | Merge rewrites all references transactionally             | This app has neither CRDT replay nor an undo log                       |
| Schedule payee conditions use `is`                 | `is` and existing `oneOf` remain                          | One schedule may intentionally cover several payees                    |

## Out of scope

- The generic Rules engine, Rules editor and rule priority model.
- Auto-learned category rules.
- Per-transaction payee overrides.
- Actual's transfer payees, favorites and `learn_categories` flags.
- System-payee merge rules or report enhancements unrelated to this cutover.

## Acceptance criteria

- [ ] The Stage A planner is deterministic, dry-run by default, all-or-nothing per user,
      idempotent, and reports malformed input, collisions, unresolved tokens and parity
      differences without writing.
- [ ] The local legacy data resolves to the audited six commitment tokens and five schedule
      tokens; `DOMINOS` becomes a placeholder payee; a second apply makes zero changes.
- [ ] A second user cannot read, change or delete the first user's cutover rows, claims,
      payees or schedules.
- [ ] Multiple legacy tokens resolving to one payee do not double-count charges, and one
      payee cannot be claimed by two commitments.
- [ ] Dashboard, Available to Spend, Insights, Sankey, review, commitment rates and every
      other finance figure are byte-identical before and after the cutover except the
      accepted 13-row/$319.17 PayPal identity correction recorded below.
- [ ] Commitment category precedence remains explicit row override > commitment category >
      description rule > bank category.
- [ ] Ignored and cancelled commitments continue to suppress their charges exactly as today.
- [ ] Commitments, Review, Register and Schedules use payee pickers and stable ids; a
      transaction without a payee cannot be claimed until reclassification supplies one.
- [ ] Rename changes labels everywhere without changing any finance figure or breaking a
      schedule or commitment match.
- [ ] Merge rewrites aliases, transactions, schedules and the lone claim in one transaction;
      different claims are refused with no partial write.
- [ ] Agent discovery publishes the id-based contracts and hides matcher-shaped adapters;
      adapters preserve existing wire compatibility by resolving or minting payees.
- [ ] Stage B refuses to run with invalid UUID schedule conditions, unresolved matcher state
      or dangling claims, then removes both matcher columns and all legacy matcher readers.
- [ ] Desktop and phone layouts provide complete Rename/Merge/payee-picker paths in light and
      dark mode, and every route renders under the smoke gate.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Production Stage A apply remains blocked after its first dry-run: it plans 38 claims and no schedule rewrites, but five commitments select different transaction sets through legacy merchant strings and payee ids. The audit now reports those differences as merchant-group counts and signed cents without transaction ids.                                                                                                                                             | The local fixture was not representative of production history. Preserving byte-identical finance behavior is an explicit circuit breaker, so the production data shape must be explained before any write or Stage B switch.                                                                                                                                                               |
| 2   | PayPal statement resolutions may match only register rows whose bank description identifies the PayPal rail; date and signed amount then disambiguate those eligible rows.                                                                                                                                                                                                                                                                                                  | Production diagnostics found a Spotify resolution attached to an unrelated CVS purchase. The shared matcher previously omitted descriptions from its input contract, allowing any same-amount row within five days to steal a resolution and corrupt both reclassification and payee assignment.                                                                                            |
| 3   | A PayPal statement counterparty supplies payee identity only when the bank description is opaque (`PAYPAL *`, a transfer rail, or a one-letter residue). A specific bank merchant remains authoritative.                                                                                                                                                                                                                                                                    | Production held 24 YouTube charges under generic `GOOGLE` and two Sanebox charges under punctuation-only `SANEBOX INC.` because a broader statement name overwrote the more-specific bank line. This refines the prepared payee spec's counterparty precedence before claims make that identity money-sensitive.                                                                            |
| 4   | The production payee rebuild corrected 88 transaction assignments, created four specific payees and claimed five newly observed spellings. Afterward, parity differs only for 13 opaque PayPal rows totaling $319.17: one Dropbox payment ($127.08), nine Spotify payments ($162.09), and three GitHub payments ($30.00). Those rows are accepted as an intentional correction, and the guard permits only payee-only opaque-PayPal enrichments while still reporting them. | PayPal statements identify the actual recipient where the legacy bank merchant was only `P` or a shared transfer rail. Preserving exact old figures would deliberately discard known merchant identity. The semantic guard captures why the correction is safe without hard-coding today's three merchants, while any named-merchant difference or lost legacy row still stops the cutover. |
| 5   | Stage A assigned 38 production payee claims without creating payees, releasing claims, or rewriting schedules. Its immediate production replay was idempotent and planned zero writes; the deployment-only cutover flag was then removed.                                                                                                                                                                                                                                   | The production audit and transaction completed against the corrected payee catalog, and a separate dry-run build proved the stored result is the complete desired state before any reader switches to claims.                                                                                                                                                                               |
| 6   | Payee merge treats the same commitment claim repeated across selected payees as one surviving claim; only distinct commitment identities refuse the merge. The confirmation previews normalized aliases, transactions, register total, schedules, and the resulting claim before writing. A searchable selection sheet provides the compact-screen path where tapping a row opens its drawer instead of extending grid selection.                                           | Stage A can legitimately assign one commitment to several payees that were previously separate matcher tokens. Counting claimed rows made those bridge-created aliases impossible to consolidate even though no commitment choice was ambiguous. A phone cannot rely on desktop modifier-key selection, so the operation needs an explicit touch path rather than a disabled command.       |

---

## Task 1: Save the active intent checkpoint

- [x] Create `plan.md`, `shape.md`, `standards.md`, and `references.md`; no visuals.
- [x] Copy the selected standards in full so the active implementation is self-contained.

## Task 2: Build and run Stage A

- [x] Add a pure cutover planner with adjacent tests for resolution order, placeholders,
      collisions, malformed conditions, deduplication, parity and idempotence.
- [x] Add a user-scoped transactional executor and integration coverage, including a second
      user's failed read/change/delete attempts.
- [x] Add a CLI that dry-runs by default and requires explicit `--apply`.
- [x] Dual-write commitment claims and accept string or UUID schedule payee values during
      the compatibility window.
- [x] Run dry-run, apply and repeat locally; capture the audited counts and numeric parity:
      one placeholder, six claims, five schedule rewrites, and no parity differences; the
      replay planned zero writes.
- [x] Deploy Stage A, then run the same dry-run, apply and replay against production before
      any Stage B code can ship.
  - Stage A assigned 38 claims and changed no payee, schedule, or existing claim rows beyond
    those assignments. The replay reported `canApply: true`, `isIdempotent: true`, and zero
    planned writes; the accepted correction remained reported and no blocking difference
    remained.

## Task 3: Switch commitment behavior to payee ids

- [ ] Replace `matcherIndex` / `resolveMerchant` with a payee-claim index in every business
      reader: Dashboard, Available, Insights, Sankey, commitment rates and review.
- [ ] Replace commitment category lookup keys with payee ids without changing precedence.
- [ ] Make claim replacement transactional and ownership-scoped.

## Task 4: Complete schedule conversion

- [ ] Parse and match payee conditions as UUIDs after Stage A.
- [ ] Resolve condition ids to payee names in list/editor surfaces.
- [ ] Convert bill import, discovery and schedule editing to stable payee ids.

## Task 5: Complete human and agent surfaces

- [ ] Replace free-form commitment/schedule matchers with payee pickers in Commitments,
      Review, Register and Schedules; show payees in Advanced Find.
- [ ] Add inline/drawer Rename and previewed Merge commands to Payees.
- [ ] Harden delete against claims and schedule references.
- [ ] Add the id-based agent tools and hidden legacy adapters; regenerate tool docs.

## Task 6: Run Stage B and retire legacy storage

- [ ] Generate a guarded Drizzle migration, including snapshot and journal entry, that drops
      both matcher columns only after the data assertions pass.
- [ ] Remove compatibility branches and obsolete matcher helpers.
- [ ] Update the Actual reference map to record the shipped cutover and Rules as next.

## Task 7: Verify and freeze

- [ ] Run unit and real-Postgres integration tests with no database skips, lint, typecheck,
      build, agent-doc validation and route smoke.
- [ ] Verify desktop and 390×844 phone flows in light and dark mode with the app driver.
- [ ] Record as-built material changes, check acceptance, update the roadmap and freeze.
