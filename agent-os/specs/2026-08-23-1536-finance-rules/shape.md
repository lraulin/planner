# Rules — Shaping Notes

**Status: frozen / complete** (2026-08-23)

## Scope

Make transaction categorisation **user data**. Before this work,
`src/lib/finances/classify/rules.ts` held 65 hardcoded regexes; adding one was a TypeScript edit
and a deploy. This spec moved the corpus
into a `finance_rules` table with Actual-shaped `{field, op, value}` conditions, gives it a page
with a drawer editor and drag-to-reorder, adds a preview before any write, and retires the last
four places where a rule supplied merchant _identity_ — a job payees now own.

It also connects four pieces of budget capability that are built, tested, and reachable by
nothing.

### Out of scope

- A user-editable category taxonomy. `FINANCE_CATEGORIES` stays a fixed list.
- Auto-learned category rules (Actual's 3-of-last-5 `updateCategoryRules`).
- Split transactions and sub-transactions.
- Rules that link schedules or delete transactions.
- An OR across fields (`conditionsOp`). Within-field OR is `oneOf`; across fields it is two
  rules.
- Merging Commitments / Available to Spend with envelopes — still deliberately parallel, still
  waiting on evidence from use.

## Decisions

The full set is D1–D9 in `plan.md`. The three that took the most thought:

**Rule order is explicit, and Actual's ranking is not adoptable here.** This looked like a
preference question and turned out to be arithmetic. Actual scores condition specificity to rank
rules, and `matches` scores **0** (`../actual/packages/loot-core/src/server/rules/rule-utils.ts:18-35`);
the ×2 bonus needs _every_ condition to be `is|isNot|isapprox|oneOf|notOneOf`. All 65 seeded
rules are regexes, so all 65 would score zero, tie, and be ordered by id — which rule wins would
be a UUID comparison. Actual's scoring is calibrated for a corpus dominated by `payee is <id>`;
ours is dominated by the one op the score cannot see into. So the order the user drags _is_ the
priority, and first match wins — which also keeps `ruleId` singular, so "why is this Dining?"
stays answerable with one name.

Implementation then found that **no two of the 65 patterns claim the same merchant** anywhere in
the 851 distinct merchant strings the real file contains, so order currently decides nothing.
That does not change the decision — it changes what the decision is _for_. It is not protecting
the seeded corpus; it is making sure the first broad rule Lee writes by hand lands somewhere
legible instead of somewhere arbitrary.

**`merchant matches` is permanent, not a compatibility shim.** The tempting move, now that
payees are stable, is to convert every regex into `payee oneOf [uuid…]` and be done with
strings. That would break the rules that matter most: `grocery-chains`, `dining-chains`,
`fuel-chains` and `software-vendors` exist to categorise a merchant **on first sight**. A
never-before-seen spelling does get a payee in the same pass — but a _new_ one, in no `oneOf`
list. Regex is the only op that fires on a merchant nobody has met. Payee conditions earn their
place separately: they survive a rename and are correct after a merge.

**A Register draft prefers `payee is <id>`.** When the selected row already has stable identity,
matching its normalized merchant would throw that identity away and regress across aliases,
renames and merges. An escaped, anchored merchant regex remains the honest fallback only for a
row whose payee is still null.

**The refund rekey shipped alone, first.** Moving `spendingMerchants` from merchant strings to
payee ids is payee-spec follow-up #3. It was expected to move rows, but the preceding matcher
cutover had already repaired the disagreement; the real audit proved a genuine zero by showing
that a tripwire could still find all 64 refund rows. Keeping it separate preserved the rule
seed's stricter zero-difference circuit breaker.

## Context

- **Visuals:** None.
- **References:** `../actual/packages/loot-core/src/server/rules/{rule,condition,action,rule-utils}.ts`;
  in-repo, `src/lib/finances/rules/{starterRules,conditions,match}.ts` and
  `src/lib/finances/classify/{categorize,reclassify}.ts`,
  `src/lib/finances/schedules/conditions.ts`, `src/lib/finances/payees/{seed,resolve}.ts`,
  `src/components/finances/{payees,schedules}/`. Full list in `references.md`.
- **Product alignment:** This closes the roadmap's _"Rules is the next layer on these same
  stable ids"_ item and three frozen-spec follow-ups.

## Why this is one table and not sixteen files

Actual's rules package is large because it is also the transaction write path, the schedule
linker, the split calculator and the formula evaluator. Here, `planReclassify` already **is** the
engine: pure, idempotent, writing only changed rows, already running on import and behind a
button. This spec replaces one _input_ to it and adds a preview. Everything else in Actual's
rules package is either out of scope or already solved by a different concept in this app.

The corollary is the sharpest constraint in the spec: **if precedence, transfer detection,
income cadence or idempotence move, the audit has caught a bug, not a feature.**

## The trap that would be easiest to ship

A rule that sets a `flow` enters `claimedByDetector`, which changes `detectIncome`, which shifts
the biweekly paycheck median — the single figure the whole dashboard leans on. So the preview
cannot be "which rows would change category"; it has to be the full `planReclassify` diff
including both income figures. Anything less under-reports the most dangerous action a user can
take, and does it silently.

Close behind: a regex with the `g` flag. `.test()` with `g` advances `lastIndex`, so a
compiled-once rule returns alternating answers down 7,030 rows — right in the editor, wrong in
the register. It is refused at parse.

## Standards Applied

- `database/migrations` — a new table and a seeded data migration.
- `development/clean-code` — the dependency direction (`payees/seed.ts` stops importing from
  `classify/`), one shared implementation per concern (preview reuses `planReclassify` +
  `changedRows` rather than reimplementing what a run would do), no speculative generality
  (per-field composition is deliberately _not_ built).
- `development/testing` — pure logic in `src/lib/**` with sibling tests, every DB mutation with
  a cross-user case, no component tests.
- `development/security` — every mutation takes `userId` and proves ownership; a rule must not
  reach another user's rows.
- `development/commits` — one logical change per commit; the refund rekey is its own.
- `components/{ux-principles,navigation,data-grid,drawer-pattern,modal-pattern,responsive}` —
  grid + drawer, drag-to-reorder as a first-class grid affordance, a modal only for the
  preview confirmation, a command registered for every menu entry, and a touch path for
  reordering because drag is disabled below `md`.

## Follow-ups (new work — not amendments to this frozen spec)

Auto-learning, editable category taxonomy, split transactions and per-field action composition
remain possible delta-specs. None is required to keep this implementation correct.
