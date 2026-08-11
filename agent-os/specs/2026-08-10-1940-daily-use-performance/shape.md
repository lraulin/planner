# Daily-use Performance and Responsiveness — Shaping Notes

**Status: frozen / complete** (2026-08-10)

## Scope

This is a measured first performance pass for daily navigation, Notes, shared grids, and Google Calendar/Contacts sync. It optimizes the current App Router architecture and preserves the existing Achieve workflow and UI-state contracts.

### Out of scope

- Virtualization, pagination, server-side sorting, or a grid-library replacement.
- Moving all planner routes into a shared route-group layout.
- New paid services, telemetry, runtime dependencies, or schema migrations.
- Changing Notes filter meaning, Markdown safety, Google ownership, or multi-user scoping.

## Decisions

- The broad daily-use pass is the chosen target, with pragmatic measurable budgets.
- Notes uses server-backed full-body matching when the active filter searches body text; list responses carry snippets and metadata, not bodies.
- Local Calendar/Contacts mirrors paint first and reconcile stale Google data in the background.
- Grid row memoization and stable identities precede any virtualization decision. Missing the budgets creates a separate measured virtualization delta rather than silently adding windowing.
- No visual mockups were provided or needed.

## Baseline

- `npm run build` passed on Next 16.2.12.
- Warm production navigation was approximately 30–120 ms for most modules and 278 ms for Overview → Notes.
- Notes transferred approximately 485 KB compressed RSC, rendered about 14k DOM nodes, and loaded 389 full note bodies.
- Direct database timing was approximately 11 ms for 389 full Notes rows, so the first target is the server-to-client payload and render path rather than a speculative schema change.
- Notes selection measured approximately 54 ms; Markdown preview contributed roughly 55 KB compressed to route bundles through an eager import.

## Product alignment

The work supports the mission’s “fast, keyboard-driven” modern UX on the existing Next.js/Postgres/Neon free-tier stack. It does not diverge from Achieve workflow semantics.

## Standards Applied

- `development/clean-code` — keep logic in `src/lib/**`, preserve layer direction, and avoid speculative abstractions.
- `development/testing` — pure logic tests beside `src/lib/**`, real Postgres integration tests with cross-user isolation, and browser verification instead of React component tests.
- `components/data-grid` — one shared grid, hierarchy-preserving operations, stable persisted state, and virtualization explicitly deferred.
- `components/ux-principles` — immediate feedback, context preservation, keyboard-first interaction, and performance as UX.
- `components/navigation` — one module/command registry, visible pending/unavailable states, and no palette-only actions.
