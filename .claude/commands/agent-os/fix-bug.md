# Fix Bug

Investigate a reported bug down to its root cause, then make the smallest change that
removes that cause — not the smallest change that makes the symptom go away.

**Argument:** the bug report — an error message, a wrong behavior, a failing test, a
screenshot, or "the thing I just described."

When this command says `AskUserQuestion`, use the current harness's structured question
facility: `AskUserQuestion` (Claude Code), `ask_user_question` (Grok),
`vscode_askQuestions` (Copilot), or `request_user_input` in Codex plan mode. In another
Codex mode, ask one concise direct question instead. **Under `/overnight` nobody is awake:
never ask — take the minimal fix and record the larger one as a follow-up.**

## Why this exists

Nearly all of this code is agent-written and reviewed by one person in a hurry. The
failure mode is not that a bug is hard to patch — it is that the patch is small,
plausible, passes review, and leaves the cause in place, so the bug returns wearing
different clothes. A bug is evidence about the shape of the code. Spend the investigation
before spending the edit.

## Process

### Step 1 — Establish what the correct behavior is

Before calling anything a bug, know what should have happened.

- If the intended behavior is ambiguous, check `docs/achieve-planner/` — this app
  reimplements Achieve Planner, and "wrong" often means "differs from AP." Prefer
  `workflow-and-training.md` and the user manual over inferring intent from the UI.
- Check whether the behavior is **deliberate**. Some things that look like bugs are
  settled decisions: search the active and frozen specs under `agent-os/specs/` for the
  feature, and read any "Changes from original plan" section. If a spec says the behavior
  is intentional, say so and stop — do not silently reverse a decision.
- If the report is genuinely a feature request or a design disagreement, name it as such
  and stop. `/shape-spec` handles those.

### Step 2 — Reproduce, or reason the failure path all the way through

Do not skip to the fix on a hypothesis.

- Prefer an actual reproduction: a failing test, a `node`/`tsx` script in the scratchpad,
  or driving the app (`/run` or the `run-planner` skill) and reading the console.
- If you cannot reproduce it, trace the path explicitly — from the entry point (route,
  action, event handler) to the failure — and state which step you verified by reading
  code versus which you assumed. An unverified assumption in the chain is a place the
  fix can be wrong.
- Note the actual inputs and state that trigger it. "Sometimes" usually means an ordering,
  a null, a timezone, or an empty collection.

### Step 3 — Identify the true root cause

The line that throws is where the damage surfaced, not where it started. Keep asking "and
why was it in that state?" until the answer is a decision someone made, not a value.

Causes that recur in this codebase — check these before inventing a new theory:

- **Logic living where it can't be tested** — in a component, or in `actions.ts` past the
  thin wrapper. `actions.ts` resolves the user, delegates, revalidates; a branch there
  belongs in `src/lib`. See `agent-os/standards/development/clean-code.md`.
- **A mutation that dropped `userId`** or scoped on the wrong column. Every mutation takes
  `userId` first and scopes by it, no exceptions.
- **A second implementation of something already shared** — DataGrid, ModalShell, the
  drawer, `run()` — which has since drifted from the original.
- **A calendar day put through instant-based helpers** (`startOfDay` and friends). See
  `agent-os/standards/development/dates.md`; this class of bug shifts dates by a day.
- **A type that permits the impossible state that occurred** — the value was optional,
  or a union was too wide, so nothing stopped it.
- **An invariant assumed rather than enforced** — ordering, prior initialization,
  non-empty, already-validated.
- **A layer crossed the wrong way**, so a change in one place reached somewhere it
  shouldn't have.

State the root cause in one or two sentences before you edit anything.

### Step 4 — Look for the same pattern elsewhere

One instance of a mistake in agent-written code is rarely the only one; the same shape was
usually generated more than once.

- Grep for the same call shape, the same missing argument, the same unguarded access.
- Read the sibling modules in the same `src/lib/<domain>/`, and the other `actions.ts`
  files, which tend to be copies of each other.
- If the cause was a missing check, search for every call site that needed it.

Report what you found — including "checked X and Y, this is the only occurrence." A
negative result that was actually searched for is worth stating.

### Step 5 — Choose the scope, deliberately

