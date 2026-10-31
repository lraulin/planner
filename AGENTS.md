# planner

Personal project in Lee's personal GitHub (`lraulin/planner`).

## Agent instructions

### Git

- **Committing and pushing is pre-authorized.** Make commits and push to `origin/master`
  whenever it makes sense — no need to ask first.
- The default branch is `master`.
- **How to write the commit itself:** `agent-os/standards/development/commits.md`. One
  logical change per commit; an imperative subject naming the effect, under 72 characters
  and _not_ Conventional Commits; a body explaining why whenever the diff is not
  self-evident. Since nobody reviews these before they land, the message is the record.
- **Other agents may be working in this checkout, on the same git index.** Stage explicit
  paths and commit with a pathspec (`git add <paths>`, then `git commit -m … -- <paths>`),
  never `git add -A`, and check `git show --stat HEAD` afterwards. Wait out an existing
  `.git/index.lock` rather than deleting it.
- **A worktree has no `.env.local`** (it is untracked), so the hooks fail with
  `DATABASE_URL is not set`. Export `DATABASE_URL` from `.env.example` for that one command;
  do not copy `.env.local` in.

### Achieve Planner reference (how AP was meant to work)

This app reimplements **Effexis Achieve Planner** for personal use. When behavior is
ambiguous, or before deliberately diverging from Achieve:

1. Check **`docs/achieve-planner/`** — the reference pack (workflow/training, user manual,
   online help, FAQ, file formats). Start with
   [`docs/achieve-planner/README.md`](docs/achieve-planner/README.md).
2. Prefer **workflow intent** (`workflow-and-training.md`) and the **user manual** over
   inventing semantics from UI chrome alone.
3. If we intentionally differ from Achieve, say so in the active feature spec (and keep
   that note when freezing).

Do not re-scrape the Effexis website unless the user asks; `docs/achieve-planner/` is the
local source of truth.

### Budget references: Actual Budget and YNAB

