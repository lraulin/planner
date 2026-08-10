# Settings workspace and date format preference — Shaping Notes

**Status: frozen / complete** (2026-08-09)
Authoritative as-built detail: `plan.md`.

## Scope

Turn Settings from a sequence of unrelated panels into a navigable workspace and introduce
one per-user display preference for standalone calendar-day formatting. The implementation
reuses `user_settings`, the existing optimistic settings provider, `ConfirmDialog`, and the
existing Google and transfer panels.

## Source intent

- Achieve's compact default includes month, day, and a four-digit year.
- The preset language follows Microsoft's documented Excel-style date tokens, but Planner
  offers a closed catalogue rather than arbitrary format strings.
- Planner's date standard distinguishes calendar-day keys from instants. Formatting may
  change display text only; it cannot change that domain model.
- Planner is a dense desktop instrument with a complete adaptive phone layout. Settings
  therefore becomes an index-and-work-area on desktop and a single-column selector on phone.

## Boundaries

- English names only; system locale and custom format strings are out of scope.
- No database schema migration and no changes to Google synchronization or import/export
  semantics.
- Schedule headings, week ranges, chart axes, mini-month labels, timestamps, and prose keep
  their purpose-specific formats.
- No React component tests and no new UI dependency.

## Design direction

The page uses Planner's existing paper-and-instrument vocabulary: ruled surfaces, Archivo
for headings and controls, Plex Mono for samples and stored-value previews, and the existing
selection edge as a physical index marker. The signature element is the desktop category
rail's right-edge active rule, which visually joins the selected index entry to the work
surface without introducing a new decorative palette.

## Implementation shape

Pure formatting, defensive settings parsing, preference grouping, and reset exclusion rules
live under `src/lib/**` with adjacent tests. The settings provider remains the single source
of client preference state and derives the formatter from its per-request snapshot. Server
actions only resolve the user and delegate to user-scoped mutations.

The legacy reset-all route was removed as part of the implementation. Every module or global
reset now supplies an explicit scope list to the one user-scoped batch mutation, so no second
path can accidentally delete saved-view catalogues or their owned settings.

## Status

Closed 2026-08-09 after the full unit/integration suite, lint, typecheck, production build,
23-route smoke pass, and desktop/phone browser acceptance. See `plan.md` for the final code
map, verification evidence, and the material change from the original plan.