| Situation | What to do |
| --- | --- |
| One site, cause is local | Minimal fix. Just do it. |
| Same cause live in 2+ places, or the fix would create a second implementation of an existing concern | Focused refactor — extract a helper, tighten a type, move logic down a layer, add the validation once. Just do it, but confine the diff to that one cause: no drive-by renames, no reformatting, no unrelated cleanups riding along. |
| Larger — a new module boundary, a changed shared contract, migrating call sites app-wide | Stop. State the trade-off in a few sentences, offer the minimal fix as the alternative, and ask before proceeding. Under `/overnight`: take the minimal fix, record the larger one as a follow-up. |

Prefer the change that makes the bug **unrepresentable** over the one that makes it
handled — a narrower type or a single validated entry point beats a new check at the
call site, when it's available at similar cost.

### Step 6 — Make the change, without papering over

None of the following is a fix. If one of them is the tempting move, the root cause has
not been found yet:

- a `try`/`catch` that swallows, or logs and continues
- `?? fallback` or `|| default` at the call site to cover a value that should never have
  been missing
- `as`, `as any`, or `!` to quiet a type error that was telling the truth
- widening a type, or loosening a schema, so the bad input is accepted
- `if (!x) return` that hides why `x` was missing
- a `useEffect` that re-syncs state after something else corrupted it
- a retry, a timeout, or `setTimeout(…, 0)` wrapped around a race instead of fixing the
  ordering
- an inline lint-rule disable

If one of these genuinely is the right call — the value legitimately can be absent, the
external API really is unreliable — say why in a comment and in the report, so it reads as
a decision instead of a shrug.

### Step 7 — Add the regression test

Full rules: `agent-os/standards/development/testing.md`. The parts that matter here:

- The test goes beside the logic in `src/lib/**` as `foo.test.ts`. If the bug lived in a
  component and the logic can't be tested there, that is itself the root cause — move the
  logic to `src/lib` and test it there.
- **Do not write React component tests.** There is no setup for them.
- If the fix touched the database, it needs a `*.integration.test.ts`, and it is not done
  until a second user has tried to read, change, and delete the first user's row and
  failed at every step.
- The test must **fail on the plausible mistake** — revert the fix mentally (or actually)
  and confirm it goes red. A test that only restates the implementation catches nothing.
- If the bug class can't be covered by a test (a rendering-only failure, a build-time
  problem), say so explicitly and name what does catch it instead.

### Step 8 — Verify

- `npm run lint` and `npm run typecheck`.
- `npm run test:unit`. If the fix touched `mutations.ts` or `queries.ts`, **check for the
  Postgres skip warning** — database tests skip silently when Postgres is down, and a
  green run means nothing then. Bring it up (`npm run db:up`) and run
  `npm run test:integration`.
- **If the fix touched anything under `src/app/**`, run `npm run smoke` against a running
  dev server.** A green gate is not proof the app renders: nothing else here evaluates a
  `"use server"` module, and that gap once shipped a `ReferenceError` on every page with
  lint, typecheck, 2000 tests and the build all passing.
- If the bug was reproduced in the browser, confirm the fix there too.

Report actual results. "Tests pass" without having run them is worse than not claiming it.

## Report

Close with this, however short:

```
Root cause:   <the cause — a decision, not the line that threw>
Also at:      <other sites found, or "only occurrence — checked X, Y">
Fix:          <what changed, and why that removes the cause>
Left alone:   <what looked related but wasn't, and why>
Test:         <file, and the plausible mistake it fails on>
Verified:     <lint / typecheck / test:unit / integration / smoke — with real results>
```

## Record it

- If an **active** spec covers this area and the bug revealed a requirement, constraint,
  or invariant a future reader would need, add a row to its **Changes from original plan**
  in `plan.md`. Do not edit frozen specs.
- If the investigation surfaced a rule that applies beyond this bug, that is a candidate
  for `agent-os/standards/` — mention it; `/discover-standards` can promote it.
- Commit per `agent-os/standards/development/commits.md`: an imperative subject naming the
  effect, and a body that says what the root cause was and what you deliberately left
  alone. Nobody reviews these before they land, so the message is the record.
