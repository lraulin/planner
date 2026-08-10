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
  `queries.ts`.
- **A green gate is not proof the app runs.** Nothing above evaluates a `"use server"`
  module: the tests never import one, and `next build` compiles the routes without
  rendering them because every page is `force-dynamic`. That gap once shipped a
  `ReferenceError` on every page with lint, typecheck, 2000 tests and the build all
  passing. After touching anything under `src/app/**`, start the dev server and run
  **`npm run smoke`** — it loads all 23 routes and fails on any that will not render. It is
  not in a git hook because it needs a server running; it is a step you take, not one that
  takes itself.

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

#### Agent OS workflows (Claude Code, Grok, Copilot, and Codex)

**Every workflow lives, in full, in `.agents/skills/<name>/SKILL.md`.** That is the one
file to read and the one file to edit. No harness owns the canonical copy; the three
locations below are pointers into it, so a change made in one place is a change everywhere.

- **Codex** reads `.agents/skills/` natively — invoke as `$shape-spec`, `$fix-bug`,
  `$inject-standards`, `$discover-standards`, `$index-standards`, `$plan-product`, or
  `$overnight`. Its user-local aliases, when installed, are `/prompts:<workflow>`.
- **Claude Code** reads the same folder through the directory symlink `.claude/skills`
  → `../.agents/skills`, which is what makes these auto-apply when relevant. The flat
  one-line shims in `.claude/commands/*.md` provide the explicit `/<name>` slash commands,
  and are what **Grok** discovers (it does not descend into subdirectories).
- **Copilot** reads `.github/prompts/*.prompt.md`, each a thin pointer to the same
  `SKILL.md`.

**These are meant to fire on their own.** A feature request should pull in `/shape-spec`,
a bug report `/fix-bug`, and coding work the relevant standards, without being asked. The
sole exception is **`/overnight`**, which runs only when explicitly invoked by name —
`allow_implicit_invocation: false` in its `agents/openai.yaml`, and its skill description
forbids inferring it.

Adding a workflow means: write `.agents/skills/<name>/SKILL.md` (with `name` and a
trigger-shaped `description` in frontmatter), then add the two pointers —
`.claude/commands/<name>.md` and `.github/prompts/<name>.prompt.md` — plus
`agents/openai.yaml` if Codex needs display metadata.

**Always edit at the real `.agents/skills/...` path, never through `.claude/skills/...`.**
Git refuses to process a path "beyond a symbolic link", so staging a file by its
`.claude/skills/` path fails — and it fails inside lint-staged's backup step, which
reports it as an unexplained "git error" during `git commit` rather than as a bad path.

When asking the user structured questions from these flows, use the native facility:
`AskUserQuestion` (Claude), `ask_user_question` (Grok), `vscode_askQuestions` (Copilot),
or `request_user_input` in Codex plan mode. If Codex has no structured-question facility
in the active mode, ask one concise direct question instead. **Exception: `/overnight`
forbids questions entirely** — nobody is awake to answer.

#### Spec lifecycle

`/shape-spec` (plan mode) → active `agent-os/specs/{YYYY-MM-DD-HHMM-slug}/` → implement →
freeze when verified. **Standing rule:** while a spec is active, keep `plan.md` / `shape.md`
current with _material_ changes to requirements, design decisions, or scope — including
developer feedback on what was actually built — and append a row to **Changes from original
plan**. Skip pure implementation details. Once frozen it is a historical as-built record;
further change opens a **new delta-spec**, not an edit to the frozen folder.

Full lifecycle, freeze procedure, and templates: `agent-os/specs/README.md`. Exemplar frozen
spec: `agent-os/specs/2026-07-28-1234-weekly-schedule/`.
