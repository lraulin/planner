# Overnight

Unattended, self-directed work. Lee is asleep. **Nobody is coming to answer a question,
approve a plan, or unblock you.** Do as much genuinely useful work as you can, verify it,
commit it, and leave a report that can be read over coffee.

Optional argument: `$ARGUMENTS` — if given, treat it as the area to focus on (e.g.
`/overnight grids`, `/overnight test coverage`). If empty, choose your own work using the
selection rules below.

---

## The autonomy contract

These are the rules that make this command different from ordinary work. Read them twice.

1. **Never ask a question.** Do not call `AskUserQuestion`, `ask_user_question`,
   `vscode_askQuestions`, or `request_user_input`. Do not end a turn with "should I…?",
   "let me know if…", or a list of options. If you find yourself wanting to ask, the item
   is **out of scope** — log it under _Needs a decision_ and move to the next item.
2. **Never block.** If something can't proceed (missing credential, flaky external
   service, ambiguous intent), abandon that item, record why, and pick another. There is
   always more work in the backlog than there is night.
3. **Never wait.** Don't sleep or poll for a human. Background tasks are fine; while one
   runs, do something else.
4. **Keep going until the session limit stops you.** Don't wind down early because "that
   feels like a good amount." When one item is green and committed, immediately start the
   next. The end condition is the limit, not your sense of a tidy stopping point.
5. **Leave the tree green and pushed.** Every commit you make must pass the full gate
   below. Never leave uncommitted work-in-progress at the end of a cycle — either finish
   it or `git restore` it and log the attempt.

---

## What counts as good overnight work

Ordered roughly by value. Prefer items higher in the list, but take anything that is
_unambiguous_ over anything that needs Lee's taste.

### 1. Real bugs

Highest value, lowest ambiguity — a bug is wrong against intent that already exists.

- Read the recent specs under `agent-os/specs/` (newest folders) and check the as-built
  behavior actually matches. Deltas between a spec's acceptance criteria and the code are
  bugs, not design questions.
- Hunt for the classes this codebase is prone to:
  - **Missing `userId` scoping** in `src/lib/**/mutations.ts` / `queries.ts` — a dropped
    `userId` is invisible with one user and is a data-leak with two. Every mutation takes
    a `userId` and must scope by it.
  - **Derived-state drift** — rollups, inherited values (L.A.P., `effectiveCategory`),
    schedule status, completion cascades. Check the walk in `derive.ts` handles the edge
    cases (orphans, cycles, deleted parents, same-rank children).
  - **Date / recurrence arithmetic** — off-by-one on week boundaries, DST, month-end
    rollover, "day D of the month" when D > days in month, timezone drift between server
    and browser.
  - **Rules the product promises out loud** — e.g. a routine or a day assignment must
    never be able to read as **Overdue**; `postponed` (shelf) vs `proposed` (uncommitted)
    must not be conflated. If code can violate one of these, that's a bug.
  - **Filter / view state** interactions — a hidden column that still filters, a persisted
    setting that survives a schema it no longer matches, a reset that misses a key.
- When you find one: write a failing test first if the logic lives (or belongs) in
  `src/lib/**`, then fix it.

### 2. Inconsistencies

Same idea implemented two ways, or one way in one tab and differently in another.

- Grid tabs that don't share the control surface the way `standards/components/data-grid.md`
  says they should.
- Duplicated logic that should be one function in `src/lib/**`.
- Naming, prop shapes, and file layout that diverge from `agent-os/standards/`.
- Dead code: unused exports, orphaned components, settings keys nothing reads, obsolete
  feature flags. Delete them — but verify with a search that nothing references them,
  including via string keys.

### 3. Test coverage where a wrong answer looks plausible

Follow `agent-os/standards/development/testing.md`. Specifically:

- Pure logic in `src/lib/**` with no `foo.test.ts` beside it — especially date math,
  scoring (Task Chooser), recurrence, derivation, and filter/sort composition.
- Anything touching the database needs `*.integration.test.ts` including the **second-user
  check**: another user must fail to read, change, and delete the first user's row.
- **Do not write React component tests.**
- A test earns its place only if it would fail on a plausible mistake. No snapshots, no
  mocking Drizzle, no tests that restate the implementation.

### 4. Roadmap items that need no design input

Read `agent-os/product/roadmap.md`. Take items that are **mechanically obvious** — the
"what" is already decided and only the "how" is left. Good candidates historically:
residual grid chrome, day-to-day friction items (expand/collapse-all, find-in-outline),
deferred follow-ups explicitly listed at the end of a frozen spec.

**Do not** take anything where the roadmap itself is still asking questions — the GTD
section is written as open questions; Pomodoro/time-tracking and attachments are staged
but need Lee's call on the stage. Those are morning work.

If an item is big enough to deserve a spec, it is too big for tonight. Rule of thumb: if
you can't describe the finished behavior in two sentences without using the word "maybe",
skip it.

### 5. Hygiene

Lowest priority — do these when the higher tiers are dry, or as filler while a build runs.

- Fix lint/type warnings that the gate tolerates but shouldn't.
- Tighten types where `any` / `as` is hiding something real.
- Correct stale documentation: a frozen spec that describes something that was later
  changed, a `README` pointing at a moved file, `roadmap.md` marking something as pending
  that has shipped.
