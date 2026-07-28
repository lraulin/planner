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

### Agent OS & spec-driven development

This repo uses [Agent OS](https://buildermethods.com/agent-os): product docs under
`agent-os/product/`, coding standards under `agent-os/standards/`, and feature specs under
`agent-os/specs/`. Significant work is shaped with `/shape-spec` (plan mode), then
implemented against the saved spec folder.

**Clear, durable intent is the scarce asset; code is regenerable.** Specs capture what we
meant to build and why — not every line of implementation detail.

#### Spec lifecycle

1. **Shape (plan mode)** — `/shape-spec` creates `agent-os/specs/{YYYY-MM-DD-HHMM-slug}/`
   with `plan.md`, `shape.md`, `standards.md`, `references.md`, and optional `visuals/`.
   New specs start as **active** working documents.
2. **Implement** — Execute the plan. Keep the active feature’s spec current with *material*
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
scope/decisions/acceptance criteria with as-built reality, list follow-ups as *new work*
(not open edits to the frozen spec), and update `agent-os/product/roadmap.md` if needed.

## Notes

`CLAUDE.md` is a symlink to this file, so Claude Code and other agents read the same
instructions.
