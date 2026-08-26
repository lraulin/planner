# Standards — payee evidence, merge from the envelope, and normalizer repair

**Status: active**

Canonical standards are referenced rather than copied so this spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  the app → components → lib → db direction: the evidence shaping goes in `src/lib/finances/payees/`,
  `BudgetInspector.tsx` never touches the db, `actions.ts` stays thin. Every mutation takes
  `userId`. **Also the rule this spec deliberately did not invoke:** _"when the model is wrong,
  change the model."_ It was weighed — the Apple incident looked like a grain error — and declined
  on evidence (`references.md` Findings 1–2). The payee grain is right; only its visibility is
  wrong. Do not re-open it as a schema change without re-measuring.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) —
  the evidence/held-reason shaping is pure logic in `src/lib/**` with a test beside it. Anything
  touching the database (D4 remove/merge, D5 file-what-is-waiting, the D6 alias migration) gets a
  `*.integration.test.ts` and is not done until a second user has failed to read, change, and
  delete the first user's row. No React component tests. **`npm run test:unit` passing does not
  mean the database tests ran** — check for the skip warning.
- [`agent-os/standards/development/security.md`](../../standards/development/security.md) —
  ownership proved before every write; the new queries are user-scoped joins, and a merge that
  crosses users must be impossible rather than merely unlikely.
- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  the inspector is master-detail and preserves context while scanning; inline edit, commit on
  blur; modals only for confirmations. The Files-here list is scan-first: counts and state read
  without a click.
- [`agent-os/standards/components/modal-pattern.md`](../../standards/components/modal-pattern.md) —
  `ModalShell` for the D5 count confirmation and the D4 merge dialog: roles, focus, capture-phase
  Escape, and an explicit choice about whether closing discards the draft.
- [`agent-os/standards/components/responsive.md`](../../standards/components/responsive.md) —
  `md` is the split; below it the inspector is a full-screen sheet. 44px tap targets on Remove and
  Merge. Verify at 390×844.
- [`agent-os/standards/database/migrations.md`](../../standards/database/migrations.md) —
  generated with its snapshot, never hand-written; the direct connection, not the pooler. The D6
  alias change is a migration because **the alias is the join key** — `resolve.ts` matches exactly,
  so a normalizer change that is not migrated silently orphans every affected row.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; imperative subject under 72 characters naming the effect, not
  Conventional Commits; a body saying **what the root cause was**; `Spec:` trailer to this folder.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern Actual Budget
reference use, the spec lifecycle, tests, and smoke verification.

## The two that bite hardest here

**The guarded-migration shape.** D7's audit is not optional ceremony — it is the pattern
`2026-08-23-1041-payee-matcher-cutover` proved twice and `scripts/flow-audit.ts` demonstrates:
a pure deterministic planner, dry-run by default, idempotent, all-or-nothing per user, reporting
**counts** rather than transaction ids, and no `--apply` on the audit at all. `references.md`
Finding 7 is the concrete reason: a plausible-looking sweep merged `AMAZON PRIME → AMAZON` and
`GRAY MIRROR → GRAY` on real data.

**Smoke is a step you take, not one that takes itself.** Nothing in the gate evaluates a
`"use server"` module — the tests never import one, and `next build` compiles routes without
rendering them because every page is `force-dynamic`. After touching anything under `src/app/**`,
start the dev server and run **`npm run smoke`** (23 routes).