- Rebuild `agent-os/standards/index.yml` if standards files changed (`/index-standards`).

---

## Hard limits — do not cross these unattended

- **No design or product decisions.** If two reasonable people would build it differently,
  it's Lee's call. Log it.
- **No destructive data operations.** No `db:push` against anything but local Docker, no
  dropping tables, no `DELETE` without a `WHERE`, no rewriting existing migrations. New
  additive migrations via `db:generate` are fine; a migration that drops or narrows a
  column is not.
- **No dependency upgrades** beyond a patch-level security fix, and no adding a new
  dependency. Both are morning conversations.
- **No `git push --force`, no rebasing published commits, no touching branches other than
  `master`.** Never `git reset --hard` over work you didn't just write.
- **No secrets, no external accounts.** Don't touch `.env*` values, Vercel env, Google
  OAuth config, or anything that would deploy to production.
- **No reopening a frozen spec.** Frozen folders are historical records. If tonight's work
  materially changes a frozen area, write a new dated delta section per
  `agent-os/specs/README.md` rather than editing the frozen intent.
- **No refactor that touches more than it needs to.** A 40-file diff at 3am nobody
  reviewed is a liability, not progress.

---

## The gate — run before every commit

Nothing gets committed until all of this is green:

```sh
npm run typecheck
npm run lint
npm run test:unit
```

And for anything touching `mutations.ts`, `queries.ts`, or the schema:

```sh
npm run db:up          # Postgres must be up or the DB tests silently skip
npm run test:integration
```

**Check for the skip warning.** `npm run test:unit` passing does *not* mean the database
tests ran. If Docker isn't available tonight, say so in the report and do not claim
DB-touching work is verified.

Run `npm run build` before your first commit of the night and again after any change to
routing, server components, or config — it catches things the other three don't.

Where a change is visible in the UI, verify it in the actual app with the **`run-planner`**
skill (CDP driver, port 3047) and note the screenshot path in the report. A UI change you
only typechecked is not verified.

---

## Working rhythm

Work in **cycles**. One cycle = one coherent change.

1. **Pick** the next item (selection rules above). Write one line in the log saying what
   and why, before you start.
2. **Reproduce / justify** — a failing test, a concrete trace, or a citation from a spec.
   If you can't demonstrate the problem exists, it may not; drop it and pick another.
3. **Fix** it, minimally. Real logic goes in `src/lib/**`, not in components.
4. **Gate** it (above).
5. **Commit** — small, single-purpose, imperative subject in the voice of the existing log
   (`git log --oneline -20` — this repo writes commit subjects as sentences about intent,
   not as changelog entries). No mention of Claude or Anthropic, no `Co-Authored-By`.
6. **Push** to `origin/master`. Committing and pushing is pre-authorized here.
7. **Log** the outcome, then immediately start the next cycle.

If a cycle goes sideways — the fix keeps growing, tests won't go green, the cause turns
out to be a design question — **stop that cycle**, `git restore` / `git stash drop` the
mess so the tree is clean, log what you learned and why you backed out, and pick something
else. Two abandoned cycles in a row on the same subsystem means leave that subsystem alone
for the night.

Prefer **many small green commits** over one large one. If the limit cuts you off
mid-cycle, everything already committed is still good.

Keep the active spec current where it applies: if tonight's work materially changes
requirements, decisions, or scope of an **active** (non-frozen) spec, update its
`plan.md` / `shape.md` and append a row to **Changes from original plan**.

---

## The morning report

Maintain a single file for the run at **`agent-os/overnight/{YYYY-MM-DD}.md`** (create the
folder if needed; if the file exists, append a new `## Run {HH:MM}` section). Update it as
you go — not at the end, which you may never reach — and commit it along the way.

Structure:

```markdown
# Overnight run — {YYYY-MM-DD}

Started {HH:MM}. Focus: {argument, or "self-directed"}.

## Shipped

- `{short sha}` — {what changed, and the symptom it fixes} — verified by {test name /
  screenshot path}

## Tried and backed out

- {what, why it didn't work, what I learned so the next attempt is cheaper}

## Needs a decision

- {the question, the options as I see them, and my recommendation}
  — blocking: {what work this unblocks}

## Noticed but didn't touch

- {file:line} — {observation}

## Gate status at end of run

typecheck / lint / unit / integration / build — pass or fail, and whether the DB tests
actually ran (or skipped with Postgres down).
```

Be honest and specific. "Fixed some bugs" is worthless; `src/lib/derive.ts:184 — inherited
priority skipped nodes whose parent was deleted, so orphans scored as D` is worth reading.
If tests fail, say so with the output. If you skipped something in scope, say that too.

**Needs a decision** is the most valuable section — it is the queue Lee works from in the
morning. Every time you decline an item for ambiguity, it goes there with your
recommendation, not just the question.

---

## Notes

- Harness-agnostic: works in Claude Code and Grok via the flat symlink at
  `.claude/commands/overnight.md`, in Copilot through its prompt, and in Codex as
  `$overnight`.
- If you want this to keep re-entering on its own after a natural stopping point, it can be
  driven with `/loop /overnight` — but the command is written to run continuously on its
  own and should not need it.
