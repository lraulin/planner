# Stay on FullCalendar 6 — Shaping Notes

**Status: active**

## Scope

Record the decision not to migrate to FullCalendar 7 yet, and stop the major from arriving
weekly as a PR that cannot be merged. One change to `.github/dependabot.yml`, plus this spec.

### Out of scope

- **The migration itself.** Deferred with a named trigger, not declined forever. See
  Follow-ups in `plan.md`.
- **Retiring `contrastText()`.** v7's `contrastColor` would replace it at the FullCalendar
  boundary, but `contrastText()` is correct on v6, has unit tests, and `globals.css` comments
  reference it. Recorded as part of the future migration.
- **Any change under `src/`.** None is needed and none should be made.
- **The three other open majors** — #8 vitest 3→4, #9 eslint 9→10, #10 typescript 5→7. Each
  is a separate decision with a separate blast radius. Bundling them here would hide three
  judgements behind one.
- **Changing the `fullcalendar` group** added in `aed4d96`. It stays, covering `major`, so
  lifting the pin is a deletion.

## Decisions

- **Pin v6, do not migrate.** The deciding fact is a registry fact, not a taste call:
  `@fullcalendar/timegrid`, `daygrid` and `interaction` have no stable 7. FullCalendar 7 moved
  them into `@fullcalendar/react` subpaths and made `@fullcalendar/core` types-only. A major
  whose own plugin packages are still at rc is not a bump anyone should be taking on a
  personal project's most interaction-heavy screen.
- **The cost is in the CSS, which is why this is not mechanical.** The type errors are the
  visible part and the easy part. `src/app/globals.css` lines 329–516 — about 185 lines —
  drive FullCalendar through `--fc-*` custom properties and `.fc-*` class names, all of which
  v7's new `skeleton.css` + themes system rewrote. Nothing typechecks CSS, this repo writes no
  React component tests by policy, so every one of those lines would be verified by eye.
- **Name the trigger.** `@fullcalendar/timegrid@7` reaching `latest`, or a v6 advisory. Both
  are checkable in one command, which is the point — a pin nobody can test is a pin nobody
  revisits.
- **`ignore` rather than a version lock in `package.json`.** The dependency is already pinned
  by the lockfile; what needed stopping was the _PR_. `ignore` says so at the layer that opens
  PRs, and says why, where the next person to wonder will look.

## Context

- **Visuals:** None.
- **Evidence gathered during shaping:**
  - `npm view @fullcalendar/{timegrid,daygrid,interaction,list,multimonth} version` → all
    `6.1.21`. Their 7.x line stops at `7.0.0-rc.0`.
  - `@fullcalendar/core@7.0.2`'s own `package.json` describes it as "FullCalendar core types
    package", peering on `@full-ui/headless-calendar@7.0.2` and `temporal-polyfill@^1.0.1`.
  - `@fullcalendar/react@7.0.2` ships `timegrid.js`, `daygrid.js`, `interaction.js`,
    `list.js`, `multimonth.js` as subpath entrypoints, plus `skeleton.css` and five themes
    (`breezy`, `classic`, `forma`, `monarch`, `pulse`).
  - v7's `EventImpl` exposes `color` and `contrastColor`; `backgroundColor`, `borderColor` and
    `textColor` are gone.
  - `npm audit` → 7 vulnerabilities, none in `@fullcalendar/*`. No security pressure.
  - Four files import FullCalendar: `WeekCalendar.tsx`, `TimeChartEditorView.tsx`,
    `ProjectsRail.tsx`, `ScheduleBlocksStep.tsx`.
- **References:** see `references.md`.
- **Product alignment:** N/A — infrastructure. No roadmap item expected, consistent with
  `2026-08-27-0736-pull-request-ci`.

## Standards Applied

See `standards.md`. In short: `development/security.md` because declining a dependency upgrade
is a security-relevant choice and needs a stated trigger rather than an indefinite pause;
`development/commits.md` because the config change and its reasoning have to survive in the
record.
