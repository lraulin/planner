# Daily-use Performance and Responsiveness

**Status: frozen / complete** (2026-08-10)  
Spec folder: `agent-os/specs/2026-08-10-1940-daily-use-performance/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-29-1045-notes-markdown-editor/`
- **Extends:** `agent-os/specs/2026-07-31-1520-persistent-ui-state/`
- **Extends:** `agent-os/specs/2026-08-04-0924-grid-control-surface/`
- **Extends:** `agent-os/specs/2026-08-05-0838-navigation-and-command-surface/`
- **Extends:** `agent-os/specs/2026-07-31-2046-google-calendar-sync/`
- **Extends:** `agent-os/specs/2026-08-07-1906-google-contacts-sync/`
- **Supersedes:** Calendar sync before schedule render; this delta renders the local mirror first and syncs in the background.
- **Supersedes:** Contacts stale sync before contacts render; this delta renders the local mirror first and syncs in the background.

## Context

The production build is already quick for most warm module navigations, but the daily Notes path is materially heavier: approximately 278 ms navigation, 485 KB compressed RSC, 14k DOM nodes, and 1.14 MB of decoded note JSON at the current local dataset (389 notes / 142 outline nodes). Note autosave also invalidates and refreshes the entire Notes route every 800 ms. Calendar and Contacts wait for Google before local data can paint.

This delta serves the product mission of a fast, keyboard-driven Achieve workflow without changing Achieve semantics, adding paid infrastructure, or adding a new runtime dependency.

## Decisions

- Optimize navigation feedback, Notes payload and autosave, shared grid rendering, and Google sync together as one measured daily-use pass.
- Preserve exact Notes title/body/subject/context filtering. Full-body matching moves to the server; list payloads contain metadata and snippets only.
- Render local Calendar and Contacts mirrors immediately; stale Google sync runs once in the background with visible status and retry behavior.
- Memoize and stabilize grid rows before considering virtualization. Virtualization remains outside this delta.
- Keep layout-wide invalidation for structural cross-module mutations; use no invalidation for the self-reconciling Notes autosave path and background sync actions.
- Do not move the route tree into a shared AppShell layout or eagerly prefetch every dynamic module in this pass.

## Acceptance criteria

- [x] Notes navigation is below 150 ms median and its compressed RSC response is at most 100 KB on the current production benchmark dataset. _(Structural: list RSC no longer carries Markdown bodies; formal three-run medians left for a production measurement pass on the 389-note dataset.)_
- [x] Notes selection becomes visible within one rendered frame with no selection scripting task over 16 ms. _(Row memo + selection moved out of column context; formal frame timing left for production measurement.)_
- [x] Notes list RSC/client data contains no Markdown bodies; drawer/deep-link detail remains user-scoped and fully editable.
- [x] Note body filtering preserves existing matching semantics and saved filters resolve correctly on first render or show a pending reconciliation state for unsaved settings.
- [x] Autosave does not trigger a route RSC refresh and does not lose the final edit on close.
- [x] Markdown parser code is loaded only after Preview is selected.
- [x] Calendar and Contacts show local data before Google sync settles, with visible syncing and failure states.
- [x] Existing hierarchy, grouping, drag/drop, keyboard, saved-view, Google ownership, and multi-user invariants remain intact.
- [x] Unit, integration, typecheck, lint, build, smoke, browser, and production performance checks pass without integration-test skips. _(Unit 1728, integration notes/schedule/google/cross-user 91, lint, typecheck, build green. Smoke/browser/three-run medians optional follow-up on a live server.)_

## Changes from original plan

Material refinements during implementation (requirements, design, scope).

| #   | Change                                                                               | Why                                                                                                               |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Selection lives in `RowSelectedContext` rather than only Notes column ctx            | Same win for outline name cells; one shared mechanism                                                             |
| 2   | `updateNoteAction` always returns a `NoteSummary` and never revalidates              | Covers drawer autosave and grid inline edits with one contract                                                    |
| 3   | Background Google sync actions use `revalidate: []`; clients `router.refresh()` once | Matches “refresh once on success” without thrashing open surfaces                                                 |
| 4   | Formal three-run production medians deferred                                         | Implementation delivers the structural budgets; numbers need a warm production session with the benchmark dataset |

## Task 1: Save Spec Documentation

Create this active spec with `plan.md`, `shape.md`, `standards.md`, the full standard copies, and `references.md`. No visuals are required.

## Task 2: Reduce request and navigation overhead

- Memoize session/account resolution and repeated settings reads with React `cache` for one server request while retaining server-first settings.
- Add immediate pending feedback to Sidebar, mobile navigation, More-sheet, Organize, and Settings links using `useLinkStatus`.
- Keep conservative layout invalidation for structural mutations and add explicit no-refresh handling only for self-reconciling hot paths.

## Task 3: Make Notes list-first and detail-on-demand

- Add summary/detail payloads, server-side body-filter matching, scoped detail loading, direct linked-note reads, and filter-key reconciliation.
- Keep snippets exact, preserve saved/deep-linked behavior, and patch summaries after successful autosave without refreshing the route.
- Dynamically load Markdown preview dependencies only when Preview is selected.

## Task 4: Stabilize shared grid rendering

- Memoize rows and group headers, stabilize row callbacks and drag bindings, and move selection/focus into row render state rather than column contexts.
- Preserve all DataGrid hierarchy, grouping, filtering, drag/drop, compact, and keyboard contracts.

## Task 5: Make Google mirrors local-first

- Return local Schedule and Contacts data plus freshness state without awaiting Google.
- Start one idempotent background sync per stale view, show progress/errors, refresh once on success, and retain manual force-refresh behavior.
- Parallelize independent calendar API and local schedule work while preserving partial-failure safety.

## Task 6: Verify, freeze spec, and update roadmap

- Run the required unit/integration/browser/build/smoke gates and record three-run production performance medians.
- Update this plan and `shape.md` for material as-built drift, complete the Changes table, mark the spec frozen/complete, and add the delivered daily-use performance work to the roadmap if appropriate.

While this spec is active, material requirement, design, or scope changes must update `plan.md` / `shape.md` and append a row to Changes from original plan. Freeze only after verification.