The Finances module's envelope budget started from
[Actual Budget](https://github.com/actualbudget/actual) (MIT), and Actual still defines the
envelope arithmetic. But **where Actual and YNAB disagree, YNAB is the default answer** — the
target engine and the Assign gesture are already YNAB-shaped. The one standing exception is
**credit cards, where Actual's model is kept on purpose**: a card balance is negative money in
the one pool, with no payment categories, permanently. Never propose configuration whose only
purpose is to make a behavior adjustable; pick the right behavior.

The formulas are load-bearing and easy to get subtly wrong, so before changing any budget number:

1. Read [`docs/actual-budget/README.md`](docs/actual-budget/README.md) — it maps each concern to
   the file in `../actual` that defines it, and lists where we diverge.
2. Prefer **the reference's semantics** over a plausible-looking reinvention. Where we diverge,
   the spec that diverged says so.

Clone the reference beside this repo (`git clone https://github.com/actualbudget/actual ../actual`);
it is not vendored.

### Code shape

Full rules: `agent-os/standards/development/typescript-react.md`. ESLint enforces most of it
(flat control flow, no `!` in app code, exhaustive switches, `type` not `interface`, no
classes but `Error`s, a 600-line file cap). The part lint cannot see: **never satisfy those
rules with a `?? fallback` or an `as` cast** — handle the missing case or throw naming the
invariant. The over-cap files listed in `eslint.config.mjs` may only shrink. The React
Compiler is on, so new code adds no `useMemo`/`useCallback` for performance.

### Duplicate code: Deslop

Every harness gets the `deslop` MCP server (live duplicate-code analysis), started by
`scripts/deslop-mcp.sh` from the Deslop VS Code extension's bundled binary: `.mcp.json`
(Claude Code), `.codex/config.toml` (Codex), `.cursor/mcp.json` (Cursor, and Grok through
it); Copilot gets it from the extension. Agent reference: <https://deslop.live/docs/for-ai/>.

- **Call `find-similar` before authoring** any function, helper, component, query, fixture,
  test setup, or other unit longer than a few lines — with the draft as `snippet` +
  `language` (`typescript` or `tsx`), or as `path` + `start_byte`/`end_byte`. Before the
  keystroke that creates the copy; checking it afterwards is cure, not prevention.
  - A cluster of kind `identical` or `nearly_identical`: do not write the copy. Reuse the
    canonical occurrence, extracting a helper if needed.
  - No `clusters` but a hit in `existing`: the code already lives there once. Call it or
    extract it.
  - `loosely_similar` or `same_behavior`: read the canonical occurrence and decide; bias
    toward reuse. `structural_only` means the shape alone matched — usually sibling
    boilerplate, but read it.
  - Both empty: write it.
- **Removing existing duplication** starts from `duplicates` (`{"detail":"summary","limit":5}`,
  or with `path` for one file), then `cluster-by-id`, `compare-pair`, `merge-plan`. Query
  `duplicates` again afterwards to confirm the cluster is gone.
- **Never silence a finding** by widening thresholds, hiding a cluster, or reshaping code
  into a trivially different form. "This looks new" is the intuition the tool overrules.
  The one sanctioned suppression is a `report_hide` entry in `.deslop.toml`, with its reason,
  for a file whose _every_ repetition is deliberate — Deslop cannot accept a single finding,
  so a reviewed-but-kept duplicate in ordinary code stays visible. Add one only with Lee's
  agreement, and re-scan to check it took: Deslop ignores keys it does not know.
- **If the server is unavailable**, read `.deslop/cache/live-report.json` (it may lag recent
  edits), or run the extension's bundled CLI from the repo root —
  `~/.vscode/extensions/nimblesite.deslop-live-*/bin/*/deslop . --notext --nohtml --no-color`
  — and read `.deslop/deslop-report.json`. A failed call or a stale report never proves
  there is no duplicate.

### Tests

Full rules: `agent-os/standards/development/testing.md`. The short version, because tests
are the one gate that cannot be automated into a hook:

- **Put real logic in `src/lib/**`, not in components**, and write a `foo.test.ts` beside
  it. Pure logic is where the tricky reasoning lives and where a wrong answer looks
  plausible.
- **Anything touching the database gets a `*.integration.test.ts`, and it is not done
  until a second user has tried to read, change, and delete the first user's row and
  failed at every step.** Every mutation takes a `userId` and must scope by it; a dropped
  `userId` is invisible when you only ever test with one user.
- **Do not write React component tests.** There is no setup for them and the bug class
  they would catch is already covered by the type-aware ESLint rules.
- A test earns its place if it would **fail on a plausible mistake**. No snapshots, no
  mocking Drizzle, no tests that restate the implementation.
- `npm run test:unit` passing does **not** mean the database tests ran — they skip when
  Postgres is down. Check for the skip warning after changing `mutations.ts` or
  `queries.ts`. `.husky/pre-push` and CI do not let it slide.
- **Unit tests run non-isolated**: files sharing a worker share module registries, so a
  unit test must not mutate module-level state.
- **A green gate is not proof the app runs.** Nothing above evaluates a `"use server"`
  module: the tests never import one, and `next build` compiles the routes without
  rendering them because every page is `force-dynamic`. That gap once shipped a
  `ReferenceError` on every page with lint, typecheck, 2000 tests and the build all
  passing. After touching anything under `src/app/**`, start the dev server and run
  **`npm run smoke`** — it loads every route and fails on any that will not render. It is
  not in a git hook because it needs a server running; it is a step you take, not one that
  takes itself.

### Choosing the design

Full rule: **"When the model is wrong, change the model"** in
`agent-os/standards/development/clean-code.md`.

**Prefer the design that is right for the app long-term over the one that is cheap given
what exists today.** When work reveals the current model is wrong — not merely inconvenient
— fix the model, even when that means a migration across several tables and every reader.
"That would touch a lot of files" is a cost to plan around, not a reason to pick the lesser
design. A justification that appeals only to the present shape of the code (_the string is
already the join key everywhere_) says the design is entrenched, not that it is right.

This does **not** licence speculative generality, which stays forbidden: that builds for a
caller who does not exist. A model correction fixes what is _already_ wrong and _already_
being worked around. The signal is two workarounds for the same missing concept — a rule
enforced in application code because the schema cannot express it, a fact recomputed at read
time because nothing stores it, a value copied into three tables because there is no row to
point at.

Such a refactor gets a spec, and the spec records what it supersedes and why.

### Fixing bugs

Full protocol: `/fix-bug` (`.agents/skills/fix-bug/SKILL.md`). It applies to anything
non-trivial whether or not it was invoked by name. The part that always applies:

- **Fix the cause, not the symptom.** The line that threw is where the damage surfaced.
  Never reach for a swallowed `catch`, an `as any`, a `!`, or a `?? fallback` covering a
  value that should not have been missing — those are the tempting moves precisely when
  the cause hasn't been found.
- **Check whether the same pattern repeats** before fixing one site. This code is mostly
  agent-written, so a mistake generated once was usually generated more than once. If it
  repeats, a tight single-cause refactor beats N copies of the same patch.
- **Say what the root cause was** in the report and in the commit body.

### Production database

Production is Neon. Reach it only through `scripts/prod.ts` (full detail:
[`docs/production-access.md`](docs/production-access.md)), and run each command on its own,
not inside a compound shell command, so the `.claude/settings.json` rules match it:

- **Read** — `npx tsx scripts/prod.ts read "<sql>"`: read-only role, read-only transaction.
  Use it to check real data before diagnosing or proposing a fix against it.
- **Rehearse** — `npx tsx scripts/prod.ts branch scripts/<x>.ts …`: runs one repository
  script against a throwaway Neon branch of production, deleted afterwards. Every
  data-changing script (cutover, backfill, repair) gets its dry run here, and the receipt goes
  to Lee.
- **Apply** — `npx tsx scripts/prod.ts apply scripts/<x>.ts …`: takes a 30-day Neon snapshot,
  then runs the script as the owner. Only after Lee has read the branch receipt and said yes;
  Lee approves each run.

**Schema migrations do not go through this.** They ship with the deploy
(`scripts/migrate-on-deploy.mjs`) and are never applied by hand; destructive or
data-transforming ones have a recovery gate first (`agent-os/standards/database/migrations.md`).
Never print, paste, or export a production URL, and never point `DATABASE_URL` at Neon by
hand.

### Agent OS & spec-driven development

This repo uses [Agent OS](https://buildermethods.com/agent-os): product docs under
`agent-os/product/`, coding standards under `agent-os/standards/`, and feature specs under
`agent-os/specs/`. Significant work is shaped with `/shape-spec` (plan mode), then
implemented against the saved spec folder.

**Clear, durable intent is the scarce asset; code is regenerable.** Specs capture what we
meant to build and why — not every line of implementation detail.

**Retrieve context narrowly.** Before changing established behavior, find the smallest
governing spec set: search by feature or touched path, then follow only relevant
`Extends` / `Supersedes` relationships. Specs say what must be true; commits say how and
why the code arrived there. Read path-scoped history (`git log -- <paths>`, then
`git blame` when needed) only when implementation history could affect the change. A later
delta overrides only the decisions it explicitly supersedes. If specs, code, and history
disagree, surface the mismatch — never infer a new requirement from a commit or silently
rewrite a frozen spec.

**A spec references standards; it never copies them.** `standards.md` lists the standard
paths, one line each on why it applies, and any deliberate deviation — not their text.
Standards live at a stable path and in git history, so a copy is write-only: `/shape-spec`
already forbids preloading `standards.md`, and inlining `components/data-grid.md` alone
costs ~11k tokens to read and ~11k to write again. The frozen-record concern is real and is
answered by **pinning, not copying**: at freeze, record the standards commit SHA.
`git show <sha>:agent-os/standards/<path>` recovers exactly what applied.

#### Agent OS workflows

**Every workflow lives, in full, in `.agents/skills/<name>/SKILL.md`** — the one file to
read and the one file to edit. Each harness reaches it through a pointer;
[`.agents/skills/README.md`](.agents/skills/README.md) says how, and how to add a workflow.

**These are meant to fire on their own.** A feature request should pull in `/shape-spec`, a
bug report `/fix-bug`, and coding work the relevant standards, without being asked. The sole
exception is **`/overnight`**, which runs only when invoked by name and asks no questions.

**Always edit at the real `.agents/skills/...` path, never through `.claude/skills/...`.**
Git refuses a path beyond a symlink, and lint-staged reports that as an unexplained "git
error" during `git commit`.

Ask structured questions with the harness's own facility — `AskUserQuestion` (Claude),
`ask_user_question` (Grok), `request_user_input` (Codex plan mode), `vscode_askQuestions`
(Copilot). Without one, ask one concise direct question.

#### Spec lifecycle

`/shape-spec` (plan mode) → active `agent-os/specs/{YYYY-MM-DD-HHMM-slug}/` → implement →
freeze when verified. **Standing rule:** while a spec is active, keep `plan.md` / `shape.md`
current with _material_ changes to requirements, design decisions, or scope — including
developer feedback on what was actually built — and append a row to **Changes from original
plan**. Skip pure implementation details. Once frozen it is a historical as-built record;
further change opens a **new delta-spec**, not an edit to the frozen folder.

**Shaping ends when the spec folder is saved.** Whoever shapes the work writes the spec and
stops there — it does not roll straight into implementation, and does not offer to. Implementation
starts in a fresh session against the saved folder, so the shaping context (every spec read, the
product docs, the whole Q&A) does not ride along into it. This holds whether or not `/shape-spec`
was invoked by name.

Full lifecycle, freeze procedure, and templates: `agent-os/specs/README.md`. Exemplar frozen
spec: `agent-os/specs/2026-07-28-1234-weekly-schedule/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
