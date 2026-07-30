# Fitness Strength Log — Shaping Notes

**Status: active**

## Scope

Phase 3 Fitness tracker **short-term MVP**: strength training log integrated with the
planner without making workout history hostage to the outline lifecycle.

1. **Exercise catalog** — named lifts (Bench Press, Squat, …).
2. **Session log** — one gym visit can hold many exercises, each with ordered sets
   (reps × weight × unit).
3. **Fitness tab** — primary place to log and review history.
4. **Outline presence** — ordinary **tasks** optionally linked to an exercise
   (`task_details.exerciseId`), so “Bench Press” can sit under a goal/project for planning.
   Cancelling or deleting that task does not erase history.

### Out of scope

- Cardio / runs
- Routines / “Push Day” templates as first-class entities
- Task or appointment recurrence for training schedules
- Apple Health / wearables
- Progressive overload charts, periodization, bodyweight tracking
- Auto Actual Effort from workout duration (time-tracking track)
- Agent tools for fitness
- Soft-delete / recycle bin for sessions
- A fifth `node_type` for workouts

## Decisions

- **Three concepts, three lifetimes.** Exercise (catalog), plan reminder (task linked to
  exercise), session log (what you did). “Bench Press as a recurring task” conflates them;
  only the log is sacred.
- **Notes-class domain, not hierarchy.** Own tables; never cascade from `nodes`. Same
  durability idea as `notes.nodeId` → set null.
- **Not goal metrics.** Metrics are one value per date under a goal and cascade-delete with
  the goal. Wrong shape and wrong ownership for multi-set history.
- **Not a fifth `node_type`.** History rows have no priority/effort/state; plan reminders
  already fit **task**. New types leak into every tree consumer.
- **Outline grain = exercise.** One task per lift you program (Bench Press under Strength),
  not one task per gym visit. Sessions are multi-exercise visits in the Fitness tab.
- **Session owns ordered exercises and sets.** Standard lifting-log model.
- **Exercise delete blocked when history exists** (or omitted in MVP). Prefer rename over
  wiping volume history.
- **Task form does not become the set editor.** Link + last activity + deep-link to log.

## Context

- **Visuals:** None — no reference fitness app; product is planner-native.
- **References:** Notes module (durability + tab), `task_details` extension pattern, roadmap
  Phase 3 Fitness, goal `metric` / `progress_entry` as contrast.
- **Product alignment:** `roadmap.md` — Fitness MVP is a separate module that links into
  nodes/goals; short-term is sets/reps log only.

## Standards Applied

- **development/testing** — pure logic + integration with cross-user isolation
- **database/migrations** — generate with snapshot; no orphan journal entries
- **components/ux-principles**, **drawer-pattern**, **modal-pattern** — Fitness UI
