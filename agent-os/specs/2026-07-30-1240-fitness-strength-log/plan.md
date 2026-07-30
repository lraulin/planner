# Fitness Tracker MVP — Strength Log + Outline Presence

**Status: active**  
Spec folder: `agent-os/specs/2026-07-30-1240-fitness-strength-log/`

## Context

Phase 3 “Beyond Achieve” already names a **Fitness tracker** in `agent-os/product/roadmap.md`:

- **Short-term MVP:** Record sets/reps (simple log, no platform integrations).
- **Medium-term:** Link workouts/habits to Goals / Result Areas.
- **Long-term:** Optional Apple Health import (read-only).

Product guidance: fitness and finance MVPs should stay **separate modules that link into nodes/goals**, not a second hierarchy.

Lee wants workouts integrated into the planner — ideally something that can sit under a project/goal, be completed/cancelled like work, and still **never lose training history** when an exercise is dropped from the regular plan. Goal **metrics** (`node_items` kind `metric` / `progress_entry`) are a useful _inspiration_ (dated measurements under a goal) but are the wrong store: one metric row is one date + one value, and **deleting a goal hard-deletes its `node_items` via cascade**. That is the opposite of “history is sacred.”

### What exists today (constraints)

| Area              | Reality                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| Hierarchy         | `nodes` + 1:1 `*_details`; types: result_area, goal, project, task only                 |
| Task complete     | In-place `state` / `completedAt` — **no instance history**                              |
| Task recurrence   | **Does not exist** (appointment recurrence only, virtual expansion)                     |
| Delete            | Hard delete; children + detail + `node_items` cascade                                   |
| Durable side data | **Notes** pattern: own table, `nodeId` → `nodes` **on delete set null**                 |
| Goal metrics      | Sparse `node_items`; cascade with parent — fine for goal journaling, not a training log |

---

## Recommendation (the design)

### Split three concepts that “Bench Press as a recurring task” conflates

| Concept           | What it is                                                     | Lifetime                                                    |
| ----------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| **Exercise**      | Catalog entry: “Bench Press”                                   | Long-lived; rename ok; rarely deleted                       |
| **Plan reminder** | Outline **task** linked to that exercise, under a goal/project | Cancellable, postponable, deletable without killing history |
| **Session log**   | What you _did_ on a date (multi-exercise visit, ordered sets)  | Durable; only deleted when you explicitly delete a bad log  |

This is the notes-style split: **planning surface in the Achieve tree; history in its own domain.**

### Why not “workout is just a special task” alone

- Completing a task mutates one row; it does not append a dated multi-set record.
- Tasks have no recurrence yet; “recurring Bench Press” is not a free feature of the task model.
- Hard-deleting the task (or a parent project) would cascade anything stored _on_ the node.
- Putting sets/reps on the task form answers “what’s the prescription?” not “what did I lift every Tuesday for six months?”

### Why not a fifth `node_type` (`workout`)

Same reason notes avoided it: a new type leaks into hierarchy rules, grids, filters, rollups, agent tools, and capture. Workout **history rows** do not have priority/effort/state. Outline **reminders** already fit **task**.

### Why metrics are close but wrong

Metrics = one measurement per entry, owned by a goal, **cascade-deleted**. A lift session needs many set rows per date and must outlive outline reorgs.

---

## Data model (MVP)

```
exercises                          # catalog
  id, userId
  name                             # "Bench Press"
  notes (text, default "")
  createdAt, updatedAt
  unique (userId, lower(name)) optional later; start without if rename UX is simpler

workout_sessions                   # one gym visit (or one log entry)
  id, userId
  performedAt (timestamptz)        # when you trained
  title (text, default "")         # optional "Push" / free label
  notes (text, default "")
  durationMinutes (int, nullable)
  createdAt, updatedAt
  -- NO required FK to a node. History stands alone.

workout_session_exercises          # ordered exercises within a session
  id, userId, sessionId → cascade on session delete
  exerciseId → exercises           # RESTRICT or soft-block delete if referenced
  sortKey / position
  notes (optional per-exercise note that day)

workout_sets                       # ordered sets under a session-exercise
  id, userId, sessionExerciseId → cascade
  setIndex (int)
  reps (int, nullable)             # allow empty while drafting?
  weight (numeric, nullable)       # bodyweight / skipped weight ok
  unit (text, default "lb")        # lb | kg for now; free text or small enum
  completed (bool, default true)
  rpe (numeric, nullable)          # optional; can ship later if we want thinner MVP
```

**Ownership / delete rules (the load-bearing invariant):**

1. Deleting a **node** (task/project/goal) **never** deletes sessions, sets, or exercises.
2. Optional links use **`onDelete: set null`** (notes pattern), never cascade.
3. Deleting a **session** (with confirm) deletes its exercises/sets only — the intentional “erroneous log” path.
4. Deleting an **exercise** that has history: **block** (or archive flag) in MVP — do not silently wipe volume history. Prefer rename / “archived” later over hard delete of used exercises.

### Outline link (exercise ↔ task)

Add optional FK on **task** side (not session-owned-by-task):

