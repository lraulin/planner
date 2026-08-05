# planner

Personal project in Lee's personal GitHub (`lraulin/planner`).

## Agent instructions

### Git

- **Committing and pushing is pre-authorized.** Make commits and push to `origin/master`
  whenever it makes sense — no need to ask first. This overrides the global "don't commit
  automatically" rule.
- Do not mention Claude or Anthropic in commit messages: no `Co-Authored-By` trailer, no
  "Generated with Claude Code" line, no references in the body.
- The default branch is `master`.

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

### Agent OS & spec-driven development

This repo uses [Agent OS](https://buildermethods.com/agent-os): product docs under
`agent-os/product/`, coding standards under `agent-os/standards/`, and feature specs under
`agent-os/specs/`. Significant work is shaped with `/shape-spec` (plan mode), then
implemented against the saved spec folder.

**Clear, durable intent is the scarce asset; code is regenerable.** Specs capture what we
meant to build and why — not every line of implementation detail.

#### Slash commands (Claude Code + Grok + Copilot)

Canonical command docs live in `.claude/commands/agent-os/`.

- Claude Code + Grok discover them from `.claude/commands/` (with flat symlinks for short names).
- Copilot discovers equivalent slash commands from `.github/prompts/*.prompt.md`, each of
  which references the same canonical docs above.

| Command               | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `/shape-spec`         | Plan-mode shaping → `agent-os/specs/...` folder                |
| `/inject-standards`   | Pull relevant `agent-os/standards/` into context               |
| `/discover-standards` | Extract patterns into new standards                            |
| `/index-standards`    | Rebuild `agent-os/standards/index.yml`                         |
| `/plan-product`       | Mission / roadmap / tech-stack in `agent-os/product/`          |
| `/overnight`          | Unattended self-directed work; report in `agent-os/overnight/` |

When asking the user structured questions from these flows, use `AskUserQuestion` (Claude),
`ask_user_question` (Grok), or `vscode_askQuestions` (Copilot). **Exception:
`/overnight` forbids questions entirely** — nobody is awake to answer.

#### Spec lifecycle

1. **Shape (plan mode)** — `/shape-spec` creates `agent-os/specs/{YYYY-MM-DD-HHMM-slug}/`
   with `plan.md`, `shape.md`, `standards.md`, `references.md`, and optional `visuals/`.
   New specs start as **active** working documents.
2. **Implement** — Execute the plan. Keep the active feature’s spec current with _material_
   refinements that emerge from implementation or user feedback (see below).
3. **Freeze** — When the feature is done and verified, mark the spec **frozen / complete**.
   It becomes a historical decision record of what was actually built. Future work in the
   same area should open a **new delta-spec** (or a dated change section), not treat the
   frozen folder as a living control plane.

Details and templates: `agent-os/specs/README.md`. Exemplar frozen spec:
`agent-os/specs/2026-07-28-1234-weekly-schedule/`.

#### Keep the active spec current (selective)

While implementing against an **active** (not frozen) feature spec, whenever we make a
**material** change to requirements, design decisions, or scope — including from developer
feedback on what was actually built — update the relevant sections of that feature’s
`plan.md` / `shape.md` so they reflect the **final agreed intent**.

Also append a short row to **Changes from original plan** in `plan.md` (what changed and
why). Prefer that changelog for incremental refinements; rewrite main sections when the
canonical “what/why” would otherwise mislead a future reader.

**Do update for:**

- Clarified or newly discovered requirements / acceptance criteria
- Important architectural or design decisions made during implementation
- Scope adjustments (what was cut or added, and why)
- Non-obvious constraints or invariants future agents should know

**Do not update for:**

- Minor implementation details that don’t affect the “what” or the “why”
- Temporary debugging notes
- Pure code-level refactorings that don’t change behavior or contracts

When freezing: set **Status: frozen / complete** (with date) on the main files, align
scope/decisions/acceptance criteria with as-built reality, list follow-ups as _new work_
(not open edits to the frozen spec), and update `agent-os/product/roadmap.md` if needed.

## Notes

`CLAUDE.md` is a symlink to this file, so Claude Code and other agents read the same
instructions.
