# Repeat last titled workout

**Status: frozen / complete** (2026-08-31)  
Spec folder: `agent-os/specs/2026-08-31-1412-fitness-repeat-from-title/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — catalog, session log, autosave drawer, history is sacred, destructive replace-rebuild. Carry forward.
- **Extends:** `agent-os/specs/2026-08-17-1238-workout-exercise-notes/` — per-exercise notes copy with the plan; session notes do not.
- **Extends:** `agent-os/specs/2026-08-20-1115-timed-isometric-exercises/` — copied sets keep duration/measure columns; current-set pointer must work on timed rows.
- **Extends:** `agent-os/specs/2026-08-20-1233-exercise-groups/` — copy groups and round-major order; blank + `completed=false` still means sat-out round; rest after a round, not after each member.
- **Extends:** `agent-os/specs/2026-08-20-1501-rest-timer-notification/` — rest is a progress cue (“resting for set N”), never a complete-set signal.
- **Supersedes:** `agent-os/specs/2026-07-30-1240-fitness-strength-log/` — (1) “Last time” is last time this exercise _anywhere_; prefer same title + same exercise, fall back to anywhere. (2) A filled set is a completed set (`completed` default true; `draftToSessionInput` sets `completed: filled[i]`). Completion is an explicit tap; prefill is a plan. (3) Empty “Log session” as the only start; titled last-session copy is the primary start.

This is the Phase 3 medium-term **routines/templates** roadmap item, delivered as “start what I did last time for this name.” No `workout_routines` table.

Achieve Planner has no fitness module; `docs/achieve-planner/` does not govern this.

## Context

Lee already logs named sessions (`Push`, `Pull`, `Legs`, …) that repeat week after week. There is no template entity. A new log still starts empty; “Last time: tap to copy” fills _this exercise’s_ last numbers from any session and, because `completed` defaults to true and saving infers done from filled fields, a copied workout looks finished before set 1.

The sentence this spec implements:

> Start what I did last time for this name, let me change anything today, and make it obvious I have not done the work yet.

History stays every actual session. The plan for a title _is_ the latest session with that title (resume if that latest session is still incomplete; otherwise copy it into a new live session with nothing checked).

## Decisions

1. **No template table.** Repeatable workout = non-empty trimmed title. Next start uses the latest session with that title. No finish keep-vs-update, no Routines tab, no folders/programs.
2. **Title match** is trim + case-insensitive. The copied session keeps the source’s stored casing. Empty titles are one-offs: they do not appear as title cards; “Start last” and per-row Start again can still copy them.
3. **Resume vs copy.** If the latest session for that title has any `completed=false` set, open it. If every set is complete, copy into a new session (new id, `performedAt = now`, planned numbers, all `completed=false`). Same rule for Start last on the global latest session. Never mutate the source session.
4. **Copy includes** exercise order, groups (label + restSeconds), set count, weights/reps/L-R/duration/unit, per-exercise notes. **Copy omits** session notes, durationMinutes, performedAt. Nothing is checked.
5. **Title combobox starts the copy.** Picking “Push” on an empty draft copies last Push. If the draft already has real work (more than the default empty block), selecting a title only sets the title string — do not wipe today’s log.
6. **Start surface** on `/fitness/sessions`: Start last; one card per distinct non-empty title (last performed, days-ago, exercise count); Empty workout (existing Log session). History list stays chronological; each row gets Start again. Start again on a _row_ operates on that session: if that row is incomplete, open it; if complete, copy it. Days-ago uses local calendar days (`localDateKey`).
7. **Three set states, not two.** Upcoming = planned, not started (muted numbers, no check). Current = first incomplete set in session order (straight: first incomplete set of the first exercise that still has one; inside a group: round-major, so A1 round 1 → A2 round 1 → A1 round 2). Done = explicit check. Opening a fully completed history session has **no** current set (reviewing history, not lifting).
8. **Completion is a tap.** Filling 185×8 does not complete. Uncheck is the same control. Rest-timer end does not complete. `+ Add set` / `+ Add round` still copy previous numbers as a _plan_ (`completed=false`). Added mid-workout sets start unchecked.
9. **Rest after complete.** Straight sets: start the existing rest timer after a check, except after the last remaining set of the session. Groups: rest only after the last member of a round is checked (existing group rule). Copy: “Resting for set N” / next exercise name. Do not start rest on `+ Add set`.
10. **Last-time hint** stays the under-block line (no Prev column this spec). Prefer last time this exercise appeared in a session with the **same title**; if none, fall back to last time anywhere (excluding the open session). Tapping it copies into _planned_ fields, nothing checked.
11. **Progress.** Sticky “{exercise} — Set N of M” plus last-time numbers; session `done / total` completed sets. A stranger opening a copied workout before set 1 must see: same plan as last time, zero work logged, set 1 waiting.
12. **Unfinished sessions save.** Autosave already does this. History labels already hide `completed=false` (`formatSetsLabel`). An abandoned copy may show “—” per exercise; that is honest (0 done). Do not invent a finish modal.
13. **Commands.** Keep `fitness.log-session` (empty). Add `fitness.start-last-session`. Title cards are data on the page, not a command per title. Both creates stay in the New menu.
14. **Schema.** `workout_sets.completed` default **false**. No backfill — existing history stays true. `DraftSet` grows `completed`. `draftToSessionInput` writes the flag, it does not infer it from `setIsFilled`. Group sat-out rounds remain blank + incomplete.

### Out of scope

- First-class routines table, Routines tab, implicit-routine detection at 3+ repeats
- Finish keep-vs-update / plan pointer / “just this time”
- Prev column per set; “copy as reference only” (empty today)
- Grouped history with one-line diffs; Start from an older version of the same title
- Named skip (skipped ≠ done stays: leave it unchecked)
- Folders, programs, sharing, auto overload, charts, scheduling
- Separate template editor
- Drag-to-reorder, Goal/Result Area fitness surfaces, Apple Health, cardio
- Agent tools for fitness

## Acceptance criteria

- [x] Starting “Push” copies the latest Push session’s structure and numbers into a **new** session with every set `completed=false`. The source row is unchanged.
- [x] If the latest Push still has an unchecked set, Start Push / title combobox / Start last **opens that session** instead of cloning it.
- [x] A copied workout at minute zero cannot be mistaken for a finished one: no checks, current set is set 1, progress is `0 / N`.
- [x] Checking a set is the only thing that marks it done; uncheck works; rest-timer end does not complete.
- [x] Completing a set auto-advances to the next current set (round-major inside a group) and starts rest except after the session’s last set / after a group member that is not the end of the round.
- [x] Title combobox lists used titles; picking one on an empty draft copies; picking one on a draft with work only sets the title.
- [x] Sessions home shows Start last, title cards with days-ago, and empty workout. History rows have Start again.
- [x] Last-time hint prefers same title + same exercise; copy lands unchecked.
- [x] Empty-title sessions are not title cards. Cross-user: a second user cannot read, copy, or start another user’s session by title or id.
- [x] Logic in `src/lib/fitness/**` with unit + integration tests; no React component tests. `npm run test:unit` and integration (Postgres up). After `src/app/fitness/**` changes: dev server + `npm run smoke`.
- [x] Phone: 44px complete control, 16px inputs (do not override the global rule), current set obvious in one second.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                          | Why                                                                                |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `SessionSummary.isIncomplete` from the sets `listSessions` already loads        | Start last and per-row Start again need resume-vs-copy without a second round trip |
| 2   | `fitnessLogPath` takes `{ from, exercise }` instead of a positional exercise id | Copy is a second query param; the catalog Log seed stays `?exercise=`              |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-31-1412-fitness-repeat-from-title/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — shaping notes (scope, decisions, context from the conversation)
- **standards.md** — which standards apply, why, and any deviations (references, not copies)
- **references.md** — governing specs and reference implementations studied
- **visuals/** — none provided; omitted

Then stop. Implementation starts in a fresh session at Task 2.

## Task 2: Explicit set completion in lib + schema

The bug is in the model, not only the paint.

- `workout_sets.completed` default `false`. Generate the migration + snapshot; do not backfill.
- `DraftSet.completed`. `emptySetForExercise` / `setFromPrevious` / `setsFromHistory` write `completed: false`. `draftFromDetail` preserves stored flags.
- `draftToSessionInput`: `completed` from the draft, **not** `filled[i]`. Keep the group rule: interior blank rounds stay in the array as incomplete (sat-out). A kept blank is still not done; a kept filled-unchecked is a plan.
- `normaliseSetInput` currently `completed: set.completed !== false` — that would mark omitted flags done. Flip to default **false** unless explicitly true, so a missing flag cannot resurrect the old inference.
- Unit tests: copied/history sets are unchecked; a filled unchecked set round-trips; group sat-out still `completed: false` and still kept; a checked set round-trips true.
- Integration: create/replace persist the flag; second user cannot flip the first user’s `completed`.

## Task 3: Current-set logging in the live editor

One editor — the existing session drawer. Do not add a second “live workout” UI.

- Pure helper (e.g. `src/lib/fitness/currentSet.ts`): given ordered blocks + groups, return the current target `{ blockIndex, setIndex }` or null if none incomplete. Round-major inside a group. Test straight, group, all-done, all-upcoming, trailing shortfall.
- `SetRow` (and group member rows): upcoming muted, current emphasized with the complete control, done checked and settled. Complete is a 44px tap, not a modal. Same control unchecks.
- Auto-advance focus to the current set after a check. Resume (opening an in-progress session) lands on the first unchecked set. A fully completed history session has no current set.
- Sticky header in the drawer: `{exercise name} — Set N of M`, last-time line, session `done/total`. Rest timer copy should read as resting for the _next_ set, not sitting on a finished list.
- Wire `restStartRef` to complete: straight sets after each check except the last remaining set of the session; groups after the last member of a round (keep `addRound`’s rest). Do **not** complete on timer end. Do **not** start rest from `+ Add set`.
- Mid-workout add set/round: new rows unchecked even when numbers copy forward.

Verify in the browser at desktop and compact: copy is not required yet — a hand-built session with unchecked sets should already answer “which set haven’t I done?” in one second.

## Task 4: Start again from last titled session

- **Queries (user-scoped):** `latestSessionByTitle(userId, title)` (trim, case-insensitive, ignore empty); `listRepeatableTitles(userId)` → `{ title, lastPerformedAt, sessionId, exerciseCount, isIncomplete }`; `sessionIsIncomplete` = any set `completed === false`. Register new reads in `crossUserReads.integration.test.ts`.
- **Pure copy:** `planDraftFromDetail(detail)` → `SessionDraft` with now as `performedAt`, source title, copied blocks/groups/notes-per-exercise, all sets unchecked, no session notes/duration. Source id discarded.
- **Start again (one function):** if the chosen session is incomplete → open `/fitness/sessions/:id`; else create from `planDraftFromDetail` (client draft + existing autosave, or server create then replace URL — either is fine if the source is untouched and the new row is all-unchecked).
- **Routes:** `fitnessLogPath({ from?: sessionId, exercise?: id })` so Start again is reload-stable. Keep `?exercise=` as the catalog “Log” seed (one block, not a full copy).
- **Title combobox** in `SessionEditor` (same interaction family as `ExercisePicker`): suggestions from `listRepeatableTitles`. Select on an empty draft → load that title’s latest via start-again. Select when the draft has work → set title only.
- **Sessions home:** Start last (disabled with reason when there are no sessions); title cards with days-ago; existing empty Log session. History list unchanged except a Start again control per row (operates on **that** session: resume if incomplete, copy if complete).
- **Commands:** `fitness.start-last-session` in New, next to Log session. Icon-button slot stays the mode’s primary — logging is still the bar button; Start last can live in the menu + on the page.
- **Last-time hint:** `loadLatestForExercise` gains optional `sessionTitle`; prefer that title, else any, still excluding the open session. Copy uses `setsFromHistory` (unchecked).
- Integration: user A’s “Push” cannot be listed, opened, or copied by user B; copying does not update the source; resume does not clone.

## Task 5: Verify, freeze spec, update roadmap

- Unit + integration (Postgres up). After route/page changes: start the app and `npm run smoke`.
- Browser, gym flow: Start Push → looks unstarted → check set 1 → current is set 2 and rest running → leave and Start Push resumes on set 2 → finish → Start Push is a new unchecked copy. Empty workout still works. History of the first Push is intact. Compact viewport: complete control tappable, no iOS zoom on inputs.
- Confirm acceptance criteria. Update plan/shape for as-built drift; fill **Changes from original plan**.
- **Status: frozen / complete** (date). Follow-ups that are new work: Prev column, copy-as-reference, keep-vs-update pointer, Routines tab, grouped history diffs, named skip.
- Update `agent-os/product/roadmap.md` Fitness medium-term: routines/templates delivered as do-again-from-history (`2026-08-31-1412-fitness-repeat-from-title`), not a template library. Goal/Result Area surfaces remain later.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
