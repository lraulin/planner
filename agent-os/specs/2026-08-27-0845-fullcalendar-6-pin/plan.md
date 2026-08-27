# Stay on FullCalendar 6

**Status: frozen / complete (2026-08-27)**  
Spec folder: `agent-os/specs/2026-08-27-0845-fullcalendar-6-pin/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1316-security-hardening-and-standard/` — decision 5
  made Dependabot the dependency-drift gate. That stands. This adds the first deliberate
  exception to it, and states the condition that ends the exception.
- **Extends:** `agent-os/specs/2026-08-27-0736-pull-request-ci/` (frozen 2026-08-27) — CI on
  pull requests produced the evidence for this decision. The `fullcalendar` group added to
  `.github/dependabot.yml` in `aed4d96` is the other half of the change made here.

## Context

PR #5 (`@fullcalendar/react` 6.1.21 → 7.0.2) failed CI and Vercel repeatedly, and **cannot be
made to pass as opened**. It is not a bump. FullCalendar 7 is a repackaging:

- `@fullcalendar/timegrid`, `@fullcalendar/daygrid` and `@fullcalendar/interaction` have **no
  stable v7**. They stop at `7.0.0-rc.0`; `latest` on all three is still `6.1.21`. In v7 they
  ship as subpath entrypoints of `@fullcalendar/react` — `/timegrid`, `/daygrid`,
  `/interaction`.
- `@fullcalendar/core@7` is a **types-only** package, peering on `@full-ui/headless-calendar`
  and `temporal-polyfill`.

The migration therefore means _removing_ four dependencies and adding a new required peer,
which Dependabot has no way to express. Every error in PR #5's build is react 7 typechecked
against core 6 — `EventImpl is missing backgroundColor, borderColor, textColor, classNames` —
which is an artefact of the half-bump, not a description of the work.

The work itself, measured against the four files that import FullCalendar:

| Surface               | What changes                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imports, 4 components | Plugin packages become `@fullcalendar/react/*` subpaths                                                                                                                               |
| Event colors          | `EventImpl` collapsed `backgroundColor` / `borderColor` / `textColor` into `color` + **`contrastColor`** — which is what `contrastText()` hand-computes at 3 sites                    |
| Callback types        | `DateSelectArg`→`DateSelectInfo`, `EventClickArg`→`EventClickInfo`, `EventDropArg`→`EventDropInfo`, `EventResizeDoneArg`→`EventResizeDoneInfo`, `EventReceiveArg`→`EventReceiveInfo`  |
| Ref type              | `useRef<FullCalendar>` becomes the exported `CalendarRef`                                                                                                                             |
| **Styling**           | react@7 ships `skeleton.css` and five themes; v6 injected its own. **~185 lines of `src/app/globals.css` (329–516) target v6 internals** — `--fc-*` variables and `.fc-*` class names |

The last row is why this is not a mechanical migration. Nothing typechecks CSS, this repo
writes no React component tests by policy (`development/testing.md`), and the affected screens
are the two most interaction-heavy in the app: drag, resize, external drop from `ProjectsRail`,
and the `contextmenu` hit-test that `2026-08-06-1506-right-click-completion` built directly on
FullCalendar's overlapping-table DOM. Verification would be entirely manual browser work with
no tripwire underneath it.

Against that: v6.1.21 works, is what ships today, and carries **no advisory** — `npm audit`
reports 7 vulnerabilities, none in `@fullcalendar/*`. v7.0.2 is days old, `7.1.0-alpha.0` is
already published, and v7's own plugin packages are not stable yet.

## Decisions

- **Pin, do not migrate.** A dependency whose plugin packages have not caught up to its own
  major is not ready, and the cost here concentrates in the one layer nothing can verify
  automatically.
- **Name the trigger, not a date.** The pin lifts when the plugin packages ship a stable 7
  (`@fullcalendar/timegrid@7` on `latest`), or immediately if a v6 advisory lands. A pin with
  no exit condition is how a dependency rots quietly.
- **`ignore` the major, keep the group.** `aed4d96` grouped `@fullcalendar/*` so the five move
  together; `ignore` stops the major arriving at all. The group keeps covering `major` so
  lifting the pin is a deletion, not a re-derivation of why grouping was needed.
- **`contrastText()` stays.** It has unit tests, and comments in `globals.css` depend on it.
  That v7's `contrastColor` would retire it at the FullCalendar boundary is recorded as a note
  for the future migration, not work now.
- **No code changes.** This touches `.github/dependabot.yml` and this spec folder. Nothing
  under `src/`.

