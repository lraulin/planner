# Feature specs

Durable planning and decision records for significant work. Shaped with `/shape-spec` in
plan mode; implemented with the active folder as the source of agreed intent.

> **Standing rule (also in `AGENTS.md`):** While a feature is active, keep its spec current
> with _material_ refinements from implementation and feedback. Once verified, freeze it.
> Do not maintain frozen specs as a continuous control plane.

## Layout

```
agent-os/specs/{YYYY-MM-DD-HHMM-feature-slug}/
├── plan.md           # Plan, decisions, acceptance, changes log, status
├── shape.md          # Shaping notes (scope, decisions, context)
├── standards.md      # Standards that applied (often full text + why)
├── references.md     # Pointers to similar code
└── visuals/          # Mockups / screenshots (optional; often gitignored)
```

## Lifecycle

```
shape ──► active (working document) ──► implement + selective updates ──► freeze
```

| Phase                      | Status line                                  | Spec role                                     |
| -------------------------- | -------------------------------------------- | --------------------------------------------- |
| Just created / in progress | `**Status: active**`                         | Working document for the implementation cycle |
| Done and verified          | `**Status: frozen / complete** (YYYY-MM-DD)` | Historical as-built decision record           |

### Active phase — selective updates

When feedback or implementation friction changes the _agreed intent_, update the active
spec in the same cycle as the code.

**Good candidates**

- Clarified or newly discovered requirements / acceptance criteria
- Important architectural or design decisions
- Scope in/out adjustments (and why)
- Non-obvious constraints or invariants

**Usually skip**

- Minor implementation details that don’t change what/why
- Temporary debugging notes
- Pure refactorings with no behavior or contract change

**How to record changes**

1. Update the authoritative sections in `plan.md` (and `shape.md` when scope/decisions
   drifted) so a cold reader gets the _current_ agreed intent.
2. Append a row under **Changes from original plan** — short “what / why” table. That
   preserves the planning-time guess vs as-built path without rewriting history line by
   line.

### Freeze phase

When the feature is verified and roadmap (if any) is updated:

1. Set **Status: frozen / complete** (date) on `plan.md`, `shape.md`, and optionally
   `standards.md` / `references.md`.
2. Make `plan.md` the as-built record: final decisions, data model/code map if useful,
   checked-off acceptance criteria, closed task status.
3. Keep **Changes from original plan** complete for material refinements.
4. List remaining ideas under **Follow-ups (new work — not amendments to this frozen
   spec)**.
5. Point future agents: reference this folder, or open a **new delta-spec** for further
   change — do not re-open the frozen document as a living control plane.

Exemplar: [`2026-07-28-1234-weekly-schedule/`](./2026-07-28-1234-weekly-schedule/).

## Why this pattern

- Planning-time specs are almost always slightly wrong once real friction appears.
- Final code alone rarely preserves _why_ choices were made.
- Continuous living-spec maintenance for every past feature is too expensive; freezing
  after the active cycle keeps cost low while retaining the valuable thinking from
  implementation.

This is **spec-anchored during active work**, then **spec-first (frozen)** after
completion — not “markdown as Terraform.”

## Related

- Product context: `../product/` (`mission.md`, `roadmap.md`, `tech-stack.md`)
- Coding standards: `../standards/` + `index.yml`
- Commands: `/shape-spec`, `/inject-standards`, `/plan-product`, `/discover-standards`
