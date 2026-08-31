# Standards for Repeat last titled workout

Applied as of standards commit `91999a0ab88ec727956924e702f589a4a5833395`. References, not
copies — see AGENTS.md.

- `agent-os/standards/development/testing.md` — copy, current-set pointer, title matching, and the completed flag live in `src/lib/fitness/**` with adjacent unit tests; new queries/mutations get integration tests including a second user who fails to read, copy, or start the first user’s session. No React component tests. Check the DB tests did not skip.
- `agent-os/standards/development/security.md` — every mutation and the new title/copy queries take `userId` and prove ownership; register new reads in `src/lib/db/crossUserReads.integration.test.ts`.
- `agent-os/standards/database/migrations.md` — change `workout_sets.completed` default via `db:generate`; commit `.sql`, snapshot, and journal together; no backfill of existing history.
- `agent-os/standards/components/responsive.md` — gym is one-handed on the phone; 44px complete control (`--tap-target`); do not override the ≥16px input rule below `md`.
- `agent-os/standards/components/ux-principles.md` — completion is an explicit tap (error prevention); inline editing; no modal maze to log a set; current set must be obvious without guessing.
- `agent-os/standards/components/drawer-pattern.md` — stay in the existing autosaving session drawer; do not add a second live-workout UI; Done still closes after flush.
- `agent-os/standards/components/navigation.md` — `fitness.log-session` stays; add `fitness.start-last-session` to the New menu (a command without a menu is not shipped). Title cards are data on the sessions page, not one command per title. Unavailable Start last is disabled with the reason, never absent.
- `agent-os/standards/development/clean-code.md` — `planDraftFromDetail`, current-set, and title match belong in `src/lib/fitness`, not `SessionEditor`; `actions.ts` stays a thin `run()` wrapper; no speculative routine table.
- `agent-os/standards/development/commits.md` — one logical change per commit; effect-naming subject; Spec trailer pointing at this folder.

## Deviations

None.