## Acceptance criteria

- [x] `.github/dependabot.yml` ignores `version-update:semver-major` for `@fullcalendar/*`,
      with the reason and the lift-trigger in a comment
- [x] PR #5 is closed — done by Lee on 2026-08-27, before Task 2 landed
- [x] No new `@fullcalendar` major PR opens on the next Dependabot run — verified from the
      parsed config rather than an observed run (see Changes row 1); `gh pr list` on
      2026-08-27 shows only #8, #9 and #10, no `@fullcalendar`
- [x] Minor and patch `@fullcalendar` updates still arrive, grouped — the `ignore` must not
      silence a 6.1.22. `npx js-yaml .github/dependabot.yml` shows the sole `ignore` entry
      scoped to `["version-update:semver-major"]`, with the `fullcalendar` group untouched
- [x] `npm run lint`, `npm run typecheck` and `npm test` are unaffected, there being no
      `src/` change — all green, 918 tests in 55 files including the integration project

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                             | Why                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The two run-dependent acceptance criteria are verified from the parsed config, not from an observed Dependabot run | Dependabot runs weekly and has no supported manual trigger from the CLI. Waiting a week to freeze would leave an active spec sitting on a one-line diff. `js-yaml` proves the `ignore` is major-only and the group intact. |
| 2   | The `ignore` block sits after `groups` rather than beside it                                                       | Both are top-level keys of the same `updates` entry, so "beside" was satisfied either way; trailing keeps the group's own comment adjacent to the group it explains.                                                       |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-27-0845-fullcalendar-6-pin/` with `plan.md` (this plan,
**Status: active**), `shape.md`, `standards.md` (pinned at standards commit `91b94c6`),
`references.md`. No visuals.

`references.md` carries the registry facts in full. They are the evidence for the whole
decision and the first thing to re-check when revisiting it.

## Task 2: Ignore the FullCalendar major in Dependabot

Add to `.github/dependabot.yml`, beside the `fullcalendar` group from `aed4d96`:

```yaml
ignore:
  - dependency-name: "@fullcalendar/*"
    update-types: ["version-update:semver-major"]
```

The comment states the two facts that justify it — the plugin packages have no stable 7, and
v7 is a repackaging rather than a bump — and the condition that lifts it: delete this when
`@fullcalendar/timegrid@7` reaches `latest`.

Check afterwards that the `ignore` did not swallow minor/patch: `@fullcalendar` 6.1.22 must
still be able to open as a grouped PR.

## Task 3: Close PR #5 — **done 2026-08-27**

Closed by Lee during shaping. Nothing left to do.

The reason is kept here beside the decision: react 7 against core 6 cannot typecheck, and the
real migration requires dropping four packages, which Dependabot has no way to express.
Reopening #5 would not help — the migration, when it happens, is a fresh branch against
whatever `master` looks like when the trigger fires.

## Task 4: Verify and freeze

- Confirm each acceptance criterion, including the negative one: `@fullcalendar` minor/patch
  still groups and still opens
- Complete **Changes from original plan**
- Mark `plan.md` and `shape.md` **Status: frozen / complete** (date)
- Roadmap: N/A — infrastructure, consistent with how `2026-08-27-0736-pull-request-ci` handled
  the same question

## Follow-ups (new work — not amendments to this spec)

**The FullCalendar 7 migration**, when the trigger fires. Shaped fresh; the surface table in
Context is the starting inventory. It should also cover retiring `contrastText()` at the
FullCalendar boundary in favour of `contrastColor`, and re-verifying the `contextmenu`
hit-test from `2026-08-06-1506-right-click-completion` against v7's DOM — that decision reads
FullCalendar's internal table structure through `document.elementsFromPoint`, and v7 rewrote
the rendering.

**Three unrelated majors, all failing CI as of 2026-08-27** — #8 vitest 3→4, #9 eslint 9→10,
#10 typescript 5→7. Each is its own decision; none belongs in this spec.

## Verification

```bash
# Task 2 — the config parses and the ignore is scoped to majors only:
npx js-yaml .github/dependabot.yml

# The evidence, re-checkable at any time:
npm view @fullcalendar/timegrid version                            # 6.1.21 → pin still justified
npm view @fullcalendar/timegrid versions --json | grep '"7\.'      # rc only → not ready

# Negative criterion, after the next Dependabot run:
gh pr list --state open      # no @fullcalendar major
```

---

**Standing rule while this spec is active:** when a material change to requirements, design, or
scope arrives (including feedback on what was implemented), update the relevant sections above
and append a row to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