```
task_details.exerciseId → exercises.id  ON DELETE SET NULL
```

Semantics:

- Task “Bench Press” under Health → Strength project has `exerciseId` set → it is a **workout reminder / plan row**.
- Multiple tasks could theoretically point at the same exercise (unusual); one exercise may have zero or one “primary” plan task over time.
- Completing or cancelling the task only changes plan state; Fitness history is queried by `exerciseId` / session dates.
- Deleting the task nulls nothing on sessions; `task_details` row goes away with the task, but `exercises` + all sessions remain.

Optional reverse convenience (not required for MVP correctness): store nothing else; reverse lookup is `tasks where exerciseId = X`.

**Session ↔ task link:** not required for MVP if exercise-level history is enough. Add later only if you need “this log was for _this_ occurrence of the plan.” Prefer avoiding it until task recurrence exists.

---

## Product UX (MVP)

### Fitness tab (`/fitness`)

Primary surface for:

1. **Log session** (fast path) — pick date, add exercises, enter sets (reps × weight), save.
2. **History** — list of sessions (date, title, exercise summary).
3. **Exercises** — catalog CRUD (create on the fly when logging if name is new).
4. **Exercise detail** — history of that lift across sessions (simple chronological; PRs can wait).

Patterns to mirror: Notes tab (own domain + `TabStrip`), detail drawers, `ConfirmDialog` for destructive actions.

### Outline / Task form

- Normal task can be linked to an exercise (combobox: pick or create exercise).
- When linked: show a compact **Fitness** strip — last session summary + “Log workout” deep-link to `/fitness?exercise=<id>` or open log drawer pre-seeded with that exercise.
- No full set editor jammed into the task form in MVP (keeps forms from becoming a second logger).

### Stopping an exercise regularly

- Cancel / postpone / complete the **task**, or unlink `exerciseId`.
- History remains under Fitness → that exercise.
- No need for soft-delete of tasks for history safety.

### Out of scope (this slice)

- Cardio / runs
- Routines / “Push Day” templates as first-class entities
- Task or appointment recurrence for “every Mon/Wed/Fri”
- Apple Health / wearables
- Progressive overload charts, periodization, bodyweight tracking
- Auto-writing Actual Effort from workout duration (time-tracking track owns that)
- Agent tools for fitness (can follow once schema is stable)
- Soft-delete / recycle bin for sessions (hard delete + confirm only)

---

## Alternatives considered

| Approach                                 | Verdict                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sets stored as `node_items` under a task | Cascade death; wrong shape; outline pollution with set rows                                                                                              |
| Session rows as child tasks              | Complete-in-place lifecycle; no multi-set structure; hierarchy mess                                                                                      |
| Workout = fifth `node_type`              | Leaks into every tree consumer; history still needs a log                                                                                                |
| Metrics for weight                       | One value/date; cascade; no multi-set                                                                                                                    |
| Appointments as gym blocks               | Good for _time on calendar_; terrible for sets/reps history                                                                                              |
| Pure Fitness tab, zero outline link      | Valid thinner MVP, but Lee wants plan presence under goals/projects — exercise-linked tasks are cheap and match “special task” intent without a new type |

---

## Acceptance criteria

- [x] Fitness tab reachable; exercises + sessions + sets can be created and reviewed.
- [x] A session can contain multiple exercises, each with ordered sets (reps + weight + unit).
- [x] Deleting a linked task/project/goal **does not** delete exercises or any session history.
- [x] Explicit session delete requires confirmation and only then removes that session’s sets.
- [x] A task can link to an exercise; task drawer shows last activity + path to log more.
- [x] Cross-user isolation: second user cannot read/change/delete first user’s fitness rows.
- [x] Logic in `src/lib/fitness/**` with unit + integration tests; no React component tests.
- [x] typecheck, lint, unit tests green; integration tests run when Postgres is up.

## Changes from original plan

| #   | Change                                                                                      | Why                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Migration `0009` applied manually after drizzle-kit reported success without writing tables | Journal `when` for 0009 was earlier than 0008; fixed timestamp ordering |
| 2   | Session editor **autosaves** (notes-style debounce); Done closes instead of Save/Cancel     | Gym logging is one set at a time — explicit Save-and-close was wrong    |
| 3   | Per-set delete; **Add set** copies previous set’s reps/weight/unit                          | Straight sets are the default; typo’d sets need a one-click remove      |
| 4   | New exercise blocks start with one empty set row (not three blanks)                         | Copy-forward makes pre-filling empty rows pointless                     |
| 5   | Plate calculator under each weight (US Olympic bar + American plates; metric when unit=kg)  | Load the bar without leaving the log                                    |
| 6   | “Last time: …” ghost under each exercise (excludes open session)                            | See prior work set without opening history                              |
| 7   | Bodyweight exercise toggle → unit `bw`, null weight, no weight column                       | Pull-ups etc. without logging 0 lb                                      |
| 8   | Weight −/+ steppers: 5 lb / 2.5 kg                                                          | Match American plate pairs; kg ~equivalent                              |
| 9   | Catalog prefs: `bodyweight` + `barWeight` (lb); EZ 15, Olympic 45, training 35, 0=no bar    | Remember pull-ups vs curls / bar for plate math                         |
| 10  | “Last time … tap to copy” fills current sets from prior session                             | Start warm-up/work sets from last log                                   |
| 11  | Sticky rest timer (presets 1–3m, ±15, beep); auto-starts on + Add set                       | Between-set rest without leaving the drawer                             |
| 12  | Migration `0010` adds exercise bodyweight + bar_weight                                      | Durable prefs                                                           |

