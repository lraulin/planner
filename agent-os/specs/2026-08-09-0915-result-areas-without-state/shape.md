# Result Areas without lifecycle state — Shaping Notes

**Status: frozen / complete** (2026-08-09)
Authoritative as-built detail: `plan.md`.

## Scope

Correct the shared schema, domain behavior, external contracts, Outline projections,
commands, and dedicated Result Areas module so Result Areas have no lifecycle state.

This supersedes only the conflicting Result Area behavior in the frozen completion cascade,
detail forms, grid parity, command deck, Result Areas module, and mobile swipe specs.

## Source intent

- Achieve's user manual says Complete Item(s) is available for projects and tasks but not
  Result Areas, which cannot be completed.
- The manual and online help define Result Areas as ongoing dimensions, roles, and parts of
  life. Their documented General fields omit State.
- Achieve's common Outline grid can show State/Status columns for heterogeneous rows, but
  Result Area values are blank and descendant schedule status does not roll up to them.

The shared AP record/grid behavior was an architectural artifact, not the intended domain
meaning. Planner follows the stated workflow semantics.

## Boundaries

- In scope: State, abbreviated State, completion state/time, postponement/defer date,
  completion cascades, derived Status, weekly review eligibility, state filters/groups,
  commands, swipe, imports, conversions, and agent contracts.
- Out of scope: Priority, Focus, Category, importance, and other non-lifecycle planning
  fields; Result Area deletion; descendant lifecycle behavior.
- No visual artifact is needed because this removes controls and renders existing shared
  cells blank without introducing a new layout.

## Implementation shape

The physical shared state column remains. A single domain predicate defines which node types
support state; a database check makes the corresponding stored invariant unrepresentable,
and every mutation validates before writing. Presentation layers consume nullable state and
capability refusal reasons rather than re-deriving the type rule.