---

## Implementation tasks

### Task 1: Save spec documentation

Create `agent-os/specs/2026-07-30-1240-fitness-strength-log/` with:

- `plan.md` — this plan (**Status: active**), empty **Changes from original plan**
- `shape.md` — scope, decisions, product alignment, out of scope
- `standards.md` — testing, migrations, drawer/ux, response-format if any agent API later (likely N/A for MVP)
- `references.md` — notes module, task_details pattern, roadmap fitness section, goal metrics contrast
- `visuals/` — none for now (no reference app)

While the spec is **active**, material requirement/design/scope changes update this folder and **Changes from original plan**.

### Task 2: Schema + migration

- Add `exercises`, `workout_sessions`, `workout_session_exercises`, `workout_sets` to `src/db/schema.ts`.
- Add optional `task_details.exerciseId` → `exercises` **on delete set null**.
- Migration via project standard (`agent-os/standards/database/migrations.md`); if snapshot drift forces hand-written SQL, follow notes/inbox precedent.
- Indexes: `(userId)` on all; `(userId, performedAt desc)` on sessions; `(sessionId, sort)`; `(exerciseId)` for history by lift; `(userId, name)` on exercises.

### Task 3: Domain library (`src/lib/fitness/`)

Pure mutations/queries (all take `userId`):

- Exercises: create, rename, list, get (block delete if referenced, or omit delete in MVP)
- Sessions: create with nested exercises/sets; update; delete (scoped); list; get detail
- History by exercise
- Link helpers: tasks by exerciseId (optional query)

Tests:

- Unit: any pure normalizers (weight parsing, set ordering)
- Integration: happy path log; **second user isolation on every mutation**; delete task with `exerciseId` leaves sessions; delete session removes sets only; cannot touch other user’s rows

### Task 4: Fitness tab UI

- `src/app/fitness/page.tsx` + server actions thin wrappers
- TabStrip entry **Fitness**
- Grid or list of recent sessions + exercise library
- Session drawer/editor: multi-exercise, multi-set entry (keyboard-friendly; match planner density)
- Confirm before session delete

### Task 5: Fast log flow

- “Log session” primary action: default `performedAt = now`, add exercise (search/create), enter sets, save
- Deep link `/fitness?log=1&exercise=<id>` for task drawer CTA
- Creating an unknown exercise name from the log creates the catalog row

### Task 6: Outline / task integration

- `task_details.exerciseId` in detail load/save allowlists
- Task form: Exercise link field + Fitness panel (last session + Log)
- No hierarchy rule changes; linked tasks remain ordinary tasks for priority/state/deadline

### Task 7: Verify, freeze, roadmap

- Manual smoke: log a multi-lift session; link Bench task under a goal; cancel task; confirm history still in Fitness; delete session only with confirm
- Update spec to as-built; freeze when verified
- Roadmap: mark Fitness short-term MVP delivered (or partial if we ship without polish)

---

## Standards to apply

- `development/testing` — lib tests + integration cross-user; no component tests
- `database/migrations` — generate or hand-write with journal discipline
- `components/ux-principles` + `drawer-pattern` + `modal-pattern` — Fitness UI
- Agent API standards — **out** until a follow-up adds tools

## References in-repo

- Notes durability: `src/db/schema.ts` (`notes.nodeId` set null); `specs/2026-07-29-1045-notes-markdown-editor/`
- Task details extension: `task_details`, `src/lib/detail/*`, `TaskForm.tsx`
- Goal metrics (anti-pattern for this): `node_items` kinds `metric`, `progress_entry`
- Roadmap: `agent-os/product/roadmap.md` → Phase 3 Fitness tracker
- Delete semantics: `src/lib/tree/mutations.ts` → `deleteNode`

---

## Design answer in one paragraph

**Best approach:** treat fitness as a **Notes-class domain** (exercise catalog + multi-exercise session log with sets) and treat outline presence as an **ordinary task linked to an exercise** — the “special task type” is a flag/FK, not a new hierarchy type and not the system of record for what you lifted. Cancel or delete the plan row whenever you stop programming Bench Press; the log remains until you intentionally delete a mistaken session. That matches the roadmap (“module that links into nodes”), matches existing durability patterns, and avoids fighting task complete-in-place and missing task recurrence.

---

## Ready for execution

When approved:

1. Task 1 saves the agent-os spec folder (**Status: active**).
2. Implementation proceeds Tasks 2–6; keep the active spec current for material refinements.
3. Task 7 freezes the spec and updates the roadmap.

**Suggested first code step after Task 1:** schema + `src/lib/fitness` mutations with the cascade/set-null integration tests that encode the history invariant — those tests are the product requirement in executable form.
